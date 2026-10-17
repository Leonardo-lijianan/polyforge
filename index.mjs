#!/usr/bin/env node
/**
 * PolyForge — 模型编译器
 *
 * 用法：
 *   polyforge check                     # 只校验
 *   polyforge ir                        # 打印 IR（调试）
 *   polyforge gen                       # 校验 + 生成（全部目标）
 *   polyforge gen --target=frontend     # 只生成前端
 *   polyforge gen --target=backend|db   # 只生成后端 / 只生成迁移
 *   polyforge verify [--target=...]     # 校验生成物 MD5
 *
 * 配置：项目根目录 polyforge.config.yaml（优先）或 polyforge.config.mjs（兼容）
 */
import { loadConfig } from './config.mjs'
import { resolveSourceDir } from './source.mjs'
import { createHash } from 'crypto'
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { loadAll } from './parser/load.mjs'
import { validateSchema } from './parser/schema-validator.mjs'
import { buildIR } from './parser/build-ir.mjs'
import { validate } from './validate/index.mjs'
import { generateFrontendTypes } from './generators/frontend/types.mjs'
import { generateFrontendRequestMap } from './generators/frontend/requestMap.mjs'
import { generateFrontendValidators } from './generators/frontend/validators.mjs'
import { generateJavaEntity } from './generators/java/entity.mjs'
import { generateJavaDto } from './generators/java/dto.mjs'
import { generateJavaFlyway } from './generators/java/flyway.mjs'
import { generateJavaMapper } from './generators/java/mapper.mjs'
import { generateJavaRepository } from './generators/java/repository.mjs'
import { generateJavaService } from './generators/java/service.mjs'
import { generateJavaController } from './generators/java/controller.mjs'

function printDiagnostics(result) {
  for (const w of result.warnings) console.warn('  [warn]  ' + w)
  for (const e of result.errors) console.error('  [error] ' + e)
}

function serializeIR(ir) {
  return {
    enums: Object.fromEntries([...ir.enums].map(([k, v]) => [k, { values: v.values, labels: v.labels, state: v.state }])),
    entities: Object.fromEntries([...ir.entities].map(([k, v]) => [k, { table: v.table, fields: Object.fromEntries(Object.entries(v.fields).map(([fn, fd]) => [fn, { type: fd.type, resolved: fd.resolved }])) }])),
    views: Object.fromEntries([...ir.views].map(([k, v]) => [k, { kind: v.kind, required: v.required, fields: Object.fromEntries(Object.entries(v.fields).map(([fn, fd]) => [fn, { type: fd.type, resolved: fd.resolved }])) }])),
    apis: ir.apis.map((a) => ({ name: a.name, method: a.method, path: a.path, input: a.input, output: a.output })),
    edges: ir.graph.edges,
  }
}

function getFileHash(filePath) {
  const content = readFileSync(filePath)
  return createHash('md5').update(content).digest('hex')
}

function walkDir(dir) {
  let results = []
  if (!existsSync(dir)) return results
  const list = readdirSync(dir)
  for (const file of list) {
    const fullPath = join(dir, file)
    const stat = statSync(fullPath)
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(fullPath))
    } else {
      results.push(fullPath)
    }
  }
  return results
}

