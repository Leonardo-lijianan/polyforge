#!/usr/bin/env node
/**
 * alter.mjs 的 diffSchema 单元测试。
 * 不依赖真实契约，直接喂两份结构化 schema。
 *
 * 用法：node polyforge/tests/alter-diff.mjs
 */
import { diffSchema } from '../generators/java/alter.mjs'

let pass = 0
let fail = 0

function eq(actual, expected, msg) {
  if (actual === expected) {
    pass++
  } else {
    fail++
    console.error('  FAIL: ' + msg + '（期望 ' + expected + '，实际 ' + actual + '）')
  }
}

function kinds(changes) {
  return changes.map((c) => c.kind).sort().join(',')
}

function breakingCount(changes) {
  return changes.filter((c) => c.breaking).length
}

// ---- case 1: 空 → 一张表 ----
{
  const oldS = { tables: {} }
  const newS = { tables: { users: { columns: [{ name: 'id', sqlType: 'bigint GENERATED ALWAYS AS IDENTITY', nullable: false, unique: false, pk: true }], pk: 'id', indexes: [] } } }
  const c = diffSchema(oldS, newS)
  eq(kinds(c), 'table-added', 'case1 新增表')
  eq(breakingCount(c), 0, 'case1 新增表不破坏')
}

// ---- case 2: 加可空列 ----
{
  const base = { columns: [{ name: 'id', sqlType: 'bigint', nullable: false, unique: false, pk: true }], pk: 'id', indexes: [] }
  const oldS = { tables: { users: base } }
  const newS = { tables: { users: { ...base, columns: [...base.columns, { name: 'nickname', sqlType: 'varchar(255)', nullable: true, unique: false, pk: false }] } } }
  const c = diffSchema(oldS, newS)
  eq(kinds(c), 'column-added', 'case2 加可空列')
  eq(breakingCount(c), 0, 'case2 可空列不破坏')
}

// ---- case 3: 加 NOT NULL 列 → 破坏 ----
{
  const base = { columns: [{ name: 'id', sqlType: 'bigint', nullable: false, unique: false, pk: true }], pk: 'id', indexes: [] }
  const oldS = { tables: { users: base } }
  const newS = { tables: { users: { ...base, columns: [...base.columns, { name: 'phone', sqlType: 'varchar(32)', nullable: false, unique: false, pk: false }] } } }
  const c = diffSchema(oldS, newS)
  eq(kinds(c), 'column-added', 'case3 加 NOT NULL 列')
  eq(breakingCount(c), 1, 'case3 应判破坏')
}

// ---- case 3b: 加 UNIQUE 可空列 → 也判破坏（回填值可能冲突） ----
{
  const base = { columns: [{ name: 'id', sqlType: 'bigint', nullable: false, unique: false, pk: true }], pk: 'id', indexes: [] }
  const oldS = { tables: { users: base } }
  const newS = { tables: { users: { ...base, columns: [...base.columns, { name: 'code', sqlType: 'varchar(32)', nullable: true, unique: true, pk: false }] } } }
  const c = diffSchema(oldS, newS)
  eq(kinds(c), 'column-added', 'case3b 加 UNIQUE 可空列')
  eq(breakingCount(c), 1, 'case3b UNIQUE 列应判破坏')
}

// ---- case 4: 删列 → 破坏 ----
{
  const oldS = { tables: { users: { columns: [{ name: 'id', sqlType: 'bigint', nullable: false, unique: false, pk: true }, { name: 'x', sqlType: 'int', nullable: true, unique: false, pk: false }], pk: 'id', indexes: [] } } }
  const newS = { tables: { users: { columns: [{ name: 'id', sqlType: 'bigint', nullable: false, unique: false, pk: true }], pk: 'id', indexes: [] } } }
  const c = diffSchema(oldS, newS)
  eq(kinds(c), 'column-removed', 'case4 删列')
  eq(breakingCount(c), 1, 'case4 应判破坏')
}

