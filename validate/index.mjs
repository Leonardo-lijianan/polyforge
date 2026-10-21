/**
 * 契约检查器（Step 3）
 * 职责：在 IR 上实现 C1~C15
 * 输入：buildIR() 产出的 IR
 * 输出：{ errors: [], warnings: [] }
 *
 * 检查项分工：
 *   - build-ir.mjs 已做：C1(引用存在) C2(类型匹配) C6(命名冲突) C5(未使用)
 *   - 本文件补：C3(单向) C4(循环) C9/C10(业务值) C12(命名) C13(required) C15(数组of)
 */

/** 依赖方向：谁可以引用谁 */
const ALLOWED_EDGES = {
  enum: [],                            // 枚举不引用任何
  entity: ['enum', 'entity'],          // 实体可引枚举/实体（如 Contract 引 Project），不能引 view/api
  view: ['enum', 'entity', 'view'],    // 视图可引枚举/实体/视图
  rule: [],                            // 校验规则不引用任何
  api: ['view', 'enum'],               // 接口可引视图/枚举
}

const NAME_PATTERN = {
  enum: /^[A-Z][A-Za-z0-9]*$/,
  entity: /^[A-Z][A-Za-z0-9]*$/,
  view: /^[A-Z][A-Za-z0-9]*$/,
  rule: /^[a-z][A-Za-z0-9]*$/,          // 校验规则名 camelCase（如 phone / companyName）
  field: /^[a-z][A-Za-z0-9]*$/,
  // api.name 必须 camelCase：保证 kebab 逻辑键单射、无冲突
  api: /^[a-z][A-Za-z0-9]*$/,
}

