/**
 * polyforge syntax 子命令。
 *
 * 三种形态：
 *   polyforge syntax                   列出全部关键字
 *   polyforge syntax <关键字>          打印该关键字速查
 *   polyforge syntax <关键字> --json   输出结构化 JSON
 *
 * 数据源：cli/syntax-index.mjs
 */

import { SYNTAX_INDEX, CATEGORY_LABELS, groupByCategory, lookup } from './syntax-index.mjs'

/** 列出全部关键字（按类别分组） */
function listKeywords() {
  const groups = groupByCategory()
  const lines = ['polyforge DSL 语法速查', '']

  // 类别顺序
  const order = ['top', 'enum', 'entity', 'view', 'api', 'modifier', 'type']
  for (const cat of order) {
    const list = groups[cat]
    if (!list || list.length === 0) continue
    lines.push(CATEGORY_LABELS[cat])
    for (const kw of list) {
      let line = '  ' + kw.keyword.padEnd(18) + kw.title
      if (kw.values && kw.values.length <= 6) {
        line += '（' + kw.values.join(' | ') + '）'
      } else if (kw.position) {
        line += '（' + kw.position.join(' / ') + '）'
      }
      lines.push(line)
    }
    lines.push('')
  }

  lines.push('用法：polyforge syntax <关键字>')
  lines.push('      polyforge syntax <关键字> --json')

  return lines.join('\n')
}

/** 打印单个关键字速查 */
function renderKeyword(kw) {
  const lines = []
  lines.push(kw.keyword + ' — ' + kw.title)
  lines.push('')
  lines.push('类别   ' + CATEGORY_LABELS[kw.category])
  if (kw.position) lines.push('位置   ' + kw.position.join(' / '))
  if (kw.values) lines.push('取值   ' + kw.values.join(' | '))
  if (kw.typeConstraint) lines.push('类型   ' + kw.typeConstraint)
  lines.push('')
  lines.push('示例')
  for (const line of (kw.example || '').split('\n')) {
    lines.push('  ' + line)
  }
  lines.push('')
  if (kw.notes) lines.push('说明   ' + kw.notes)
  if (kw.docTopic) {
    lines.push('')
    lines.push('相关文档   polyforge docs ' + kw.docTopic)
  }
  return lines.join('\n')
}

/**
 * 主入口。
 *
 * @param {string[]} positionals
 * @param {boolean} json
 * @returns {{ output: string, exit: number }}
 */
export function runSyntax(positionals, json) {
  const key = positionals[0]

  // 无参数：列出全部
  if (!key) {
    return { output: listKeywords(), exit: 0 }
  }

  const kw = lookup(key)
  if (!kw) {
    return {
      output: '[polyforge] 未知关键字：' + key + '\n\n运行 polyforge syntax 查看完整列表。\n',
      exit: 1,
    }
  }

  if (json) {
    return {
      output: JSON.stringify({
        keyword: kw.keyword,
        title: kw.title,
        category: kw.category,
        position: kw.position || null,
        values: kw.values || null,
        typeConstraint: kw.typeConstraint || null,
        example: kw.example || null,
        notes: kw.notes || null,
        docTopic: kw.docTopic || null,
      }, null, 2),
      exit: 0,
    }
  }

  return { output: renderKeyword(kw), exit: 0 }
}
