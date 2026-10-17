/**
 * 模型加载器（Step 1）
 * 职责：扫源目录下所有 .yaml，读成原始对象数组
 * 不做：解析引用、建图、校验
 *
 * 源目录由调用方（index.mjs）从配置解析后传入。
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { load } from 'js-yaml'

/**
 * 递归扫目录，收集所有 .yaml / .yml 文件路径。
 *
 * 排除目录：
 *   - 以 . 开头的（.git / .github / .gitlab / .vscode ...）：
 *     git 仓库根有 CI 配置、IDE 配置，都是 .yml 但不是契约。
 *   - node_modules：第三方依赖里的 yaml 不是契约。
 */
const EXCLUDE_DIRS = new Set(['node_modules'])
function collectYamlFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && (entry.name.startsWith('.') || EXCLUDE_DIRS.has(entry.name))) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectYamlFiles(full))
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      out.push(full)
    }
  }
  return out
}

/** 读单个 YAML 文件 */
function readYaml(file) {
  const text = readFileSync(file, 'utf-8')
  const doc = load(text)
  if (doc === null || typeof doc !== 'object') {
    throw new Error('文件内容不是对象: ' + file)
  }
  return doc
}

/**
 * 加载全部模型文件
 * @param {string} sourceRoot 源目录绝对路径
 * @returns {Array<{file: string, rel: string, doc: object}>}
 */
export function loadAll(sourceRoot) {
  const files = collectYamlFiles(sourceRoot)
  const result = []
  // 统一分隔符后再计算相对路径（兼容 Windows \ 与 POSIX /）
  const rootNorm = sourceRoot.replace(/\\/g, '/')
  for (const file of files) {
    const fileNorm = file.replace(/\\/g, '/')
    const rel = fileNorm.startsWith(rootNorm + '/')
      ? fileNorm.slice(rootNorm.length + 1)
      : fileNorm
    const doc = readYaml(file)
    result.push({ file, rel, doc })
  }
  return result
}