// ---- case 5: SET NOT NULL → 破坏 ----
{
  const oldS = { tables: { users: { columns: [{ name: 'id', sqlType: 'bigint', nullable: false, unique: false, pk: true }, { name: 'x', sqlType: 'int', nullable: true, unique: false, pk: false }], pk: 'id', indexes: [] } } }
  const newS = { tables: { users: { columns: [{ name: 'id', sqlType: 'bigint', nullable: false, unique: false, pk: true }, { name: 'x', sqlType: 'int', nullable: false, unique: false, pk: false }], pk: 'id', indexes: [] } } }
  const c = diffSchema(oldS, newS)
  eq(kinds(c), 'column-set-not-null', 'case5 SET NOT NULL')
  eq(breakingCount(c), 1, 'case5 应判破坏')
}

// ---- case 6: DROP NOT NULL → 不破坏 ----
{
  const oldS = { tables: { users: { columns: [{ name: 'id', sqlType: 'bigint', nullable: false, unique: false, pk: true }, { name: 'x', sqlType: 'int', nullable: false, unique: false, pk: false }], pk: 'id', indexes: [] } } }
  const newS = { tables: { users: { columns: [{ name: 'id', sqlType: 'bigint', nullable: false, unique: false, pk: true }, { name: 'x', sqlType: 'int', nullable: true, unique: false, pk: false }], pk: 'id', indexes: [] } } }
  const c = diffSchema(oldS, newS)
  eq(kinds(c), 'column-drop-not-null', 'case6 DROP NOT NULL')
  eq(breakingCount(c), 0, 'case6 放宽不破坏')
}

// ---- case 7: 类型变化 → 破坏 ----
{
  const oldS = { tables: { users: { columns: [{ name: 'id', sqlType: 'bigint', nullable: false, unique: false, pk: true }, { name: 'x', sqlType: 'int', nullable: true, unique: false, pk: false }], pk: 'id', indexes: [] } } }
  const newS = { tables: { users: { columns: [{ name: 'id', sqlType: 'bigint', nullable: false, unique: false, pk: true }, { name: 'x', sqlType: 'bigint', nullable: true, unique: false, pk: false }], pk: 'id', indexes: [] } } }
  const c = diffSchema(oldS, newS)
  eq(kinds(c), 'column-type-changed', 'case7 类型变化')
  eq(breakingCount(c), 1, 'case7 应判破坏')
}

// ---- case 8: 加普通索引 → 不破坏；加 UNIQUE 索引 → 破坏 ----
{
  const base = { columns: [{ name: 'id', sqlType: 'bigint', nullable: false, unique: false, pk: true }], pk: 'id', indexes: [] }
  const oldS = { tables: { users: base } }
  const new1 = { tables: { users: { ...base, indexes: [{ name: 'idx_users_x', columns: ['x'], unique: false }] } } }
  const c1 = diffSchema(oldS, new1)
  eq(kinds(c1), 'index-added', 'case8 加普通索引')
  eq(breakingCount(c1), 0, 'case8 普通索引不破坏')
  const new2 = { tables: { users: { ...base, indexes: [{ name: 'uniq_users_x', columns: ['x'], unique: true }] } } }
  const c2 = diffSchema(oldS, new2)
  eq(breakingCount(c2), 1, 'case8 UNIQUE 索引应判破坏')
}

// ---- case 9: 删表 → 破坏 ----
{
  const oldS = { tables: { users: { columns: [], pk: null, indexes: [] }, posts: { columns: [], pk: null, indexes: [] } } }
  const newS = { tables: { users: { columns: [], pk: null, indexes: [] } } }
  const c = diffSchema(oldS, newS)
  eq(kinds(c), 'table-removed', 'case9 删表')
  eq(breakingCount(c), 1, 'case9 应判破坏')
}

// ---- case 10: 无变化 ----
{
  const t = { columns: [{ name: 'id', sqlType: 'bigint', nullable: false, unique: false, pk: true }], pk: 'id', indexes: [] }
  const s = { tables: { users: t } }
  const c = diffSchema(s, s)
  eq(c.length, 0, 'case10 无变化')
}

console.log('')
console.log('[alter-diff] ' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail > 0 ? 1 : 0)