export function validate(ir) {
  const errors = [...ir.errors]
  const warnings = [...ir.warnings]

  const kindOf = (name) => ir.allNames.get(name)?.kind

  // ============ C4：循环检测（拓扑排序） ============
  detectCycles(ir, errors)

  // ============ C3：单向依赖 ============
  for (const { from, to } of ir.graph.edges) {
    const fromKind = kindOf(from)
    const toKind = kindOf(to)
    if (!fromKind || !toKind) continue
    const allowed = ALLOWED_EDGES[fromKind] || []
    if (!allowed.includes(toKind)) {
      errors.push('C3 单向依赖违规: ' + fromKind + ' ' + from + ' 不能引用 ' + toKind + ' ' + to)
    }
  }

  // ============ C12：命名规范 ============
  const STYLE_LABEL = { api: 'camelCase', field: 'camelCase' }
  for (const [name, item] of ir.allNames) {
    const pat = NAME_PATTERN[item.kind]
    if (pat && !pat.test(name)) {
      const style = STYLE_LABEL[item.kind] || 'PascalCase'
      errors.push('C12 命名规范: ' + item.kind + ' ' + name + ' 不符合 ' + style)
    }
  }
  for (const [name, e] of ir.entities) {
    for (const fn of Object.keys(e.fields)) {
      if (!NAME_PATTERN.field.test(fn)) {
        errors.push('C12 命名规范: 字段 ' + name + '.' + fn + ' 不符合 camelCase')
      }
    }
  }
  for (const [name, v] of ir.views) {
    for (const fn of Object.keys(v.fields)) {
      if (!NAME_PATTERN.field.test(fn)) {
        errors.push('C12 命名规范: 字段 ' + name + '.' + fn + ' 不符合 camelCase')
      }
    }
  }

  // ============ C13：required 字段必须存在 ============
  for (const [name, v] of ir.views) {
    for (const req of v.required || []) {
      if (!v.fields[req]) {
        errors.push('C13 必填字段不存在: ' + name + '.required 里的 ' + req + ' 不在 fields 中')
      }
    }
  }

  // ============ C15：数组字段必须有 of ============
  const checkArrayFields = (ownerKind, ownerName, fields) => {
    for (const [fn, fd] of Object.entries(fields)) {
      if (fd.type === 'array' && !fd.of) {
        errors.push('C15 类型不完整: ' + ownerKind + ' ' + ownerName + '.' + fn + ' 是数组但缺 of')
      }
    }
  }
  for (const [name, e] of ir.entities) checkArrayFields('实体', name, e.fields)
  for (const [name, v] of ir.views) checkArrayFields('视图', name, v.fields)

  // ============ C16：indexes 引用的字段必须存在 ============
  for (const [name, e] of ir.entities) {
    for (const idx of e.indexes || []) {
      for (const f of idx.fields || []) {
        if (!e.fields || !e.fields[f]) {
          errors.push('C16 索引字段不存在: 实体 ' + name + ' 的 indexes 引用了不存在的字段 ' + f)
        }
      }
    }
  }

  // ============ C9/C10：业务值必须在枚举里 ============
  // 角色值：api.auth.roles 必须在 UserRole 枚举里
  const userRoleEnum = ir.enums.get('UserRole')
  const userRoleValues = userRoleEnum ? new Set(userRoleEnum.values) : null

  if (userRoleValues) {
    for (const api of ir.apis) {
      const auth = api.auth
      if (auth && typeof auth === 'object' && Array.isArray(auth.roles)) {
        for (const r of auth.roles) {
          if (!userRoleValues.has(r)) {
            errors.push('C9 角色值非法: api ' + api.name + '.auth.roles 含 ' + r + '，不在 UserRole 枚举里')
          }
        }
      }
    }
    // 状态机流转的 by 角色
    for (const [name, e] of ir.enums) {
      if (!e.state) continue
      for (const t of e.state.transitions || []) {
        for (const r of t.by || []) {
          if (!userRoleValues.has(r)) {
            errors.push('C10 流转角色非法: ' + name + '.transitions.by 含 ' + r + '，不在 UserRole 枚举里')
          }
        }
      }
    }
  }

  // ============ C17：indexes.fields 非空 ============
  for (const [name, e] of ir.entities) {
    for (const idx of e.indexes || []) {
      if (!Array.isArray(idx.fields) || idx.fields.length === 0) {
        errors.push('C17 空索引: 实体 ' + name + ' 有一个 indexes 项没有 fields')
      }
    }
  }

  // ============ C18：每个实体恰好一个 type:id 字段 ============
  for (const [name, e] of ir.entities) {
    // ref 字段解析后 type 也是 'id'，但不是主键，需排除
    const idFields = Object.entries(e.fields).filter(([, fd]) => fd.type === 'id' && !fd.ref)
    if (idFields.length === 0) {
      errors.push('C18 缺少主键: 实体 ' + name + ' 没有 type:id 字段')
    } else if (idFields.length > 1) {
      errors.push('C18 主键重复: 实体 ' + name + ' 有多个 type:id 字段（' + idFields.map(([k]) => k).join(', ') + '）')
    }
  }

  // ============ C19：auto 字段必须是 datetime ============
  const checkAuto = (ownerKind, ownerName, fields) => {
    for (const [fn, fd] of Object.entries(fields)) {
      if (fd.auto && fd.type !== 'datetime') {
        errors.push('C19 auto 字段非 datetime: ' + ownerKind + ' ' + ownerName + '.' + fn + '（auto 只能配 datetime）')
      }
    }
  }
  for (const [name, e] of ir.entities) checkAuto('实体', name, e.fields)
  for (const [name, v] of ir.views) checkAuto('视图', name, v.fields)

  // ============ C20：sensitive 只能用在 string ============
  const checkSensitive = (ownerKind, ownerName, fields) => {
    for (const [fn, fd] of Object.entries(fields)) {
      if (fd.sensitive && fd.type !== 'string') {
        errors.push('C20 sensitive 非 string: ' + ownerKind + ' ' + ownerName + '.' + fn + '（sensitive 只能配 string）')
      }
    }
  }
  for (const [name, e] of ir.entities) checkSensitive('实体', name, e.fields)
  for (const [name, v] of ir.views) checkSensitive('视图', name, v.fields)

  // ============ C30：字段名暗示日期/时间，类型必须是 date/datetime ============
  // 命名后缀约定（camelCase 大写字母是词边界）：
  //   Time / At / Datetime → datetime
  //   Date                 → date
  // 目的：阻止用 string 存日期，破坏跨端类型契约
  const DATE_LIKE_SUFFIX = [
    { re: /Datetime$/, expect: 'datetime', hint: '日期时间' },
    { re: /Time$/,     expect: 'datetime', hint: '日期时间' },
    { re: /Deadline$/, expect: 'datetime', hint: '截止时间' },
    { re: /At$/,       expect: 'datetime', hint: '日期时间' },
    { re: /Date$/,     expect: 'date',     hint: '日期' },
  ]
  const checkDateLike = (ownerKind, ownerName, fields) => {
    for (const [fn, fd] of Object.entries(fields || {})) {
      for (const { re, expect, hint } of DATE_LIKE_SUFFIX) {
        if (!re.test(fn)) continue
        if (fd.type !== 'date' && fd.type !== 'datetime') {
          errors.push('C30 日期字段类型错误: ' + ownerKind + ' ' + ownerName + '.' + fn +
            ' 名称暗示是' + hint + '，类型必须是 date/datetime，实际是 ' + fd.type)
        } else if (fd.type !== expect) {
          errors.push('C30 日期字段类型不符: ' + ownerKind + ' ' + ownerName + '.' + fn +
            ' 名称暗示是' + hint + '，类型应为 ' + expect + '，实际是 ' + fd.type)
        }
        break
      }
    }
  }
  for (const [name, e] of ir.entities) checkDateLike('实体', name, e.fields)
  for (const [name, v] of ir.views) checkDateLike('视图', name, v.fields)
  for (const api of ir.apis) {
    checkDateLike('接口', api.name + '.query', api.query)
    checkDateLike('接口', api.name + '.pathParams', api.pathParams)
  }

  // ============ C31：修饰符位置合法 ============
  // 权威矩阵见 docs/part2-model-spec/10-modifier-scope.md
  // 这里必须与矩阵一致——矩阵改了，这里跟着改。
  const MOD_SCOPE = {
    // 存储专属
    unique: ['entity'], index: ['entity'], auto: ['entity'], ref: ['entity'],
    // 存储 + 路径参数（路径变量常要 idType）
    idType: ['entity', 'pathParams'],
    // 跨位置
    nullable: ['entity', 'form', 'query', 'output', 'apiQuery'],  // 路径参数必填，故不含 pathParams
    length: ['entity', 'form', 'query'],
    default: ['entity', 'form'],
    of: ['entity', 'form', 'query', 'output'],  // URL 参数只能标量（C29）
    // 出参专属
    from: ['output'], sensitive: ['output'], derived: ['output'],
    // 入参专属
    writeOnly: ['form'], validateRef: ['form'],
    validate: ['form', 'query', 'apiQuery', 'pathParams'],
  }
  const checkScope = (loc, ownerKind, ownerName, fields) => {
    for (const [fn, fd] of Object.entries(fields || {})) {
      for (const [mod, locs] of Object.entries(MOD_SCOPE)) {
        if (fd[mod] === undefined) continue
        if (!locs.includes(loc)) {
          errors.push('C31 修饰符位置非法: ' + ownerKind + ' ' + ownerName + '.' + fn + ' 的 ' + mod + ' 不能用在 ' + loc)
        }
      }
    }
  }
  for (const [name, e] of ir.entities) checkScope('entity', '实体', name, e.fields)
  for (const [name, v] of ir.views) {
    const loc = v.viewKind === 'form' ? 'form' : v.viewKind === 'query' ? 'query' : 'output'
    checkScope(loc, '视图', name, v.fields)
  }
  for (const api of ir.apis) {
    checkScope('apiQuery', '接口', api.name + '.query', api.query)
    checkScope('pathParams', '接口', api.name + '.pathParams', api.pathParams)
  }

  // ============ C33：api.input 必须引用 form 视图 ============
  // 入参方向只能是 form；用 detail/brief 当 input 会生成语义错误的 Controller
  // （拿出参 DTO 当 @RequestBody）。这是 sky-trial 实测暴露的校验缺口（P1-7）。
  for (const api of ir.apis) {
    if (!api.input) continue
    const target = ir.views.get(api.input)
    if (!target) continue // 引用不存在由 C1 报
    if (target.viewKind !== 'form') {
      errors.push('C33 input 必须是 form 视图: api ' + api.name + '.input = ' + api.input + '（kind: ' + target.viewKind + '）')
    }
  }

  // ============ C32：derived 字段语义 ============
  const DERIVED_KINDS = new Set(['text', 'join', 'relation', 'permission', 'compute'])
  for (const [name, v] of ir.views) {
    for (const [fn, fd] of Object.entries(v.fields || {})) {
      if (!fd.derived) continue
      if (fd.from) errors.push('C32 derived 与 from 互斥: 视图 ' + name + '.' + fn)
      if (!DERIVED_KINDS.has(fd.derived)) errors.push('C32 未知 derived 取值: 视图 ' + name + '.' + fn + ' = ' + fd.derived)
      if (fd.derived === 'relation') {
        if (!fd.via || !Array.isArray(fd.via) || fd.via.length === 0) {
          errors.push('C32 relation 缺 via: 视图 ' + name + '.' + fn)
        } else {
          for (const seg of fd.via) {
            const parts = String(seg).split('.')
            const ent = ir.entities.get(parts[0])
            if (!ent || !ent.fields || !ent.fields[parts[1]]) errors.push('C32 via 路径不可解析: 视图 ' + name + '.' + fn + ' 的 ' + seg)
          }
        }
      }
      if (fd.derived === 'permission') {
        if (fd.type !== 'array' || !fd.of) errors.push('C32 permission 必须是 array of enum: 视图 ' + name + '.' + fn)
        else if (fd.resolvedOf?.kind !== 'enum') errors.push('C32 permission 的 of 必须是枚举: 视图 ' + name + '.' + fn)
      }
    }
  }

  // ============ C21：主键不能 nullable ============
  for (const [name, e] of ir.entities) {
    for (const [fn, fd] of Object.entries(e.fields)) {
      if (fd.type === 'id' && !fd.ref && fd.nullable) {
        errors.push('C21 主键可空: 实体 ' + name + '.' + fn + ' 是主键但声明了 nullable')
      }
    }
  }

  // ============ C22：of 只能配 type:array ============
  const checkOf = (ownerKind, ownerName, fields) => {
    for (const [fn, fd] of Object.entries(fields)) {
      if (fd.of && fd.type !== 'array') {
        errors.push('C22 of 误用: ' + ownerKind + ' ' + ownerName + '.' + fn + ' 有 of 但 type 不是 array')
      }
    }
  }
  for (const [name, e] of ir.entities) checkOf('实体', name, e.fields)
  for (const [name, v] of ir.views) checkOf('视图', name, v.fields)

  // ============ C23：validate 引用的规则必须已在 rules 中定义 ============
  const checkValidate = (ownerKind, ownerName, fields) => {
    for (const [fn, fd] of Object.entries(fields)) {
      if (typeof fd.validate === 'string' && !ir.rules.has(fd.validate)) {
        errors.push('C23 未知校验器: ' + ownerKind + ' ' + ownerName + '.' + fn + ' 引用了 "' + fd.validate + '"，但 rules 中未定义')
      }
    }
  }
  for (const [name, e] of ir.entities) checkValidate('实体', name, e.fields)
  for (const [name, v] of ir.views) checkValidate('视图', name, v.fields)

  // ============ C24：validateRef 引用的字段必须存在 ============
  for (const [name, v] of ir.views) {
    for (const [fn, fd] of Object.entries(v.fields)) {
      if (fd.validateRef && !v.fields[fd.validateRef]) {
        errors.push('C24 validateRef 无效: 视图 ' + name + '.' + fn + ' 引用了不存在的字段 "' + fd.validateRef + '"')
      }
    }
  }

  // ============ C27：from 字段类型必须与来源兼容 ============
  // 归一化类型：枚举/实体用名字，基础类型原样
  const normType = (fd) => {
    if (!fd) return '?'
    if (fd.of) return 'array'
    if (fd.resolved?.kind === 'enum') return 'enum:' + fd.resolved.target
    if (fd.resolved?.kind === 'entity') return 'entity:' + fd.resolved.target
    if (fd.resolved?.kind === 'view') return 'view:' + fd.resolved.target
    return fd.type
  }
  const isConvertible = (from, to) => {
    if (from === to) return true
    // id（Long）→ string 是允许的显示转换
    if (from === 'id' && to === 'string') return true
    // long/int → string
    if ((from === 'long' || from === 'int') && to === 'string') return true
    return false
  }
  for (const [vname, v] of ir.views) {
    for (const [fn, fd] of Object.entries(v.fields)) {
      if (!fd.from) continue
      const [entName, fieldName] = String(fd.from).split('.')
      const ent = ir.entities.get(entName)
      if (!ent || !ent.fields || !ent.fields[fieldName]) continue // C8 已报
      const entField = ent.fields[fieldName]
      const fromT = normType(entField)
      const toT = normType(fd)
      if (!isConvertible(fromT, toT)) {
        errors.push('C27 from 类型不匹配: 视图 ' + vname + '.' + fn + '（' + toT + '）≠ 来源 ' + fd.from + '（' + fromT + '）')
      }
    }
  }

  // ============ C7：跨域依赖不能成环 ============
  detectDomainCycles(ir, errors)

  // ============ C26：禁止 json 类型 ============
  const checkNoJson = (ownerKind, ownerName, fields) => {
    for (const [fn, fd] of Object.entries(fields)) {
      if (fd.type === 'json') {
        errors.push('C26 禁止 json 类型: ' + ownerKind + ' ' + ownerName + '.' + fn + ' 用了 type:json，必须改为 entity 表达')
      }
    }
  }
  for (const [name, e] of ir.entities) checkNoJson('实体', name, e.fields)
  for (const [name, v] of ir.views) checkNoJson('视图', name, v.fields)

  // ============ C28：api 路径参数必须在 pathParams 声明 ============
  for (const api of ir.apis) {
    const names = []
    const re = /:([a-zA-Z][a-zA-Z0-9]*)/g
    let m
    while ((m = re.exec(api.path)) !== null) names.push(m[1])
    if (names.length === 0) continue
    const decl = api.pathParams || {}
    for (const n of names) {
      if (!decl[n]) {
        errors.push('C28 路径参数未声明: api ' + api.name + ' 的路径含 :' + n + '，但 pathParams 未声明')
      }
    }
    // 反向：pathParams 声明了但路径里没有
    for (const n of Object.keys(decl)) {
      if (!names.includes(n)) {
        errors.push('C28 多余路径参数: api ' + api.name + ' 的 pathParams 声明了 ' + n + '，但路径中无 :' + n)
      }
    }
  }

  // ============ C29：query / pathParams 只能是标量 ============
  // URL 查询串与路径变量无法承载 entity/view/array，只能是 primitive 或 enum
  const checkScalarParams = (api, loc, fields) => {
    for (const [fn, fd] of Object.entries(fields || {})) {
      const kind = fd.resolved && fd.resolved.kind
      if (kind && kind !== 'primitive' && kind !== 'enum') {
        errors.push('C29 参数类型非法: api ' + api.name + '.' + loc + '.' + fn + ' 是 ' + kind + '，URL 参数只能是 primitive 或 enum')
      }
    }
  }
  for (const api of ir.apis) {
    checkScalarParams(api, 'query', api.query)
    checkScalarParams(api, 'pathParams', api.pathParams)
  }

  // ============ C25：接口角色必须在 permissions 里定义 ============
  const permRoles = ir.permissions && ir.permissions.roles ? ir.permissions.roles : null
  if (permRoles && permRoles.size > 0) {
    for (const api of ir.apis) {
      const auth = api.auth
      if (auth && typeof auth === 'object' && Array.isArray(auth.roles)) {
        for (const r of auth.roles) {
          if (!permRoles.has(r)) {
            errors.push('C25 角色未定义: api ' + api.name + '.auth.roles 含 "' + r + '"，但 permissions 里没有定义该角色')
          }
        }
      }
    }
  }

  // ============ 枚举内部一致性（补充） ============
  for (const [name, e] of ir.enums) {
    if (e.state) {
      const values = new Set(e.values)
      if (e.state.initial && !values.has(e.state.initial)) {
        errors.push('状态机 initial 不在枚举内: ' + name + '.initial = ' + e.state.initial)
      }
      for (const t of e.state.transitions || []) {
        const froms = Array.isArray(t.from) ? t.from : [t.from]
        const tos = Array.isArray(t.to) ? t.to : [t.to]
        for (const f of froms) {
          if (!values.has(f)) errors.push('状态机 from 不在枚举内: ' + name + '.' + f)
        }
        for (const tt of tos) {
          if (!values.has(tt)) errors.push('状态机 to 不在枚举内: ' + name + '.' + tt)
        }
      }
    }
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

/** 域级循环检测：把节点依赖聚合成域依赖，查是否有环 */
function detectDomainCycles(ir, errors) {
  const domainOf = (name) => ir.allNames.get(name)?.domain
  // 聚合域级边
  const domainEdges = new Map()  // domain -> Set<domain>
  for (const { from, to } of ir.graph.edges) {
    const df = domainOf(from)
    const dt = domainOf(to)
    if (!df || !dt || df === dt) continue
    if (!domainEdges.has(df)) domainEdges.set(df, new Set())
    domainEdges.get(df).add(dt)
  }
  // DFS 找环
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map()
  const stack = []
  const found = new Set()
  const visit = (d) => {
    color.set(d, GRAY)
    stack.push(d)
    for (const next of domainEdges.get(d) || []) {
      const c = color.get(next) || WHITE
      if (c === GRAY) {
        const idx = stack.indexOf(next)
        const cycle = stack.slice(idx).concat(next).join(' -> ')
        if (!found.has(cycle)) {
          found.add(cycle)
          errors.push('C7 跨域循环依赖: ' + cycle)
        }
      } else if (c === WHITE) {
        visit(next)
      }
    }
    stack.pop()
    color.set(d, BLACK)
  }
  for (const d of domainEdges.keys()) {
    if ((color.get(d) || WHITE) === WHITE) visit(d)
  }
}

/** 循环检测：DFS 找环，打印环路径 */
function detectCycles(ir, errors) {
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map()
  const stack = []
  const found = new Set()

  const visit = (node) => {
    color.set(node, GRAY)
    stack.push(node)
    const neighbors = ir.graph.adjacency.get(node) || new Set()
    for (const next of neighbors) {
      const c = color.get(next) || WHITE
      if (c === GRAY) {
        // 找到环：从 stack 里 next 的位置到末尾
        const idx = stack.indexOf(next)
        const cycle = stack.slice(idx).concat(next).join(' -> ')
        if (!found.has(cycle)) {
          found.add(cycle)
          errors.push('C4 循环引用: ' + cycle)
        }
      } else if (c === WHITE) {
        visit(next)
      }
    }
    stack.pop()
    color.set(node, BLACK)
  }

  for (const node of ir.allNames.keys()) {
    if ((color.get(node) || WHITE) === WHITE) visit(node)
  }
}
