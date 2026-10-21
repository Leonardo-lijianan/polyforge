/**
 * 错误码 → 修法示例。纯数据 + 函数。
 *
 * 每条 hint 是函数，接收错误上下文，返回：
 *   { fix: string, keyword?: string, docTopic?: string }
 *
 * keyword 引用 cli/syntax-index.mjs 里的键；
 * docTopic 引用 docs/ 里的 topic id。
 *
 * tests/docs-sync.mjs 检查 keyword 和 docTopic 都存在。
 */

export const ERROR_HINTS = {
  // ============ schema 层（按 keyword 分发） ============
  'schema:enum': (e) => {
    const allowed = (e.allowedValues || []).filter(Boolean)
    return {
      fix: allowed.length ? '合法取值：' + allowed.join(' | ') : '检查枚举取值',
      keyword: null,
      docTopic: null,
    }
  },
  'schema:additionalProperties': (e) => ({
    fix: '删掉多余字段 ' + (e.property || '') + '，或检查拼写',
    keyword: null,
    docTopic: null,
  }),
  'schema:type': (e) => {
    const expected = e.expectedType || e.message || ''
    // 常见字段特判：给更精准的提示
    if (/sensitive/i.test(e.path || '')) {
      return {
        fix: 'sensitive 只接受 mask / hide（字符串），且仅 brief / detail 视图可用',
        keyword: 'sensitive',
        docTopic: 'modifier-scope',
      }
    }
    if (/writeOnly/i.test(e.path || '')) {
      return {
        fix: 'writeOnly: true（布尔），仅 form 视图可用',
        keyword: 'writeOnly',
        docTopic: 'modifier-scope',
      }
    }
    if (/auto/i.test(e.path || '')) {
      return {
        fix: 'auto: create 或 update（字符串）',
        keyword: 'auto',
        docTopic: 'modifier-scope',
      }
    }
    if (/derived/i.test(e.path || '')) {
      return {
        fix: 'derived: text | join | relation | permission | compute',
        keyword: 'derived',
        docTopic: 'modifier-scope',
      }
    }
    if (/idType/i.test(e.path || '')) {
      return {
        fix: 'idType: long | string | uuid',
        keyword: 'idType',
        docTopic: 'modifier-scope',
      }
    }
    return {
      fix: expected ? '类型应为 ' + expected : '检查字段类型',
      keyword: null,
      docTopic: 'field-syntax',
    }
  },
  'schema:required': (e) => ({
    fix: '补上必填字段 ' + (e.property || ''),
    keyword: null,
    docTopic: null,
  }),
  'schema:pattern': (e) => ({
    fix: '格式不符合 ' + (e.pattern || '规定格式'),
    keyword: null,
    docTopic: null,
  }),
  'schema:oneOf': () => ({
    fix: '不符合任一允许的形态，检查写法',
    keyword: null,
    docTopic: null,
  }),

  // ============ C 编号层 ============
  C13: () => ({
    fix: 'required 里列出的字段必须在 fields 里存在',
    keyword: 'required',
    docTopic: 'views',
  }),
  C15: () => ({
    fix: '数组字段必须写 of，如 of: string',
    keyword: 'of',
    docTopic: 'modifier-scope',
  }),
  C18: () => ({
    fix: '每个实体恰好一个 type: id 字段作为主键',
    keyword: 'type:id',
    docTopic: 'entities',
  }),
  C19: () => ({
    fix: 'auto 只能配 type: datetime',
    keyword: 'auto',
    docTopic: 'modifier-scope',
  }),
  C20: () => ({
    fix: 'sensitive 只能配 type: string',
    keyword: 'sensitive',
    docTopic: 'modifier-scope',
  }),
  C21: () => ({
    fix: '主键不能声明 nullable',
    keyword: 'nullable',
    docTopic: 'modifier-scope',
  }),
  C22: () => ({
    fix: 'of 只能配 type: array',
    keyword: 'of',
    docTopic: 'modifier-scope',
  }),
  C23: () => ({
    fix: 'validate 字符串必须能在 rules 里找到定义',
    keyword: 'validate',
    docTopic: 'modifier-scope',
  }),
  C24: () => ({
    fix: 'validateRef 必须指向同视图里的另一个字段',
    keyword: 'validateRef',
    docTopic: 'modifier-scope',
  }),
  C28: (e) => ({
    fix: e.param
      ? '在 api 下补 pathParams: { ' + e.param + ': { type: id } }'
      : '路径里的 :xxx 必须在 pathParams 里声明',
    keyword: 'pathParams',
    docTopic: 'apis',
  }),
  C29: () => ({
    fix: 'query / pathParams 只能是 primitive 或 enum，不能是 entity/view/array',
    keyword: 'query',
    docTopic: 'apis',
  }),
  C30: () => ({
    fix: '字段名以 Time/At/Date 结尾时类型必须是 date/datetime',
    keyword: null,
    docTopic: 'type-system',
  }),
  C31: (e) => ({
    fix: e.mod
      ? '把 ' + e.mod + ' 从当前位置移除，或改用 ' + (e.allowedLocs || []).join(' / ')
      : '修饰符位置不合法，详见修饰符矩阵',
    keyword: e.mod || null,
    docTopic: 'modifier-scope',
  }),
  C32: () => ({
    fix: 'derived 与 from 互斥；relation 需配 via',
    keyword: 'derived',
    docTopic: 'modifier-scope',
  }),
  C33: (e) => ({
    fix: 'input 改成 form 视图；detail/brief 只能用作 output',
    keyword: 'input',
    docTopic: 'apis',
  }),

  // ============ 配置错误 ============
  'config:no-file': () => ({
    fix: '在项目根目录创建 polyforge.config.yaml，最小示例见 polyforge docs config',
    keyword: null,
    docTopic: 'config',
  }),
  'config:no-source': () => ({
    fix: '补 source: { git, ref }',
    keyword: null,
    docTopic: 'config',
  }),
  'config:bad-source': () => ({
    fix: 'source 只能是 git 形式；本地调试用环境变量 POLYFORGE_SOURCE',
    keyword: null,
    docTopic: 'config',
  }),
  'config:no-schema-version': () => ({
    fix: "顶层添加 schemaVersion: '1.0'",
    keyword: null,
    docTopic: 'config',
  }),
}

/**
 * 查找 hint。
 *
 * @param {string} code  schema:xxx / C31 / config:no-file 等
 * @param {object} ctx   错误上下文
 * @returns {{ fix, keyword, docTopic } | null}
 */
export function lookupHint(code, ctx = {}) {
  const fn = ERROR_HINTS[code]
  if (!fn) return null
  try {
    return fn(ctx)
  } catch {
    return null
  }
}
