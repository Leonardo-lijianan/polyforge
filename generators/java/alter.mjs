/**
 * 增量迁移生成器（B3）
 *
 * 目的：契约变更后，不重写 V900，而是生成 V901+__alter_generated.sql，只含 diff。
 * 真源：`.polyforge/db-schema-state.json`（上次生成时的结构化 schema，受 git 跟踪）。
 *
 * 流程（由 index.mjs 的 db 分支调用）：
 *   1. state 不存在 → 首次，调 flyway.mjs 生成 V900 + 写 state
 *   2. state 存在 → diffSchema(oldState, newIR) → 有变更就 V<next>__alter_generated.sql，写 state
 *   3. 有破坏性变更且未加 --allow-breaking → 阻断
 *
 * 版本号：扫描 outRoot 下所有 V<num>__*.sql，取 max+1。V900 是基线。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { schemaFromIR, renderCreateTable, renderCreateIndex } from './flyway.mjs'

/** 写 schema state（首次生成 V900 后调用，或每次生成 alter 后内部调用） */
export function writeDbSchemaState(ir, statePath) {
  const dir = dirname(statePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(statePath, JSON.stringify(schemaFromIR(ir), null, 2), 'utf-8')
}

/**
 * 对比两份 schema，返回变更列表。
 * 每条：{ kind, table, column?, index?, breaking, sql }
 */
export function diffSchema(oldSchema, newSchema) {
  const changes = []
  const oldTables = oldSchema.tables || {}
  const newTables = newSchema.tables || {}

  // 新增表：整表 CREATE + 索引
  for (const [table, t] of Object.entries(newTables)) {
    if (!oldTables[table]) {
      changes.push({ kind: 'table-added', table, breaking: false, sql: renderCreateTable(table, t) })
      for (const idx of t.indexes || []) {
        changes.push({ kind: 'index-added', table, index: idx.name, breaking: false, sql: renderCreateIndex(table, idx) })
      }
    }
  }

  // 删除表：破坏性
  for (const [table] of Object.entries(oldTables)) {
    if (!newTables[table]) {
      changes.push({ kind: 'table-removed', table, breaking: true, sql: 'DROP TABLE IF EXISTS ' + table + ';' })
    }
  }

  // 表内 diff
  for (const [table, newT] of Object.entries(newTables)) {
    const oldT = oldTables[table]
    if (!oldT) continue

    const oldCols = Object.fromEntries((oldT.columns || []).map((c) => [c.name, c]))
    const newCols = Object.fromEntries((newT.columns || []).map((c) => [c.name, c]))
    const oldIdx = Object.fromEntries((oldT.indexes || []).map((i) => [i.name, i]))
    const newIdx = Object.fromEntries((newT.indexes || []).map((i) => [i.name, i]))

    // 新增列。破坏性判定：
    //   NOT NULL → 老行没值，DDL 直接失败
    //   UNIQUE   → 老行全是 null 时 PG 允许（null 不参与唯一性），但一旦回填值就可能冲突
    // 两者都要人工确认，统一按破坏性处理。
    for (const [col, c] of Object.entries(newCols)) {
      if (oldCols[col]) continue
      const parts = [col, c.sqlType]
      if (!c.nullable && !c.pk) parts.push('NOT NULL')
      if (c.unique) parts.push('UNIQUE')
      changes.push({
        kind: 'column-added',
        table,
        column: col,
        breaking: (!c.nullable && !c.pk) || !!c.unique,
        sql: 'ALTER TABLE ' + table + ' ADD COLUMN ' + parts.join(' ') + ';',
      })
    }

    // 删除列：破坏性
    for (const [col] of Object.entries(oldCols)) {
      if (newCols[col]) continue
      changes.push({
        kind: 'column-removed',
        table,
        column: col,
        breaking: true,
        sql: 'ALTER TABLE ' + table + ' DROP COLUMN ' + col + ';',
      })
    }

    // 列类型 / 可空性变化
    for (const [col, newC] of Object.entries(newCols)) {
      const oldC = oldCols[col]
      if (!oldC) continue
      if (oldC.sqlType !== newC.sqlType) {
        changes.push({
          kind: 'column-type-changed',
          table,
          column: col,
          breaking: true,
          sql: 'ALTER TABLE ' + table + ' ALTER COLUMN ' + col + ' TYPE ' + newC.sqlType + ';',
        })
      }
      if (oldC.nullable && !newC.nullable) {
        changes.push({
          kind: 'column-set-not-null',
          table,
          column: col,
          breaking: true,
          sql: 'ALTER TABLE ' + table + ' ALTER COLUMN ' + col + ' SET NOT NULL;',
        })
      }
      if (!oldC.nullable && newC.nullable) {
        changes.push({
          kind: 'column-drop-not-null',
          table,
          column: col,
          breaking: false,
          sql: 'ALTER TABLE ' + table + ' ALTER COLUMN ' + col + ' DROP NOT NULL;',
        })
      }
    }

    // 索引 diff
    for (const [name, idx] of Object.entries(newIdx)) {
      if (oldIdx[name]) continue
      changes.push({
        kind: 'index-added',
        table,
        index: name,
        // UNIQUE 索引对老数据可能失败，保守视为破坏性
        breaking: !!idx.unique,
        sql: renderCreateIndex(table, idx),
      })
    }
    for (const [name] of Object.entries(oldIdx)) {
      if (newIdx[name]) continue
      changes.push({
        kind: 'index-removed',
        table,
        index: name,
        breaking: false,
        sql: 'DROP INDEX IF EXISTS ' + name + ';',
      })
    }
  }

  return changes
}

/** 扫描目录下所有 V<num>__*.sql，返回下一个可用版本号（V900 是基线） */
function nextVersion(outRoot) {
  if (!existsSync(outRoot)) return 901
  let max = 900
  for (const f of readdirSync(outRoot)) {
    const m = f.match(/^V(\d+)__/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

/**
 * 对比 state 与当前 IR，生成增量迁移文件。
 * @returns {{ changes: Array, outFile: string|null, blocked: boolean, breaking?: Array }}
 */
export function generateAlterSql(ir, outRoot, statePath, { allowBreaking = false } = {}) {
  if (!existsSync(statePath)) {
    throw new Error('generateAlterSql 需要先有 schema state: ' + statePath + '（应先跑一次 V900 生成）')
  }
  const oldSchema = JSON.parse(readFileSync(statePath, 'utf-8'))
  const newSchema = schemaFromIR(ir)
  const changes = diffSchema(oldSchema, newSchema)
  if (changes.length === 0) return { changes: [], outFile: null, blocked: false }

  const breaking = changes.filter((c) => c.breaking)
  if (breaking.length > 0 && !allowBreaking) {
    return { changes, blocked: true, breaking }
  }

  // outRoot 可能不存在（例如首次 gen 只跑了 backend，没跑 db，V900 目录未建）
  if (!existsSync(outRoot)) mkdirSync(outRoot, { recursive: true })

  const ver = nextVersion(outRoot)
  const outFile = join(outRoot, 'V' + ver + '__alter_generated.sql')
  const lines = [
    '-- AUTO-GENERATED by polyforge. DO NOT EDIT.',
    '-- 增量迁移：对比上次生成时的 schema state',
    '-- 生成时间：' + new Date().toISOString(),
    '',
  ]
  for (const c of changes) {
    const tag = c.table + (c.column ? '.' + c.column : c.index ? ' #' + c.index : '')
    lines.push('-- ' + c.kind + ' on ' + tag + (c.breaking ? ' [BREAKING]' : ''))
    lines.push(c.sql)
    lines.push('')
  }
  writeFileSync(outFile, lines.join('\n'), 'utf-8')
  writeFileSync(statePath, JSON.stringify(newSchema, null, 2), 'utf-8')
  return { changes, outFile, blocked: false }
}
