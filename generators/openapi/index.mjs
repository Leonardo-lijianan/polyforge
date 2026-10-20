/**
 * OpenAPI 3.0 生成器
 * IR → openapi.json
 *
 * 输出：outFile（完整文件路径，如 docs/api/openapi.json）；
 *       若传入目录，则自动写 <dir>/openapi.json
 *
 * 映射规则：
 *   - enum  → components.schemas 里的 string enum
 *   - view  → components.schemas 里的 object（required 按视图定义）
 *   - api   → paths[<path>][<method>]
 *   - 所有 response 包装为 ApiResponse<T>（后端 Controller 的约定）
 *   - auth: 'public' → 无 security；authenticated/roles → bearerAuth
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }

/** 基础类型 → OpenAPI schema */
function primSchema(type) {
  switch (type) {
    case 'string':
    case 'text':
      return { type: 'string' }
    case 'int':
      return { type: 'integer', format: 'int32' }
    case 'long':
      return { type: 'integer', format: 'int64' }
    case 'number':
    case 'decimal':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'date':
      return { type: 'string', format: 'date' }
    case 'datetime':
      return { type: 'string', format: 'date-time' }
    case 'id':
      // DTO 里的 id 是 String（大整数精度问题），OpenAPI 层面也用 string
      return { type: 'string' }
    case 'json':
      return { type: 'object' }
    default:
      return null
  }
}

/** 字段定义 → OpenAPI schema */
function fieldSchema(fd) {
  if (!fd) return { type: 'string' }

  // 数组
  if (fd.of) {
    const itemsSchema = resolveRef(fd.of, fd.resolvedOf)
    return { type: 'array', items: itemsSchema }
  }

  // 命名类型（枚举 / 视图）
  if (fd.resolved && (fd.resolved.kind === 'enum' || fd.resolved.kind === 'view')) {
    return { $ref: '#/components/schemas/' + fd.resolved.target }
  }

  // 基础类型
  const prim = primSchema(fd.type)
  if (prim) return prim

  // 落不到这里（C1/C3 会先报错）
  return { type: 'string' }
}

/** 引用类型（of 里的元素类型） */
function resolveRef(name, resolved) {
  if (resolved && (resolved.kind === 'enum' || resolved.kind === 'view')) {
    return { $ref: '#/components/schemas/' + name }
  }
  const prim = primSchema(name)
  if (prim) return prim
  return { type: 'string' }
}

/** 枚举 → schema */
function enumSchema(def) {
  return {
    type: 'string',
    enum: def.values || [],
  }
}

/** 视图 → schema */
function viewSchema(def) {
  const props = {}
  const required = []
  const reqSet = new Set(def.required || [])
  const kind = def.viewKind || def.kind

  for (const [fn, fd] of Object.entries(def.fields || {})) {
    props[fn] = fieldSchema(fd)
    // form 视图：required 列表里的字段必填
    // 非 form 视图：非 nullable 即必填
    const isRequired = kind === 'form' ? reqSet.has(fn) : !fd.nullable
    if (isRequired) required.push(fn)
  }

  const schema = { type: 'object', properties: props }
  if (required.length) schema.required = required
  return schema
}

/** ApiResponse<T> 包装 */
function wrapResponse(outputView) {
  const wrapperName = 'ApiResponse' + '_' + (outputView || 'Void')
  if (!outputView) {
    return {
      $ref: '#/components/schemas/ApiResponseVoid',
      _wrapper: {
        [wrapperName]: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            data: { type: 'object', nullable: true },
            links: { type: 'object', additionalProperties: { type: 'string' } },
          },
        },
      },
    }
  }
  return {
    $ref: '#/components/schemas/' + wrapperName,
    _wrapper: {
      [wrapperName]: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          data: { $ref: '#/components/schemas/' + outputView },
          links: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
    },
  }
}

/** /projects/:id → /projects/{id} */
function openApiPath(path) {
  return path.replace(/:([a-zA-Z][a-zA-Z0-9]*)/g, '{$1}')
}

/** 路径参数名列表 */
function pathParamNames(path) {
  const names = []
  const re = /:([a-zA-Z][a-zA-Z0-9]*)/g
  let m
  while ((m = re.exec(path)) !== null) names.push(m[1])
  return names
}

/** 为单个 api 生成 operation 对象 */
function buildOperation(api, extraWrappers) {
  const op = {
    summary: api.summary || api.name,
    operationId: api.name,
    tags: [api.domain || 'default'],
    parameters: [],
  }

  // 路径参数
  const pp = api.pathParams || {}
  for (const n of pathParamNames(api.path)) {
    const def = pp[n] || { type: 'string' }
    op.parameters.push({
      name: n,
      in: 'path',
      required: true,
      schema: fieldSchema(def),
    })
  }

  // query 参数
  if (api.query) {
    for (const [fn, fd] of Object.entries(api.query)) {
      op.parameters.push({
        name: fn,
        in: 'query',
        required: !fd.nullable,
        schema: fieldSchema(fd),
      })
    }
  }

  // requestBody
  if (api.input) {
    op.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/' + api.input },
        },
      },
    }
  }

  // responses
  const wrap = wrapResponse(api.output)
  Object.assign(extraWrappers, wrap._wrapper)
  op.responses = {
    '200': {
      description: api.summary || '成功',
      content: {
        'application/json': {
          schema: { $ref: wrap.$ref },
        },
      },
    },
  }

  // 错误码（只描述不展开）
  if (api.errors && api.errors.length) {
    op.responses['400'] = { description: '参数校验失败' }
    op.responses['401'] = { description: '未认证' }
    op.responses['403'] = { description: '权限不足' }
  }

  // 安全
  const auth = api.auth
  if (auth && auth !== 'public') {
    op.security = [{ bearerAuth: [] }]
  }

  return op
}

/**
 * 主入口：generateOpenApi(ir, outFile)
 * outFile 为完整文件路径（推荐，如 docs/api/openapi.json）；若为目录则写 <dir>/openapi.json
 */
export function generateOpenApi(ir, outFile) {
  const isFile = /\.json$/i.test(outFile)
  const outPath = isFile ? outFile : join(outFile, 'openapi.json')
  const outDir = isFile ? dirname(outFile) : outFile
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const schemas = {}
  const extraWrappers = {}
  const paths = {}

  // 枚举
  for (const [name, def] of ir.enums) {
    schemas[name] = enumSchema(def)
  }

  // 视图
  for (const [name, def] of ir.views) {
    schemas[name] = viewSchema(def)
  }

  // 接口
  for (const api of ir.apis) {
    const p = openApiPath(api.path)
    if (!paths[p]) paths[p] = {}
    const method = (api.method || 'GET').toLowerCase()
    paths[p][method] = buildOperation(api, extraWrappers)
  }

  // 合并 wrapper schemas
  Object.assign(schemas, extraWrappers)

  const doc = {
    openapi: '3.0.3',
    info: {
      title: 'We Engine API',
      version: '1.0.0',
      description: 'Auto-generated from polyforge model IR',
    },
    servers: [{ url: '/api' }],
    paths,
    components: {
      schemas,
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  }

  writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf-8')
  console.log('  [openapi] 1 个文件 → ' + outPath + '（' + Object.keys(paths).length + ' 路径 / ' + Object.keys(schemas).length + ' schema）')
}
