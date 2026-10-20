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
 *
 * 配置：项目根目录 polyforge.config.yaml（优先）或 polyforge.config.mjs（兼容）
 */
import { loadConfig } from './config.mjs'
import { resolveSourceDir } from './source.mjs'
import { extractSnapshot, diffSnapshots, readSnapshot, writeSnapshot } from './snapshot.mjs'
import { existsSync, rmSync } from 'fs'
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
import { writeDbSchemaState, generateAlterSql } from './generators/java/alter.mjs'
import { generateJavaMapper } from './generators/java/dao-mapper.mjs'
import { generateJavaAssembler } from './generators/java/view-assembler.mjs'
import { generateJavaService } from './generators/java/service.mjs'
import { generateJavaController } from './generators/java/controller.mjs'
import { generateJavaMetaObjectHandler } from './generators/java/handler.mjs'
import { generateOpenApi } from './generators/openapi/index.mjs'

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

async function main() {
  const cmd = process.argv[2] || 'check'
  // --target=frontend|backend|db|all（默认 all，向后兼容）
  const targetArg = process.argv.find((a) => a.startsWith('--target='))
  const target = targetArg ? targetArg.split('=')[1] : 'all'
  // --allow-breaking：显式允许破坏性变更（CI 里谨慎使用）
  const allowBreaking = process.argv.includes('--allow-breaking')
  const VALID_TARGETS = ['all', 'frontend', 'backend', 'db', 'openapi']
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
    // ============ 破坏性变更检测 ============
    // 仅在 gen 时执行：check 不写快照，也不阻断（避免本地临时改动被误报）
    const newSnap = extractSnapshot(ir)
    const oldSnap = readSnapshot(config.projectRoot)
    if (oldSnap) {
      const breaks = diffSnapshots(oldSnap, newSnap)
      if (breaks.length > 0) {
        console.error('')
        console.error('[polyforge] 检测到 ' + breaks.length + ' 处破坏性变更：')
        for (const b of breaks) console.error('  [BREAKING] ' + b.location + ' — ' + b.detail)
        console.error('')
        if (allowBreaking) {
          console.warn('[polyforge] --allow-breaking 已指定，将继续生成并覆盖旧快照。')
        } else {
          console.error('[polyforge] 已阻断生成。')
          console.error('[polyforge] 如果这是有意变更，请加 --allow-breaking 重跑：')
          console.error('  node polyforge/index.mjs gen --allow-breaking')
          process.exit(1)
        }
      }
    }
    // 快照等生成全部成功后再写（见本函数末尾）。
    // 原因：若生成中途崩溃，本次不能把新快照落盘——否则下次重跑拿「新 IR」对比「新快照」
    // 会 diff 为空，那次破坏性变更从此静默失效。等到生成完整通过再写，崩溃后重跑仍会重新 diff 并阻断。

    const out = config.outputs
    const wantFrontend = target === 'all' || target === 'frontend'
    const wantBackend = target === 'all' || target === 'backend'
    const wantDb = target === 'all' || target === 'db'
    const wantOpenapi = target === 'all' || target === 'openapi'

    const fe = out.frontend
    const be = out.backend
    const db = out.db

    // basePackage 校验必须放在清空目录之前：
    // 否则配置缺失时会先 rmSync 掉 generatedDir，再报错退出，留下空目录。
    if (wantBackend && be && !be.basePackage) {
      console.error('  [error] outputs.backend.basePackage 未配置，无法生成 Java 代码')
      process.exit(1)
    }

    // 生成前清空「全自动目录」：这些目录的承诺是「可整体删除重建」。
    // 不清空的后果：契约删掉一个 view/entity 后，旧的 FooBrief.ts / FooDto.java 会永久残留，
    // type-check / mvn compile 都不会报错，但它们已经和契约脱节。
    // db.flyway 不动：增量迁移（V901__alter）会往同一目录追加，清空会误删；留到 B3 一起处理。
    // handServiceDir 不动：手写 ServiceImpl 受保护。
    const cleanDirs = []
    if (wantFrontend && fe) {
      for (const d of [fe.types, fe.requestMap, fe.validators]) if (d) cleanDirs.push(d)
    }
    if (wantBackend && be && be.generatedDir) cleanDirs.push(be.generatedDir)
    for (const d of cleanDirs) {
      if (existsSync(d)) rmSync(d, { recursive: true, force: true })
    }

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
      generateJavaEntity(ir, be.generatedDir, be.basePackage)
      generateJavaDto(ir, be.generatedDir, be.basePackage)
      generateJavaMapper(ir, be.generatedDir, be.basePackage)
      generateJavaAssembler(ir, be.generatedDir, be.basePackage)
      generateJavaService(ir, be.generatedDir, be.handServiceDir, be.basePackage)
      generateJavaController(ir, be.generatedDir, be.basePackage)
      generateJavaMetaObjectHandler(ir, be.handServiceDir, be.basePackage)
    }
    if (wantDb && db?.flyway) {
      console.log('')
      console.log('[polyforge] 生成数据库迁移...')
      // B3 增量迁移：
      //   state 不存在 → 首次，生成 V900 基线 + 写 state
      //   state 存在   → 对比 state 与当前 IR，有变更则生成 V901+__alter_generated.sql，不动 V900
      const statePath = join(config.projectRoot, '.polyforge', 'db-schema-state.json')
      if (!existsSync(statePath)) {
        generateJavaFlyway(ir, db.flyway)
        writeDbSchemaState(ir, statePath)
        console.log('[polyforge] DB schema state 已初始化 -> .polyforge/db-schema-state.json')
      } else {
        const res = generateAlterSql(ir, db.flyway, statePath, { allowBreaking })
        if (res.blocked) {
          console.error('')
          console.error('[polyforge] DB 增量迁移检测到 ' + res.breaking.length + ' 处破坏性变更：')
          for (const c of res.breaking) {
            console.error('  [BREAKING] ' + c.kind + ' on ' + c.table + (c.column ? '.' + c.column : c.index ? ' #' + c.index : ''))
          }
          console.error('')
          console.error('[polyforge] 已阻断生成。如果这是有意变更，加 --allow-breaking 重跑。')
          process.exit(1)
        }
        if (res.outFile) {
          console.log('[polyforge] 增量迁移已生成 -> ' + res.outFile + '（' + res.changes.length + ' 处变更）')
        } else {
          console.log('[polyforge] DB schema 无变化，跳过增量迁移')
        }
      }
    }
    if (wantOpenapi && out.openapi) {
      console.log('')
      console.log('[polyforge] 生成 OpenAPI...')
      generateOpenApi(ir, out.openapi)
    }

    // 生成全部成功，才把新快照落盘（事务式：生成失败 → 快照保持旧值 → 下次重跑仍会 diff）
    writeSnapshot(config.projectRoot, newSnap)
    console.log('[polyforge] 契约快照已更新 -> .polyforge/schema-snapshot.json')

    console.log('')
    console.log('[polyforge] 完成')
    return
  }

}

main().catch((err) => {
  console.error('[polyforge] 异常:', err)
  process.exit(1)
})
