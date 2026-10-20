/**
 * 破坏性变更检测（Breaking Change Detection）
 *
 * 目的：当契约发生破坏性变更时（删字段 / 改类型 / 收窄可空性 / 删接口 / 改接口签名），
 * 在 gen 阶段报警并阻断，避免前后端生成出不一致的代码。
 *
 * 快照文件：.polyforge/schema-snapshot.json
 *   结构与 manifest.json 类似，但记录的是 IR 的语义指纹，不是生成物 hash。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, resolve, dirname } from 'path'

const SNAPSHOT_FILE = 'schema-snapshot.json'

/**
 * 解析快照文件路径。
 * 优先 POLYFORGE_SNAPSHOT 环境变量（多消费方共享同一份基线时用）。
 * 未设置则回退到 <projectRoot>/.polyforge/schema-snapshot.json（各项目独立）。
 *
 * 为什么默认不全局共享（与契约缓存不同）：
 *   缓存是契约数据，可重新 clone，与项目无关 → 放系统临时目录全局共享。
 *   快照是生成历史，记录「本消费方上次 gen 到哪个契约版本」，是破坏性变更的确认点。
 *   若快照也默认全局共享，server 先 gen 接受某破坏性变更并更新快照后，
 *   client 下次 gen 时该变更已被「接受」过，会静默通过——这比缓存重复危险得多。
 * 因此多消费方共享快照必须显式设置（如 rebuild.ps1 指到工作区级路径），不能默认全局。
 */
export function resolveSnapshotPath(projectRoot) {
  const envPath = process.env.POLYFORGE_SNAPSHOT
  if (envPath) return resolve(projectRoot, envPath)
  return join(projectRoot, '.polyforge', SNAPSHOT_FILE)
}

/** 从 IR 提取语义指纹 */
export function extractSnapshot(ir) {
  const snap = { enums: {}, entities: {}, views: {}, apis: {} }

  for (const [name, e] of ir.enums) {
    snap.enums[name] = { values: [...(e.values || [])].sort() }
  }

  for (const [name, e] of ir.entities) {
    snap.entities[name] = {
      fields: Object.fromEntries(
        Object.entries(e.fields || {}).map(([fn, fd]) => [
          fn,
          { type: fd.type, nullable: !!fd.nullable },
        ])
      ),
    }
  }

  for (const [name, v] of ir.views) {
    snap.views[name] = {
      kind: v.viewKind || v.kind,
      required: [...(v.required || [])].sort(),
      fields: Object.fromEntries(
        Object.entries(v.fields || {}).map(([fn, fd]) => [
          fn,
          { type: fd.type, nullable: !!fd.nullable },
        ])
      ),
    }
  }

  for (const api of ir.apis) {
    snap.apis[api.name] = {
      method: api.method,
      path: api.path,
      input: api.input || null,
      output: api.output || null,
    }
  }

  return snap
}

/**
 * 对比旧快照与当前快照，返回破坏性变更列表。
 * 每条：{ kind, location, detail }
 */
