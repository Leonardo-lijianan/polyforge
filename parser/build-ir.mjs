/**
 * IR 构建器（Step 2）
 * 职责：
 *   1. 遍历所有原始对象，把 enums/entities/views/rules/api 按名字汇总到全局索引
 *   2. 检测重名（C6）
 *   3. 解析字段引用（type / of）→ resolved
 *   4. 校验 api.input / api.output 存在性（C1）
 *   5. 建依赖图（供检查器 C3/C4 用）
 *   6. 统计未使用（C5）
 * 不做：业务值校验（C9/C10）、生成
 */

/** 基础类型（不是引用，直接映射） */
const PRIMITIVE_TYPES = new Set([
  'id', 'string', 'text', 'int', 'long', 'number', 'decimal',
  'boolean', 'date', 'datetime', 'json', 'array',
])

/** 可作字段类型的 kind */
const FIELD_TYPE_KINDS = new Set(['enum', 'entity', 'view'])

/** 构建 IR */
export function buildIR(loaded) {
  const enums = new Map()
  const entities = new Map()
  const views = new Map()
  const rules = new Map()
  const apis = []
  const errors = []
  const warnings = []
  // permissions 文件：提取角色名与资源，供检查器 C25/C26 用
  const permissionRoles = new Set()
  const permissionResources = new Set()

  // ============ ① 汇总到全局索引 ============
  for (const { rel, doc } of loaded) {
    // permissions 文件单独收集（无 domain）
    if (doc.kind === 'permissions') {
      for (const r of doc.roles || []) {
        if (r && r.name) permissionRoles.add(r.name)
      }
      for (const res of doc.resources || []) {
        if (res && res.name) permissionResources.add(res.name)
      }
      continue
    }
    // kind: global 无 domain，用 kind 做域标识
    const domain = doc.domain || doc.kind

    // 系统字段（kind/name/domain/source）放在 ...def 之后，避免被 def 的同名字段覆盖
    for (const [name, def] of Object.entries(doc.enums || {})) {
      if (enums.has(name)) errors.push(dupError('枚举', name, enums.get(name).source, rel))
      enums.set(name, { ...def, kind: 'enum', name, domain, source: rel })
    }
    for (const [name, def] of Object.entries(doc.entities || {})) {
      if (entities.has(name)) errors.push(dupError('实体', name, entities.get(name).source, rel))
      entities.set(name, { ...def, kind: 'entity', name, domain, source: rel })
    }
    for (const [name, def] of Object.entries(doc.views || {})) {
      if (views.has(name)) errors.push(dupError('视图', name, views.get(name).source, rel))
      // viewKind 存业务类型（form/query/brief/detail），kind 固定为 'view'
      views.set(name, { ...def, kind: 'view', viewKind: def.kind, name, domain, source: rel })
    }
    for (const [name, def] of Object.entries(doc.rules || {})) {
      if (rules.has(name)) errors.push(dupError('规则', name, rules.get(name).source, rel))
      rules.set(name, { ...def, kind: 'rule', name, domain, source: rel })
    }
    for (const [name, def] of Object.entries(doc.api || {})) {
      const prev = apis.find((a) => a.name === name)
      if (prev) errors.push(dupError('api', name, prev.source, rel))
      apis.push({ ...def, kind: 'api', name, domain, source: rel })
    }
  }

  // 全部名字（含 api）——供引用解析
  const allNames = new Map()
  for (const [k, v] of enums) allNames.set(k, v)
  for (const [k, v] of entities) allNames.set(k, v)
  for (const [k, v] of views) allNames.set(k, v)
  for (const [k, v] of rules) allNames.set(k, v)
  for (const api of apis) allNames.set(api.name, { kind: 'api', name: api.name })

  // ============ ② 解析字段引用 ============
  const resolveField = (def, ownerName, opts = {}) => {
    const withIdType = opts.withIdType !== false
    if (!def || typeof def !== 'object') return def
    const out = { ...def }

    // ref：类型从目标实体的主键派生（编译期类型投影，非运行时外键）
    // { ref: User } 等价于 { type: id, idType: <User.id 的 idType> }，且为弱边
    if (def.ref) {
      const target = entities.get(def.ref)
      if (!target) {
        errors.push('引用不存在: ' + ownerName + '.ref = ' + def.ref)
        out.resolved = { kind: 'unknown', target: def.ref }
        return out
      }
      const idDef = Object.values(target.fields || {}).find((f) => f.type === 'id')
      const idType = (idDef && idDef.idType) || 'long'
      out.type = 'id'
      if (withIdType) out.idType = idType
      out.resolved = { kind: 'ref', target: def.ref, idType }
      return out
    }

    const t = def.type
    if (t && !PRIMITIVE_TYPES.has(t)) {
      const target = allNames.get(t)
      if (!target) {
        errors.push('引用不存在: ' + ownerName + '.type = ' + t)
        out.resolved = { kind: 'unknown', target: t }
      } else if (FIELD_TYPE_KINDS.has(target.kind)) {
        out.resolved = { kind: target.kind, target: t, ...(target.kind === 'enum' ? { values: target.values } : {}) }
      } else {
        // rule / api 不能作字段类型
        errors.push('类型不匹配: ' + ownerName + '.type = ' + t + '（' + target.kind + '）不是可作字段的类型')
        out.resolved = { kind: 'unknown', target: t }
      }
    } else {
      out.resolved = { kind: 'primitive', target: t }
    }
    // id 字段：解析 idType（默认 long）
    // 只有实体和路径参数需要 idType（主键策略 / 路径变量类型）。
    // 视图与 query 的 id 一律按 String 表达（DTO 侧 PRIM.id = 'String'），
    // 不加 idType：否则 C31「修饰符位置」误报，且 assembler 会生成类型不匹配的代码。
    if (t === 'id' && withIdType) {
      out.idType = def.idType || 'long'
    }
    // 数组元素类型：命名类型 或 基础类型（array of string）
    if (def.of) {
      if (PRIMITIVE_TYPES.has(def.of)) {
        out.resolvedOf = { kind: 'primitive', target: def.of }
      } else {
        const target = allNames.get(def.of)
        if (!target) {
          errors.push('引用不存在: ' + ownerName + '.of = ' + def.of)
          out.resolvedOf = { kind: 'unknown', target: def.of }
        } else {
          out.resolvedOf = { kind: target.kind, target: def.of }
        }
      }
    }
    // derived：服务端装配字段（语义校验在 C32）
    if (def.derived) {
      out.derived = def.derived
      if (def.via) out.via = def.via
    }
    // from 来源校验（格式 Entity.field）
    if (def.from) {
      const parts = String(def.from).split('.')
      if (parts.length !== 2) {
        errors.push('from 格式错误: ' + ownerName + '.from = ' + def.from + '（应为 Entity.field）')
      } else {
        const [entName, fieldName] = parts
        const ent = entities.get(entName)
        if (!ent) {
          errors.push('引用不存在: ' + ownerName + '.from = ' + def.from + '（实体 ' + entName + ' 未定义）')
        } else if (!ent.fields || !ent.fields[fieldName]) {
          errors.push('引用不存在: ' + ownerName + '.from = ' + def.from + '（字段 ' + fieldName + ' 不存在）')
        }
      }
    }
    return out
  }

  for (const [name, e] of entities) {
    const fields = {}
    for (const [fn, fd] of Object.entries(e.fields || {})) {
      fields[fn] = resolveField(fd, name + '.' + fn)
    }
    e.fields = fields
  }
  for (const [name, v] of views) {
    const fields = {}
    for (const [fn, fd] of Object.entries(v.fields || {})) {
      fields[fn] = resolveField(fd, name + '.' + fn, { withIdType: false })
    }
    v.fields = fields
  }
  // api 的 query / pathParams 字段同样需要解析（此前遗漏，导致枚举等引用在前端退化成 unknown）
  for (const api of apis) {
    if (api.query) {
      const q = {}
      for (const [fn, fd] of Object.entries(api.query)) {
        q[fn] = resolveField(fd, 'api.' + api.name + '.query.' + fn, { withIdType: false })
      }
      api.query = q
    }
    if (api.pathParams) {
      const p = {}
      for (const [fn, fd] of Object.entries(api.pathParams)) {
        p[fn] = resolveField(fd, 'api.' + api.name + '.pathParams.' + fn)
      }
      api.pathParams = p
    }
  }

  // ============ ③ 建依赖图 ============
  const edges = []
  const addEdge = (from, to) => { if (to && to !== from) edges.push({ from, to }) }
  const addResolvedEdge = (owner, fd) => {
    if (fd.resolved && FIELD_TYPE_KINDS.has(fd.resolved.kind)) addEdge(owner, fd.resolved.target)
    if (fd.resolvedOf && FIELD_TYPE_KINDS.has(fd.resolvedOf.kind)) addEdge(owner, fd.resolvedOf.target)
  }

  for (const [name, e] of entities) {
    for (const fd of Object.values(e.fields)) addResolvedEdge(name, fd)
  }
  for (const [name, v] of views) {
    for (const fd of Object.values(v.fields)) {
      addResolvedEdge(name, fd)
      if (fd.from) addEdge(name, String(fd.from).split('.')[0])
    }
  }
  for (const api of apis) {
    for (const fd of Object.values(api.query || {})) addResolvedEdge(api.name, fd)
    for (const fd of Object.values(api.pathParams || {})) addResolvedEdge(api.name, fd)
  }

  // api 引用：先检查存在性，再加边
  for (const api of apis) {
    if (api.input) {
      if (!allNames.has(api.input)) {
        errors.push('引用不存在: api ' + api.name + '.input = ' + api.input)
      } else {
        addEdge(api.name, api.input)
      }
    }
    if (api.output) {
      if (!allNames.has(api.output)) {
        errors.push('引用不存在: api ' + api.name + '.output = ' + api.output)
      } else {
        addEdge(api.name, api.output)
      }
    }
  }

  const adjacency = new Map()
  for (const { from, to } of edges) {
    if (!adjacency.has(from)) adjacency.set(from, new Set())
    adjacency.get(from).add(to)
  }

  // ============ ④ 未使用告警（C5） ============
  const usedNames = new Set()
  for (const { to } of edges) usedNames.add(to)

  // 隐式引用：auth.roles / transitions.by 的合法性由 UserRole 枚举约束
  let roleEnumUsed = false
  for (const api of apis) {
    if (api.auth && typeof api.auth === 'object' && Array.isArray(api.auth.roles) && api.auth.roles.length > 0) {
      roleEnumUsed = true
      break
    }
  }
  if (!roleEnumUsed) {
    for (const [, e] of enums) {
      if (e.state && Array.isArray(e.state.transitions)) {
        if (e.state.transitions.some((t) => Array.isArray(t.by) && t.by.length > 0)) {
          roleEnumUsed = true
          break
        }
      }
    }
  }
  if (roleEnumUsed) usedNames.add('UserRole')

  for (const [name, item] of allNames) {
    if (item.kind === 'enum' && !usedNames.has(name)) {
      warnings.push('未使用: ' + item.kind + ' ' + name + ' (定义于 ' + item.source + ')')
    }
  }

  return {
    enums, entities, views, rules, apis,
    graph: { edges, adjacency },
    allNames,
    permissions: { roles: permissionRoles, resources: permissionResources },
    errors, warnings,
  }
}

function dupError(kind, name, prevSource, curSource) {
  return '命名冲突: ' + kind + ' ' + name + ' 在 ' + prevSource + ' 和 ' + curSource + ' 都定义了'
}
