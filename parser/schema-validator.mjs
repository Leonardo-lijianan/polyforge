/**
 * Schema 校验（阶段 A）
 * 按顶层 kind 分发 schema：
 *   kind: domain       → contract.schema.json
 *   kind: global       → contract.schema.json
 *   kind: permissions  → permissions.schema.json
 *
 * schema 文件放在 tools/contract-compiler/schemas/（属工具，不属数据）
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import Ajv2020 from 'ajv/dist/2020.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SCHEMA_ROOT = resolve(__dirname, '../schemas')

const validatorCache = new Map()

function getValidator(schemaFile) {
  if (validatorCache.has(schemaFile)) return validatorCache.get(schemaFile)
  const schemaPath = join(SCHEMA_ROOT, schemaFile)
  if (!existsSync(schemaPath)) {
    throw new Error('找不到 schema: ' + schemaPath)
  }
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'))
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const fn = ajv.compile(schema)
  validatorCache.set(schemaFile, fn)
  return fn
}

/** kind → schema 文件 */
function schemaForKind(kind) {
  if (kind === 'permissions') return 'permissions.schema.json'
  return 'contract.schema.json'
}

/** 把 ajv 的单条 error 翻译成结构化错误对象 */
function formatError(e) {
  const path = e.instancePath || '(顶层)'
  const p = e.params || {}
  let summary
  let detail = null
  let extra = {}
  switch (e.keyword) {
    case 'required':
      summary = path + ' 缺少必填字段: ' + p.missingProperty
      extra = { property: p.missingProperty }
      break
    case 'additionalProperties':
      summary = path + ' 多出了不允许的字段: ' + p.additionalProperty
      extra = { property: p.additionalProperty }
      break
    case 'enum':
      summary = path + ' 取值非法（应是 ' + (e.schema || []).join(' / ') + '）'
      extra = { allowedValues: e.schema || [] }
      break
    case 'type':
      summary = path + ' 类型错误（应为 ' + e.schema + '）'
      extra = { expectedType: e.schema }
      break
    case 'minItems':
      summary = path + ' 至少需要 ' + e.schema + ' 项'
      break
    case 'minProperties':
      summary = path + ' 至少需要 ' + e.schema + ' 个字段'
      break
    case 'minLength':
      summary = path + ' 长度不能少于 ' + e.schema
      break
    case 'pattern':
      summary = path + ' 格式不符合 ' + e.schema
      extra = { pattern: e.schema }
      break
    case 'uniqueItems':
      summary = path + ' 有重复项'
      break
    case 'oneOf':
      summary = path + ' 不符合任一允许的形态'
      break
    case 'const':
      summary = path + ' 值必须是 "' + e.schema + '"'
      break
    case 'if':
      summary = path + ' 条件校验失败'
      break
    default:
      summary = path + ' ' + e.message
  }
  return {
    kind: 'schema',
    keyword: e.keyword,
    path,
    summary,
    detail,
    ...extra,
  }
}

/**
 * 校验单个文件的文档结构
 * @returns {string[]} 错误消息列表（空 = 通过）
 */
export function validateSchema(rel, doc) {
  const kind = doc && doc.kind
  if (!kind) {
    return [{
      kind: 'schema',
      keyword: 'required',
      path: '(顶层)',
      summary: '[' + rel + '] 缺少顶层 kind 字段（应为 domain / global / permissions）',
      detail: null,
      property: 'kind',
    }]
  }
  const schemaFile = schemaForKind(kind)
  const validate = getValidator(schemaFile)
  const ok = validate(doc)
  if (ok) return []
  return (validate.errors || []).map((e) => {
    const err = formatError(e)
    return { ...err, summary: '[' + rel + '] ' + err.summary }
  })
}
