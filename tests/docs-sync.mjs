#!/usr/bin/env node
/**
 * 文档与代码防漂移检查。
 *
 * 四项检查：
 *   1. SYNTAX_INDEX 每个 keyword 在 contract.schema.json 里能找到对应字段
 *   2. docs 下每个 .md 第一行都是 `# ` 开头（否则 docs-scan 拿不到 title）
 *   3. SYNTAX_INDEX 每个 docTopic 引用的 topic 都存在
 *   4. error-hints 里静态声明的 keyword 都在 SYNTAX_INDEX 里
 *
 * 漂移是硬伤，不能靠人记得跑。进 npm test。
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { SYNTAX_INDEX } from '../cli/syntax-index.mjs'
import { scanDocs, allTopicIds } from '../cli/docs-scan.mjs'
import { ERROR_HINTS } from '../validate/error-hints.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SCHEMA_PATH = join(ROOT, 'schemas', 'contract.schema.json')

let pass = 0
let fail = 0

function check(name, cond, detail) {
  if (cond) {
    pass++
    console.log('  [OK]   ' + name)
  } else {
    fail++
    console.log('  [FAIL] ' + name)
    if (detail) console.log('         ' + detail)
  }
}

// ============ 读 schema，收集合法字段名 ============
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'))
const topProps = new Set(Object.keys(schema.properties || {}))
const fieldProps = new Set(Object.keys(schema.$defs?.FieldDef?.properties || {}))
const enumProps = new Set(Object.keys(schema.$defs?.EnumDef?.properties || {}))
const entityProps = new Set(Object.keys(schema.$defs?.EntityDef?.properties || {}))
const viewProps = new Set(Object.keys(schema.$defs?.ViewDef?.properties || {}))
const apiProps = new Set(Object.keys(schema.$defs?.ApiDef?.properties || {}))

// ============ 检查 1：SYNTAX_INDEX 关键字 ↔ schema ============
console.log('')
console.log('检查 1：SYNTAX_INDEX 关键字 ↔ schema')
for (const [key, kw] of Object.entries(SYNTAX_INDEX)) {
  const k = kw.keyword
  // type:xxx 是 FieldDef.type 的枚举值，不是独立字段，单独检查 type 字段存在
  if (key.startsWith('type:')) {
    check('type:' + k + ' → FieldDef.type 存在', fieldProps.has('type'))
    continue
  }
  const found =
    topProps.has(k) ||
    fieldProps.has(k) ||
    enumProps.has(k) ||
    entityProps.has(k) ||
    viewProps.has(k) ||
    apiProps.has(k)
  check('keyword "' + k + '" 在 schema 中', found, 'schema 里找不到字段 ' + k)
}

// ============ 检查 2：docs 文件第一行是 # 标题 ============
console.log('')
console.log('检查 2：docs 文件第一行是 # 标题')
const groups = scanDocs()
for (const g of groups) {
  for (const t of g.topics) {
    let first = ''
    try {
      first = (readFileSync(t.file, 'utf-8').split('\n')[0] || '')
    } catch {
      check(t.id + ' 可读', false, '读文件失败: ' + t.file)
      continue
    }
    check(t.id + ' 第一行是 # ', first.startsWith('# '), '实际: ' + JSON.stringify(first.slice(0, 60)))
  }
}

// ============ 检查 3：docTopic 引用存在 ============
console.log('')
console.log('检查 3：SYNTAX_INDEX.docTopic 引用存在')
const allTopics = new Set(allTopicIds())
for (const [key, kw] of Object.entries(SYNTAX_INDEX)) {
  if (!kw.docTopic) continue
  check(key + '.docTopic "' + kw.docTopic + '" 存在', allTopics.has(kw.docTopic), '找不到 topic: ' + kw.docTopic)
}

// ============ 检查 4：error-hints 静态 keyword 存在 ============
console.log('')
console.log('检查 4：error-hints 静态 keyword 在 SYNTAX_INDEX 中')
// 说明：部分 hint 依赖 ctx（如 C31 用 e.mod），传 {} 拿到 null 时跳过。
// 只检查不依赖 ctx 的静态 keyword。
for (const [code, fn] of Object.entries(ERROR_HINTS)) {
  let r
  try {
    r = fn({})
  } catch {
    continue
  }
  if (!r || !r.keyword) continue
  check(code + ' → keyword "' + r.keyword + '" 存在', !!SYNTAX_INDEX[r.keyword], '找不到: ' + r.keyword)
}

// ============ 汇总 ============
console.log('')
console.log('[docs-sync] ' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail > 0 ? 1 : 0)
