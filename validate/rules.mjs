/**
 * 校验规则注册表（唯一权威源）
 * 所有 C 编号在此集中定义。
 */
export const RULES = {
  C1:  { level: 'error',   summary: '引用必须存在', scope: '引用', impl: 'build-ir' },
  C2:  { level: 'error',   summary: '字段类型必须匹配', scope: '引用', impl: 'build-ir' },
  C3:  { level: 'error',   summary: '依赖方向合法', scope: '依赖', impl: 'validate' },
  C4:  { level: 'error',   summary: '强引用不能成环', scope: '依赖', impl: 'validate' },
  C5:  { level: 'warning', summary: '未使用的定义', scope: '引用', impl: 'build-ir' },
  C6:  { level: 'error',   summary: '名字全局唯一', scope: '命名', impl: 'build-ir' },
  C7:  { level: 'error',   summary: '跨域依赖不能成环', scope: '依赖', impl: 'validate' },
  C8:  null,
  C9:  { level: 'error',   summary: 'auth.roles 角色在 UserRole 枚举内', scope: '权限', impl: 'validate' },
  C10: { level: 'error',   summary: '状态机流转角色在 UserRole 枚举内', scope: '权限', impl: 'validate' },
  C11: null,
  C12: { level: 'error',   summary: '命名规范', scope: '命名', impl: 'validate' },
  C13: { level: 'error',   summary: 'required 里的字段必须存在', scope: '视图', impl: 'validate' },
  C14: null,
  C15: { level: 'error',   summary: '数组字段必须写 of', scope: '视图', impl: 'validate' },
  C16: { level: 'error',   summary: '索引引用的字段必须存在', scope: '实体', impl: 'validate' },
  C17: { level: 'error',   summary: '索引的 fields 非空', scope: '实体', impl: 'validate' },
  C18: { level: 'error',   summary: '实体恰有一个 type:id 主键', scope: '实体', impl: 'validate' },
  C19: { level: 'error',   summary: 'auto 只能配 datetime', scope: '实体', impl: 'validate' },
  C20: { level: 'error',   summary: 'sensitive 只能用在 string', scope: '实体', impl: 'validate' },
  C21: { level: 'error',   summary: '主键不能 nullable', scope: '实体', impl: 'validate' },
  C22: { level: 'error',   summary: 'of 只能配 type:array', scope: '视图', impl: 'validate' },
  C23: { level: 'error',   summary: 'validate 引用的规则必须在 rules 中定义', scope: '视图', impl: 'validate' },
  C24: { level: 'error',   summary: 'validateRef 指向的字段必须存在', scope: '视图', impl: 'validate' },
  C25: { level: 'error',   summary: 'api 角色必须在 permissions 里定义', scope: '权限', impl: 'validate' },
  C26: { level: 'error',   summary: '实体禁 json 类型', scope: '实体', impl: 'validate' },
  C27: { level: 'error',   summary: 'from 类型必须兼容', scope: '视图', impl: 'validate' },
  C28: { level: 'error',   summary: '路径参数必须在 pathParams 声明', scope: '接口', impl: 'validate' },
  C29: { level: 'error',   summary: 'query / pathParams 只能是标量', scope: '接口', impl: 'validate' },
  C30: { level: 'error',   summary: '字段名暗示日期的必须用 date/datetime', scope: '类型', impl: 'validate' },
  C31: { level: 'error',   summary: '修饰符必须用在允许的位置', scope: '位置', impl: 'validate' },
  C32: { level: 'error',   summary: 'derived 字段的语义约束', scope: '行为', impl: 'validate' },
}
export function rule(id) { return RULES[id] || null }
export function implementedIds() { return Object.keys(RULES).filter((k) => RULES[k]) }
export function retiredIds() { return Object.keys(RULES).filter((k) => !RULES[k]) }
