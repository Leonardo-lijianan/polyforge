/**
 * polyforge docs 子命令。
 *
 * 三种形态：
 *   polyforge docs                     列出全部文档章节
 *   polyforge docs <topic>             打印该章节全文
 *   polyforge docs <topic> --json      输出结构化 JSON
 *
 * <topic> 会先查文件级 topic（扫 docs/），再查细粒度关键字（syntax-index）。
 * 细粒度关键字（如 sensitive）打印结构化摘要，不打全文。
 */

import { scanDocs, readDoc } from './docs-scan.mjs'
import { SYNTAX_INDEX } from './syntax-index.mjs'

/** 列出全部文档 */
function listDocs() {
  const groups = scanDocs()
  const lines = ['polyforge 文档', '']

  for (const g of groups) {
    lines.push(g.group)
    for (const t of g.topics) {
      lines.push('  ' + (t.id.length >= 20 ? t.id + '  ' : t.id.padEnd(20)) + t.title)
    }
    lines.push('')
  }

  // 细粒度关键字（只列有 docTopic 的，避免和文件级重复）
  const anchorKeys = Object.entries(SYNTAX_INDEX)
    .filter(([, v]) => v.category === 'modifier')
    .map(([k, v]) => ({ id: k, title: v.title }))
  if (anchorKeys.length) {
    lines.push('细粒度主题（来自 syntax）')
    for (const a of anchorKeys) {
      lines.push('  ' + a.id.padEnd(20) + a.title)
    }
    lines.push('')
  }

  lines.push('用法：polyforge docs <topic>')
  lines.push('      polyforge docs <topic> --json')

  return lines.join('\n')
}

/** 打印细粒度关键字摘要 */
function renderAnchor(kw) {
  const lines = []
  lines.push(kw.keyword + ' — ' + kw.title)
  lines.push('')
  lines.push('类别   ' + categoryLabel(kw.category))
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

function categoryLabel(cat) {
  const map = {
    top: '顶层',
    enum: '枚举',
    entity: '实体',
    view: '视图',
    api: '接口',
    modifier: '修饰符',
    type: '类型',
  }
  return map[cat] || cat
}

/**
 * 主入口。
 *
 * @param {string[]} positionals  polyforge docs 之后的参数
 * @param {boolean} json          --json
 * @returns {{ output: string, exit: number }}
 */
export function runDocs(positionals, json) {
  const topicId = positionals[0]

  // 无参数：列出全部
  if (!topicId) {
    return { output: listDocs(), exit: 0 }
  }

  // 先查文件级 topic
  const doc = readDoc(topicId)
  if (doc) {
    if (json) {
      return {
        output: JSON.stringify({
          id: doc.id,
          title: doc.title,
          kind: 'file',
          sourcePath: doc.sourcePath,
          content: doc.content,
        }, null, 2),
        exit: 0,
      }
    }
    return { output: doc.content, exit: 0 }
  }

  // 再查细粒度关键字
  const kw = SYNTAX_INDEX[topicId]
  if (kw) {
    if (json) {
      return {
        output: JSON.stringify({
          id: kw.keyword,
          title: kw.title,
          kind: 'anchor',
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
    return { output: renderAnchor(kw), exit: 0 }
  }

  // 未知 topic
  return {
    output: '[polyforge] 未知 topic：' + topicId + '\n\n运行 polyforge docs 查看完整列表。\n',
    exit: 1,
  }
}