export function diffSnapshots(oldSnap, newSnap) {
  const breaks = []

  // ---- 枚举：删值 ----
  for (const [name, oldDef] of Object.entries(oldSnap.enums || {})) {
    const newDef = newSnap.enums?.[name]
    if (!newDef) {
      breaks.push({ kind: 'enum-removed', location: name, detail: `枚举 ${name} 被删除` })
      continue
    }
    const removed = oldDef.values.filter((v) => !newDef.values.includes(v))
    if (removed.length) {
      breaks.push({
        kind: 'enum-value-removed',
        location: name,
        detail: `枚举 ${name} 删除了值: ${removed.join(', ')}`,
      })
    }
  }

  // ---- 实体：删字段 / 改类型 / 可空性收窄 ----
  for (const [name, oldDef] of Object.entries(oldSnap.entities || {})) {
    const newDef = newSnap.entities?.[name]
    if (!newDef) {
      breaks.push({ kind: 'entity-removed', location: name, detail: `实体 ${name} 被删除` })
      continue
    }
    for (const [fn, oldFd] of Object.entries(oldDef.fields || {})) {
      const newFd = newDef.fields?.[fn]
      if (!newFd) {
        breaks.push({
          kind: 'entity-field-removed',
          location: `${name}.${fn}`,
          detail: `实体 ${name} 删除了字段 ${fn}`,
        })
        continue
      }
      if (oldFd.type !== newFd.type) {
        breaks.push({
          kind: 'entity-field-type-changed',
          location: `${name}.${fn}`,
          detail: `实体 ${name}.${fn} 类型从 ${oldFd.type} 改为 ${newFd.type}`,
        })
      }
      if (!oldFd.nullable && newFd.nullable) {
        breaks.push({
          kind: 'entity-field-widened',
          location: `${name}.${fn}`,
          detail: `实体 ${name}.${fn} 从必填变为可空（后端需处理 null）`,
        })
      }
      if (oldFd.nullable && !newFd.nullable) {
        breaks.push({
          kind: 'entity-field-narrowed',
          location: `${name}.${fn}`,
          detail: `实体 ${name}.${fn} 从可空变为必填（老数据含 null 会让 NOT NULL DDL / 校验失败）`,
        })
      }
    }
  }

  // ---- 视图：删字段 / 改类型 / 加必填 ----
  for (const [name, oldDef] of Object.entries(oldSnap.views || {})) {
    const newDef = newSnap.views?.[name]
    if (!newDef) {
      breaks.push({ kind: 'view-removed', location: name, detail: `视图 ${name} 被删除` })
      continue
    }
    if (oldDef.kind && newDef.kind && oldDef.kind !== newDef.kind) {
      breaks.push({
        kind: 'view-kind-changed',
        location: name,
        detail: `视图 ${name} 类型从 ${oldDef.kind} 改为 ${newDef.kind}（form/brief/detail 语义变化，消费方会受影响）`,
      })
    }
    for (const [fn, oldFd] of Object.entries(oldDef.fields || {})) {
      const newFd = newDef.fields?.[fn]
      if (!newFd) {
        breaks.push({
          kind: 'view-field-removed',
          location: `${name}.${fn}`,
          detail: `视图 ${name} 删除了字段 ${fn}`,
        })
        continue
      }
      if (oldFd.type !== newFd.type) {
        breaks.push({
          kind: 'view-field-type-changed',
          location: `${name}.${fn}`,
          detail: `视图 ${name}.${fn} 类型从 ${oldFd.type} 改为 ${newFd.type}`,
        })
      }
      if (oldFd.nullable && !newFd.nullable) {
        breaks.push({
          kind: 'view-field-narrowed',
          location: `${name}.${fn}`,
          detail: `视图 ${name}.${fn} 从可空变为必填（后端 DTO 校验突然变严，老客户端可能被打回）`,
        })
      }
    }
    // 新增 required 字段 → 前端表单/后端 DTO 会出现必填校验，影响调用方
    for (const fn of newDef.required || []) {
      if (!(oldDef.required || []).includes(fn) && !(oldDef.fields?.[fn])) {
        breaks.push({
          kind: 'view-required-added',
          location: `${name}.${fn}`,
          detail: `视图 ${name} 新增了必填字段 ${fn}`,
        })
      }
    }
  }

  // ---- API：删接口 / 改方法/路径/签名 ----
  for (const [name, oldDef] of Object.entries(oldSnap.apis || {})) {
    const newDef = newSnap.apis?.[name]
    if (!newDef) {
      breaks.push({ kind: 'api-removed', location: name, detail: `接口 ${name} 被删除` })
      continue
    }
    if (oldDef.method !== newDef.method) {
      breaks.push({
        kind: 'api-method-changed',
        location: name,
        detail: `接口 ${name} 方法从 ${oldDef.method} 改为 ${newDef.method}`,
      })
    }
    if (oldDef.path !== newDef.path) {
      breaks.push({
        kind: 'api-path-changed',
        location: name,
        detail: `接口 ${name} 路径从 ${oldDef.path} 改为 ${newDef.path}`,
      })
    }
    if (oldDef.input !== newDef.input) {
      breaks.push({
        kind: 'api-input-changed',
        location: name,
        detail: `接口 ${name} 入参从 ${oldDef.input || '(空)'} 改为 ${newDef.input || '(空)'}`,
      })
    }
    if (oldDef.output !== newDef.output) {
      breaks.push({
        kind: 'api-output-changed',
        location: name,
        detail: `接口 ${name} 出参从 ${oldDef.output || '(空)'} 改为 ${newDef.output || '(空)'}`,
      })
    }
  }

  return breaks
}

/** 读快照（不存在返回 null） */
export function readSnapshot(projectRoot) {
  const p = resolveSnapshotPath(projectRoot)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

/** 写快照 */
export function writeSnapshot(projectRoot, snap) {
  const p = resolveSnapshotPath(projectRoot)
  const dir = dirname(p)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(p, JSON.stringify(snap, null, 2), 'utf-8')
}
