/**
 * DSL 语法速查的唯一数据源。
 *
 * polyforge syntax <kw> 和 polyforge docs <kw> 都从这里读。
 * 加新关键字时：contract.schema.json 加字段 → 这里加记录 → validate/index.mjs 的 MOD_SCOPE 加行。
 * tests/docs-sync.mjs 检查三处一致。
 *
 * 记录字段：
 *   keyword          关键字名
 *   title            中文标题
 *   category         top / entity / view / api / modifier / type / enum
 *   position         允许的位置数组（仅 modifier 有）
 *   values           合法取值数组（可选）
 *   typeConstraint   类型约束说明（可选）
 *   example          最小示例 YAML
 *   notes            一行说明
 *   docTopic         关联的 docs 章节 id
 */

const IND = '  '

export const SYNTAX_INDEX = {
  // ============ 顶层 ============
  kind: {
    keyword: 'kind',
    title: '文件种类',
    category: 'top',
    values: ['domain', 'global', 'permissions'],
    example: 'kind: domain\ndomain: user',
    notes: '每个 YAML 文件必须有 kind；domain 类型还需 domain 字段',
    docTopic: 'file-organization',
  },
  domain: {
    keyword: 'domain',
    title: '域名',
    category: 'top',
    typeConstraint: 'string，必须匹配 ^[a-z][a-z0-9-]*$',
    example: 'kind: domain\ndomain: admin-category',
    notes: 'kind=domain 时必填；大型项目建议按子域拆分',
    docTopic: 'file-organization',
  },

  // ============ 枚举 ============
  enums: {
    keyword: 'enums',
    title: '枚举容器',
    category: 'enum',
    example: 'enums:\n  OrderStatus:\n    values: [pending, paid, done]',
    notes: '枚举只做值约束，不生成业务逻辑',
    docTopic: 'enums',
  },
  values: {
    keyword: 'values',
    title: '枚举值列表',
    category: 'enum',
    example: 'values: [pendingPayment, paid, cancelled]',
    notes: '至少 1 项，不可重复',
    docTopic: 'enums',
  },
  labels: {
    keyword: 'labels',
    title: '枚举值标签',
    category: 'enum',
    example: 'labels:\n  pendingPayment: 待付款',
    notes: '可选，前端显示用',
    docTopic: 'enums',
  },
  state: {
    keyword: 'state',
    title: '状态机',
    category: 'enum',
    example: 'state:\n  initial: pendingPayment\n  transitions:\n    - from: pendingPayment\n      to: paid\n      action: pay',
    notes: '状态机只做流转校验，业务逻辑需 Service 手写',
    docTopic: 'enums',
  },

  // ============ 实体 ============
  entities: {
    keyword: 'entities',
    title: '实体容器',
    category: 'entity',
    example: 'entities:\n  User:\n    table: users\n    fields:\n      id: { type: id }',
    notes: '实体生成 DTO/Mapper/Service/Controller 的前提是先有 views 和 api',
    docTopic: 'entities',
  },
  fields: {
    keyword: 'fields',
    title: '字段容器',
    category: 'entity',
    example: 'fields:\n  id: { type: id }\n  name: { type: string, length: 64 }',
    notes: '实体和视图的 fields 都必填，至少 1 个字段',
    docTopic: 'entities',
  },
  table: {
    keyword: 'table',
    title: '表名',
    category: 'entity',
    typeConstraint: 'string，^[a-z][a-z0-9_]*$',
    example: 'entities:\n  User:\n    table: sys_users',
    notes: '可选，默认从实体名派生（User → users）',
    docTopic: 'entities',
  },
  indexes: {
    keyword: 'indexes',
    title: '表级索引',
    category: 'entity',
    example: 'indexes:\n  - fields: [categoryId, status]\n    unique: false',
    notes: '复合索引用；单列索引用字段级的 index/unique',
    docTopic: 'entities',
  },

  // ============ 视图 ============
  views: {
    keyword: 'views',
    title: '视图容器',
    category: 'view',
    example: 'views:\n  UserForm:\n    kind: form\n    fields:\n      name: { type: string }',
    notes: '视图有 4 种 kind：form / query / brief / detail',
    docTopic: 'views',
  },
  required: {
    keyword: 'required',
    title: '必填字段列表',
    category: 'view',
    example: 'views:\n  UserForm:\n    kind: form\n    required: [name, phone]\n    fields: {}',
    notes: '列出的字段名必须在 fields 里存在（C13）',
    docTopic: 'views',
  },

  // ============ 接口 ============
  api: {
    keyword: 'api',
    title: '接口容器',
    category: 'api',
    example: 'api:\n  createOrder:\n    method: POST\n    path: /orders\n    input: OrderForm',
    notes: 'api 名必须 camelCase；按 domain 分组生成 Controller/Service',
    docTopic: 'apis',
  },
  method: {
    keyword: 'method',
    title: 'HTTP 方法',
    category: 'api',
    values: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    example: 'method: POST',
    notes: '必填，大写',
    docTopic: 'apis',
  },
  path: {
    keyword: 'path',
    title: 'URL 路径',
    category: 'api',
    typeConstraint: '必须以 / 开头；路径参数写 :id',
    example: 'path: /orders/:id',
    notes: '路径参数必须在 pathParams 里声明（C28）',
    docTopic: 'apis',
  },
  input: {
    keyword: 'input',
    title: '入参视图',
    category: 'api',
    typeConstraint: '引用的视图 kind 必须是 form',
    example: 'input: OrderForm',
    notes: '可选；用 detail/brief 会报 C33（入参方向只能是 form）',
    docTopic: 'apis',
  },
  output: {
    keyword: 'output',
    title: '出参视图',
    category: 'api',
    example: 'output: OrderDetail',
    notes: '可选；通常是 brief 或 detail 视图',
    docTopic: 'apis',
  },
  query: {
    keyword: 'query',
    title: 'URL 查询参数',
    category: 'api',
    example: 'query:\n  page: { type: int }\n  size: { type: int }',
    notes: '只能是标量（primitive 或 enum），C29',
    docTopic: 'apis',
  },
  pathParams: {
    keyword: 'pathParams',
    title: 'URL 路径参数',
    category: 'api',
    example: 'pathParams:\n  id: { type: id, idType: long }',
    notes: '路径里每个 :xxx 都必须在这里声明（C28）',
    docTopic: 'apis',
  },
  auth: {
    keyword: 'auth',
    title: '接口权限',
    category: 'api',
    values: ['public', 'authenticated', 'roles 数组'],
    example: 'auth: { roles: [admin] }',
    notes: 'roles 值必须来自 UserRole 枚举（C9）',
    docTopic: 'apis',
  },

  // ============ 修饰符 ============
  nullable: {
    keyword: 'nullable',
    title: '可空',
    category: 'modifier',
    position: ['entity', 'form', 'query', 'output', 'apiQuery'],
    values: [true, false],
    example: 'phone:\n  type: string\n  nullable: true',
    notes: '路径参数必填，故不能配 nullable',
    docTopic: 'modifier-scope',
  },
  unique: {
    keyword: 'unique',
    title: '唯一约束',
    category: 'modifier',
    position: ['entity'],
    values: [true, false],
    example: 'name:\n  type: string\n  unique: true',
    notes: '唯一字段会自动生成 Mapper.findByXxx',
    docTopic: 'modifier-scope',
  },
  index: {
    keyword: 'index',
    title: '单列索引',
    category: 'modifier',
    position: ['entity'],
    values: [true, false],
    example: 'status:\n  type: int\n  index: true',
    notes: '复合索引用 indexes；unique 已含索引语义，不要再配 index',
    docTopic: 'modifier-scope',
  },
  auto: {
    keyword: 'auto',
    title: '自动填充时间戳',
    category: 'modifier',
    position: ['entity'],
    values: ['create', 'update'],
    typeConstraint: '必须配 type: datetime',
    example: 'createdAt:\n  type: datetime\n  auto: create',
    notes: '生成 @TableField(fill)；需消费方提供 MetaObjectHandler 才生效',
    docTopic: 'modifier-scope',
  },
  ref: {
    keyword: 'ref',
    title: '外键引用',
    category: 'modifier',
    position: ['entity'],
    typeConstraint: '指向另一个实体名',
    example: 'userId:\n  ref: User',
    notes: '编译期类型投影（非运行时外键）；不生成 FK 约束',
    docTopic: 'modifier-scope',
  },
  idType: {
    keyword: 'idType',
    title: '主键类型',
    category: 'modifier',
    position: ['entity', 'pathParams'],
    values: ['long', 'string', 'uuid'],
    example: 'id:\n  type: id\n  idType: long',
    notes: '默认 long；路径参数也需声明',
    docTopic: 'modifier-scope',
  },
  length: {
    keyword: 'length',
    title: '字符串长度',
    category: 'modifier',
    position: ['entity', 'form', 'query'],
    typeConstraint: 'integer ≥ 1',
    example: 'name:\n  type: string\n  length: 64',
    notes: '默认 255；影响 DDL varchar(n)',
    docTopic: 'modifier-scope',
  },
  default: {
    keyword: 'default',
    title: '默认值',
    category: 'modifier',
    position: ['entity', 'form'],
    example: 'status:\n  type: int\n  default: 1',
    notes: '当前不落 SQL DDL，不落 DTO 默认值（P2-1）',
    docTopic: 'modifier-scope',
  },
  of: {
    keyword: 'of',
    title: '数组元素类型',
    category: 'modifier',
    position: ['entity', 'form', 'query', 'output'],
    typeConstraint: '必须配 type: array',
    example: 'tags:\n  type: array\n  of: string',
    notes: '数组字段必须写 of（C15）',
    docTopic: 'modifier-scope',
  },
  from: {
    keyword: 'from',
    title: '出参来源',
    category: 'modifier',
    position: ['output'],
    typeConstraint: '格式 Entity.field',
    example: 'views:\n  UserBrief:\n    kind: brief\n    fields:\n      name:\n        type: string\n        from: User.name',
    notes: '出参才有「来源」概念；入参禁用',
    docTopic: 'modifier-scope',
  },
  sensitive: {
    keyword: 'sensitive',
    title: '出参打码',
    category: 'modifier',
    position: ['output'],
    values: ['mask', 'hide'],
    typeConstraint: '必须配 type: string',
    example: 'views:\n  OrderDetail:\n    kind: detail\n    fields:\n      phone:\n        type: string\n        from: Order.phone\n        sensitive: mask',
    notes: 'mask 返回时打码（138****1234）；hide 返回时省略',
    docTopic: 'modifier-scope',
  },
  writeOnly: {
    keyword: 'writeOnly',
    title: '入参只写',
    category: 'modifier',
    position: ['form'],
    values: [true, false],
    example: 'views:\n  UserForm:\n    kind: form\n    fields:\n      password:\n        type: string\n        writeOnly: true',
    notes: '只进不出（密码）；仅 form 可用',
    docTopic: 'modifier-scope',
  },
  validate: {
    keyword: 'validate',
    title: '字段校验',
    category: 'modifier',
    position: ['form', 'query', 'apiQuery', 'pathParams'],
    typeConstraint: '字符串（引用 rules 里的名字）或对象 { pattern/minLength/... }',
    example: 'phone:\n  type: string\n  validate: phoneRule',
    notes: '字符串形式必须能在 rules 里找到（C23）',
    docTopic: 'modifier-scope',
  },
  validateRef: {
    keyword: 'validateRef',
    title: '字段间校验',
    category: 'modifier',
    position: ['form'],
    typeConstraint: '指向同视图里另一个字段名',
    example: 'confirmPassword:\n  type: string\n  validateRef: password',
    notes: '典型场景：确认密码与密码一致',
    docTopic: 'modifier-scope',
  },
  derived: {
    keyword: 'derived',
    title: '服务端装配字段',
    category: 'modifier',
    position: ['output'],
    values: ['text', 'join', 'relation', 'permission', 'compute'],
    example: 'views:\n  UserDetail:\n    kind: detail\n    fields:\n      roleNames:\n        type: array\n        of: string\n        derived: relation\n        via: [UserRole.userId]',
    notes: '与 from 互斥（C32）；relation 需配 via',
    docTopic: 'modifier-scope',
  },

  // ============ 类型 ============
  'type:id': {
    keyword: 'id',
    title: '主键类型',
    category: 'type',
    values: ['long', 'string', 'uuid'],
    example: 'id:\n  type: id\n  idType: long',
    notes: '每个实体恰好一个 type:id 主键（C18）',
    docTopic: 'type-system',
  },
  'type:string': {
    keyword: 'string',
    title: '字符串',
    category: 'type',
    example: 'name: { type: string, length: 64 }',
    notes: '默认长度 255；可配 length',
    docTopic: 'type-system',
  },
  'type:text': {
    keyword: 'text',
    title: '长文本',
    category: 'type',
    example: 'content: { type: text }',
    notes: '对应 DDL text / longtext',
    docTopic: 'type-system',
  },
  'type:int': {
    keyword: 'int',
    title: '整数',
    category: 'type',
    example: 'count: { type: int }',
    notes: '对应 Java Integer',
    docTopic: 'type-system',
  },
  'type:long': {
    keyword: 'long',
    title: '长整数',
    category: 'type',
    example: 'amount: { type: long }',
    notes: '对应 Java Long',
    docTopic: 'type-system',
  },
  'type:decimal': {
    keyword: 'decimal',
    title: '小数',
    category: 'type',
    example: 'price: { type: decimal }',
    notes: '对应 BigDecimal；DDL numeric(18,2)',
    docTopic: 'type-system',
  },
  'type:boolean': {
    keyword: 'boolean',
    title: '布尔',
    category: 'type',
    example: 'enabled: { type: boolean }',
    notes: '对应 Java Boolean',
    docTopic: 'type-system',
  },
  'type:date': {
    keyword: 'date',
    title: '日期',
    category: 'type',
    example: 'birthday: { type: date }',
    notes: '只有日期部分',
    docTopic: 'type-system',
  },
  'type:datetime': {
    keyword: 'datetime',
    title: '日期时间',
    category: 'type',
    example: 'createdAt: { type: datetime }',
    notes: '对应 Java OffsetDateTime；DDL timestamptz / datetime',
    docTopic: 'type-system',
  },
  'type:array': {
    keyword: 'array',
    title: '数组',
    category: 'type',
    typeConstraint: '必须配 of',
    example: 'tags: { type: array, of: string }',
    notes: '数组必须写 of（C15）',
    docTopic: 'type-system',
  },
}

/** 按类别分组，供 syntax 无参数时打印 */
export const CATEGORY_LABELS = {
  top: '顶层',
  enum: '枚举',
  entity: '实体',
  view: '视图',
  api: '接口',
  modifier: '修饰符',
  type: '类型',
}

/** 按类别分组的关键字列表 */
export function groupByCategory() {
  const groups = {}
  for (const [k, v] of Object.entries(SYNTAX_INDEX)) {
    if (!groups[v.category]) groups[v.category] = []
    groups[v.category].push(v)
  }
  return groups
}

/** 查找关键字（支持直接 key 和 keyword 字段） */
export function lookup(key) {
  if (SYNTAX_INDEX[key]) return SYNTAX_INDEX[key]
  for (const v of Object.values(SYNTAX_INDEX)) {
    if (v.keyword === key) return v
  }
  return null
}