async function main() {
  const cmd = process.argv[2] || 'check'
  // --target=frontend|backend|db|all（默认 all，向后兼容）
  const targetArg = process.argv.find((a) => a.startsWith('--target='))
  const target = targetArg ? targetArg.split('=')[1] : 'all'
  const VALID_TARGETS = ['all', 'frontend', 'backend', 'db']
  if (!VALID_TARGETS.includes(target)) {
    console.error('[polyforge] --target 只接受: ' + VALID_TARGETS.join(' | '))
    process.exit(1)
  }
  const config = await loadConfig()

  console.log('')
  console.log('[polyforge] 加载模型...')
  const sourceDir = await resolveSourceDir(config)
  console.log('[polyforge] 源目录: ' + sourceDir)
  const loaded = loadAll(sourceDir)
  if (loaded.length === 0) {
    console.error('[polyforge] 源目录下没有找到任何 .yaml 文件')
    process.exit(1)
  }
  console.log('[polyforge] 读取 ' + loaded.length + ' 个文件:')
  for (const f of loaded) console.log('  - ' + f.rel)

  console.log('')
  console.log('[polyforge] 结构校验（schema）...')
  const schemaErrors = []
  for (const f of loaded) {
    schemaErrors.push(...validateSchema(f.rel, f.doc))
  }
  if (schemaErrors.length > 0) {
    schemaErrors.forEach((e) => console.error('  [error] ' + e))
    console.error('')
    console.error('[polyforge] 结构校验失败：' + schemaErrors.length + ' 个错误')
    process.exit(1)
  }
  console.log('[polyforge] 结构校验通过')

  console.log('')
  console.log('[polyforge] 构建 IR...')
  const ir = buildIR(loaded)
  console.log('[polyforge] 枚举 ' + ir.enums.size + ' / 实体 ' + ir.entities.size +
              ' / 视图 ' + ir.views.size + ' / 规则 ' + ir.rules.size +
              ' / 接口 ' + ir.apis.length)

  console.log('')
  console.log('[polyforge] 检查...')
  const result = validate(ir)
  printDiagnostics(result)

  if (result.errors.length > 0) {
    console.error('')
    console.error('[polyforge] 检查失败：' + result.errors.length + ' 个错误，' + result.warnings.length + ' 个警告')
    process.exit(1)
  }
  console.log('[polyforge] 检查通过' + (result.warnings.length ? '（' + result.warnings.length + ' 个警告）' : ''))

  if (cmd === 'ir') {
    console.log('')
    console.log('[polyforge] IR 快照:')
    console.log(JSON.stringify(serializeIR(ir), null, 2))
    return
  }

  if (cmd === 'gen') {
    const out = config.outputs
    const wantFrontend = target === 'all' || target === 'frontend'
    const wantBackend = target === 'all' || target === 'backend'
    const wantDb = target === 'all' || target === 'db'

    const fe = out.frontend
    const be = out.backend
    const db = out.db
    if (wantFrontend && fe && (fe.types || fe.requestMap || fe.validators)) {
      console.log('')
      console.log('[polyforge] 生成前端...')
      if (fe.types) generateFrontendTypes(ir, fe.types)
      if (fe.requestMap) generateFrontendRequestMap(ir, fe.requestMap)
      if (fe.validators) generateFrontendValidators(ir, fe.validators)
    }

    if (wantBackend && be) {
      console.log('')
      console.log('[polyforge] 生成后端...')
      generateJavaEntity(ir, be.generatedDir)
      generateJavaDto(ir, be.generatedDir)
      generateJavaRepository(ir, be.generatedDir)
      generateJavaMapper(ir, be.generatedDir)
      generateJavaService(ir, be.generatedDir, be.handServiceDir)
      generateJavaController(ir, be.generatedDir)
    }
    if (wantDb && db?.flyway) {
      console.log('')
      console.log('[polyforge] 生成数据库迁移...')
      generateJavaFlyway(ir, db.flyway)
    }

    // 生成 MD5 清单。
    // 每个 target 是独立的完整生成器，各自记自己的 manifest 段：
    //   .polyforge/manifest.json = { frontend: {...}, backend: {...}, db: {...} }
    // gen --target=frontend 只重写 frontend 段，不碰 backend / db。
    const manifestDir = join(config.projectRoot, '.polyforge')
    mkdirSync(manifestDir, { recursive: true })
    const manifestPath = join(manifestDir, 'manifest.json')
    const manifest = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, 'utf-8'))
      : {}

    const targetsToWrite = target === 'all' ? ['frontend', 'backend', 'db'] : [target]
    for (const t of targetsToWrite) {
      if (t === 'frontend' && wantFrontend && fe) {
        const dirs = [fe.types, fe.requestMap, fe.validators].filter(Boolean)
        const section = {}
        for (const dir of dirs) {
          for (const f of walkDir(dir)) {
            const rel = f.replace(config.projectRoot, '').replace(/\\/g, '/').replace(/^\//, '')
            section[rel] = getFileHash(f)
          }
        }
        manifest.frontend = section
      } else if (t === 'backend' && wantBackend && be) {
        const dirs = [be.generatedDir].filter(Boolean)
        const section = {}
        for (const dir of dirs) {
          for (const f of walkDir(dir)) {
            const rel = f.replace(config.projectRoot, '').replace(/\\/g, '/').replace(/^\//, '')
            section[rel] = getFileHash(f)
          }
        }
        manifest.backend = section
      } else if (t === 'db' && wantDb && db) {
        const dirs = [db.flyway].filter(Boolean)
        const section = {}
        for (const dir of dirs) {
          for (const f of walkDir(dir)) {
            const rel = f.replace(config.projectRoot, '').replace(/\\/g, '/').replace(/^\//, '')
            section[rel] = getFileHash(f)
          }
        }
        manifest.db = section
      }
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
    const counts = Object.entries(manifest).map(([k, v]) => k + '=' + Object.keys(v).length).join(' / ')
    console.log('[polyforge] 生成 MD5 校验清单 -> ' + manifestPath + '（target=' + target + '，' + counts + '）')

    console.log('')
    console.log('[polyforge] 完成')
    return
  }

  if (cmd === 'verify') {
    console.log('')
    console.log('[polyforge] 校验生成物 MD5...')
    const manifestPath = join(config.projectRoot, '.polyforge', 'manifest.json')
    if (!existsSync(manifestPath)) {
      console.error('  [error] 缺少 .polyforge/manifest.json，请先运行 polyforge:gen')
      process.exit(1)
    }
    // manifest 结构：{ frontend: {path: hash}, backend: {...}, db: {...} }
    // 每个 target 独立一段。--target 只校验对应段，all 校验全部段。
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    const sections = target === 'all'
      ? Object.keys(manifest)
      : [target].filter((t) => manifest[t])
    if (sections.length === 0) {
      console.error('  [error] manifest 里没有 target=' + target + ' 的段，先运行 polyforge:gen --target=' + target)
      process.exit(1)
    }
    let errors = 0
    let checked = 0
    for (const section of sections) {
      for (const [relPath, expectedHash] of Object.entries(manifest[section])) {
        checked++
        const absPath = join(config.projectRoot, relPath)
        if (!existsSync(absPath)) {
          console.error('  [error] [' + section + '] 文件缺失: ' + relPath)
          errors++
          continue
        }
        const actualHash = getFileHash(absPath)
        if (actualHash !== expectedHash) {
          console.error('  [error] [' + section + '] 文件被篡改: ' + relPath)
          errors++
        }
      }
    }
    if (errors > 0) {
      console.error('[polyforge] MD5 校验失败: ' + errors + ' 个文件被手动修改或删除')
      process.exit(1)
    }
    console.log('[polyforge] ' + checked + ' 个文件 MD5 校验通过（target=' + target + '，段: ' + sections.join(', ') + '）')
    return
  }
}

main().catch((err) => {
  console.error('[polyforge] 异常:', err)
  process.exit(1)
})
