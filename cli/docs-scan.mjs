/**
 * 扫描 docs/part1~part5 下的 md 文件，提取 topic 列表。
 *
 * 设计原则：新增 md 文件自动出现在 `polyforge docs` 列表里，
 * 不需要改 index。防漂移。
 *
 * 排除规则：docs/ 根目录的 README.md / BASELINES.md / VERSIONING.md /
 *           WRITING-GUIDE.md 是导航/元文档，不算 topic。
 *
 * id 派生：相对路径去序号前缀。
 *   part2-model-spec/10-modifier-scope.md  → modifier-scope
 *   part3-usage/2-cli.md                    → cli
 *
 * title 派生：文件第一行 `# xxx`。
 * group 派生：目录名 → 中文分组名。
 */

import { readdirSync, readFileSync, existsSync } from 'fs'
import { join, dirname, basename, relative } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS_ROOT = join(__dirname, '..', 'docs')

/** part 目录 → 中文分组名 */
const GROUP_LABELS = {
  'part1-getting-started': '入门',
  'part2-model-spec': '模型规范',
  'part3-usage': '使用',
  'part4-design': '原理',
  'part5-extending': '扩展',
}

/** 排除的目录（不在 part1~part5 下的） */
const EXCLUDED_DIRS = ['appendix']

/** 从文件名派生 id：去序号前缀，保留 kebab-case */
function deriveId(filename) {
  // 1-file-organization.md → file-organization
  // 10-modifier-scope.md   → modifier-scope
  return basename(filename, '.md').replace(/^\d+-/, '')
}

/** 读文件第一行，提取 `# xxx` 的 title */
function readTitle(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const firstLine = content.split('\n')[0] || ''
    const m = firstLine.match(/^#\s+(.+)$/)
    return m ? m[1].trim() : null
  } catch {
    return null
  }
}

/**
 * 扫描 docs/，返回分组后的 topic 列表。
 *
 * @returns {Array<{ group: string, topics: Array<{ id, title, file, sourcePath }> }>}
 */
export function scanDocs() {
  const result = []

  if (!existsSync(DOCS_ROOT)) return result

  const entries = readdirSync(DOCS_ROOT, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!GROUP_LABELS[entry.name]) continue
    if (EXCLUDED_DIRS.includes(entry.name)) continue

    const dirPath = join(DOCS_ROOT, entry.name)
    const files = readdirSync(dirPath).filter((f) => f.endsWith('.md'))
    if (files.length === 0) continue

    const topics = files.map((f) => {
      const filePath = join(dirPath, f)
      const title = readTitle(filePath) || deriveId(f)
      const sourcePath = relative(DOCS_ROOT, filePath).replace(/\\/g, '/')
      return {
        id: deriveId(f),
        title,
        file: filePath,
        sourcePath,
      }
    })

    result.push({
      group: GROUP_LABELS[entry.name],
      topics,
    })
  }

  return result
}

/**
 * 读某 topic 的 md 全文。
 *
 * @param {string} topicId  topic id（如 modifier-scope）
 * @returns {{ id, title, content, sourcePath } | null}
 */
export function readDoc(topicId) {
  const groups = scanDocs()
  for (const g of groups) {
    for (const t of g.topics) {
      if (t.id === topicId) {
        try {
          return {
            id: t.id,
            title: t.title,
            content: readFileSync(t.file, 'utf-8'),
            sourcePath: t.sourcePath,
          }
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** 列出所有 topic id（供 docs-sync 检查用） */
export function allTopicIds() {
  const ids = []
  for (const g of scanDocs()) {
    for (const t of g.topics) ids.push(t.id)
  }
  return ids
}
