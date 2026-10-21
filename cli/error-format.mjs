/**
 * 错误对象 → 可读文本。
 *
 * 两种模式：
 *   默认     两行：错误摘要 + 修法/速查
 *   --verbose 多行：错误摘要 + 空行 + 详细说明 + 正确示例 + 文档/速查入口
 *
 * 不依赖生成逻辑，纯格式化。
 */

import { lookupHint } from '../validate/error-hints.mjs'
import { SYNTAX_INDEX } from './syntax-index.mjs'

/** 按错误对象推断 hint 键 */
function hintKey(err) {
  if (err.code) return err.code
  if (err.kind === 'schema') return 'schema:' + (err.keyword || 'type')
  if (err.kind === 'config') return 'config:' + (err.subkind || 'no-file')
  return null
}

/** 默认两行格式 */
export function formatErrorCompact(err) {
  const lines = []
  lines.push('  [error] ' + err.summary)

  const key = hintKey(err)
  const hint = key ? lookupHint(key, err) : null
  if (hint && hint.fix) {
    const parts = ['修法：' + hint.fix]
    if (hint.keyword) parts.push('polyforge syntax ' + hint.keyword)
    else if (hint.docTopic) parts.push('polyforge docs ' + hint.docTopic)
    lines.push('          ' + parts.join('  |  '))
  } else if (hint && hint.docTopic) {
    lines.push('          详见：polyforge docs ' + hint.docTopic)
  }

  return lines.join('\n')
}

/** --verbose 完整格式 */
export function formatErrorVerbose(err) {
  const lines = []
  lines.push('  [error] ' + err.summary)
  lines.push('')

  if (err.detail) {
    for (const line of err.detail.split('\n')) {
      lines.push('          ' + line)
    }
    lines.push('')
  }

  const key = hintKey(err)
  const hint = key ? lookupHint(key, err) : null
  if (hint && hint.keyword && SYNTAX_INDEX[hint.keyword]) {
    const kw = SYNTAX_INDEX[hint.keyword]
    lines.push('          正确写法（' + kw.keyword + '）：')
    for (const line of (kw.example || '').split('\n')) {
      lines.push('            ' + line)
    }
    if (kw.notes) {
      lines.push('')
      lines.push('          说明：' + kw.notes)
    }
    lines.push('')
  }

  if (hint) {
    if (hint.fix) lines.push('          修法：' + hint.fix)
    if (hint.keyword) lines.push('          速查：polyforge syntax ' + hint.keyword)
    if (hint.docTopic) lines.push('          文档：polyforge docs ' + hint.docTopic)
  } else if (err.docTopic) {
    lines.push('          文档：polyforge docs ' + err.docTopic)
  }

  return lines.join('\n')
}

/**
 * 格式化一批错误。
 *
 * @param {object[]} errors
 * @param {boolean} verbose
 * @returns {string}
 */
export function formatErrors(errors, verbose = false) {
  const fn = verbose ? formatErrorVerbose : formatErrorCompact
  return errors.map(fn).join('\n')
}
