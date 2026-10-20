#!/usr/bin/env node
/**
 * 生成器 golden-file 烟测（JPA → MyBatis-Plus 迁移回归锁）
 * 用法：node polyforge/tests/gen-smoke.mjs
 */
import { spawnSync } from 'child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const TMP_DIR = join(__dirname, '.tmp')
const CLI = join(ROOT, 'index.mjs')
const BASE_PACKAGE = 'com.example.smoke'

let pass = 0
let fail = 0
function check(cond, msg) {
  if (cond) { pass++ } else { fail++; console.error('  FAIL: ' + msg) }
}

const MODEL = [
  'kind: domain',
  'domain: dish',
  'enums:',
  '  DishStatus:',
  '    values: [on_sale, off_sale]',
  'entities:',
  '  Dish:',
  '    table: dish',
  '    fields:',
  '      id:         { type: id }',
  '      name:       { type: string, length: 64, unique: true }',
  '      price:      { type: decimal }',
  '      status:     { type: DishStatus }',
  '      createTime: { type: datetime, auto: create }',
  '      updateTime: { type: datetime, auto: update }',
  'views:',
  '  DishForm:',
  '    kind: form',
  '    required: [name, price]',
  '    fields:',
  '      name:  { type: string }',
  '      price: { type: decimal }',
  '  DishDetail:',
  '    kind: detail',
  '    fields:',
  '      id:    { type: id, from: Dish.id }',
  '      name:  { type: string, from: Dish.name }',
  '      price: { type: decimal, from: Dish.price }',
  'api:',
  '  createDish:',
  '    method: POST',
  '    path: /dishes',
  '    summary: 新增菜品',
  '    input: DishForm',
  '    output: DishDetail',
  '  getDish:',
  '    method: GET',
  '    path: /dishes/:id',
  '    summary: 查询菜品',
  '    output: DishDetail',
  '    pathParams:',
  '      id: { type: id }',
  '',
].join('\n')

const CONFIG = [
  "schemaVersion: '1.0'",
  'outputs:',
  '  backend:',
  '    basePackage: ' + BASE_PACKAGE,
  '    generatedDir: generated',
  '    handServiceDir: hand',
  '',
].join('\n')

mkdirSync(TMP_DIR, { recursive: true })
const tmp = mkdtempSync(join(TMP_DIR, 'smoke-'))

try {
  const modelDir = join(tmp, 'model')
  mkdirSync(modelDir, { recursive: true })
  writeFileSync(join(modelDir, 'dish.yaml'), MODEL, 'utf-8')
  writeFileSync(join(tmp, 'polyforge.config.yaml'), CONFIG, 'utf-8')

  const res = spawnSync('node', [CLI, 'gen', '--target=backend'], {
    cwd: tmp,
    env: { ...process.env, POLYFORGE_SOURCE: modelDir },
    encoding: 'utf-8',
  })
  const output = (res.stdout || '') + (res.stderr || '')
  if (res.status !== 0) {
    console.error(output)
    console.error('  FAIL: gen 退出码 ' + res.status)
    process.exit(1)
  }

  const genDir = join(tmp, 'generated')
  const entityFile = join(genDir, 'entity', 'Dish.java')
  const mapperFile = join(genDir, 'mapper', 'DishMapper.java')
  const ctrlFile = join(genDir, 'controller', 'DishController.java')
  const handlerFile = join(tmp, 'hand', 'config', 'GeneratedMetaObjectHandler.java')

  check(existsSync(entityFile), 'entity/Dish.java 应存在')
  check(existsSync(mapperFile), 'mapper/DishMapper.java 应存在')
  check(existsSync(ctrlFile), 'controller/DishController.java 应存在')
  check(existsSync(handlerFile), 'GeneratedMetaObjectHandler.java 应存在')

  if (existsSync(entityFile)) {
    const s = readFileSync(entityFile, 'utf-8')
    check(s.includes('package ' + BASE_PACKAGE + '.generated.entity;'), 'entity package 用 basePackage')
    check(s.includes('@TableName("dish")'), 'entity 含 @TableName')
    check(s.includes('@TableId(type = IdType.AUTO)'), 'entity 含 @TableId')
    check(!s.includes('@Entity'), 'entity 不含 JPA @Entity')
    check(!s.includes('javax.persistence'), 'entity 不含 javax.persistence')
  }

  if (existsSync(mapperFile)) {
    const s = readFileSync(mapperFile, 'utf-8')
    check(s.includes('package ' + BASE_PACKAGE + '.generated.mapper;'), 'mapper package 用 basePackage')
    check(s.includes('extends BaseMapper<Dish>'), 'mapper 继承 BaseMapper')
    check(!s.includes('JpaRepository'), 'mapper 不含 JpaRepository')
  }

  if (existsSync(handlerFile)) {
    const s = readFileSync(handlerFile, 'utf-8')
    check(s.includes('package ' + BASE_PACKAGE + '.config;'), 'handler package 用 basePackage')
    check(s.includes('implements MetaObjectHandler'), 'handler 实现 MetaObjectHandler')
  }

  if (existsSync(ctrlFile)) {
    const s = readFileSync(ctrlFile, 'utf-8')
    check(s.includes('package ' + BASE_PACKAGE + '.generated.controller;'), 'controller package 用 basePackage')
    check(s.includes('import ' + BASE_PACKAGE + '.dtos.ApiResponse;'), 'controller import 派生 ApiResponse')
  }

  const allFiles = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else allFiles.push(p)
    }
  }
  if (existsSync(genDir)) walk(genDir)
  let polluted = 0
  for (const f of allFiles) {
    if (readFileSync(f, 'utf-8').includes('com.we.engine.server')) polluted++
  }
  check(polluted === 0, 'generated 树不残留 com.we.engine.server（实际 ' + polluted + ' 个文件）')

  // ---------- 负向 case：schemaVersion 校验 ----------
  // 缺 schemaVersion → 必须报错退出
  {
    const c = mkdtempSync(join(TMP_DIR, 'smoke-noschema-'))
    try {
      mkdirSync(join(c, 'model'), { recursive: true })
      writeFileSync(join(c, 'model', 'dish.yaml'), MODEL, 'utf-8')
      writeFileSync(join(c, 'polyforge.config.yaml'), CONFIG.replace(/^schemaVersion:.*\n/m, ''), 'utf-8')
      const r = spawnSync('node', [CLI, 'gen', '--target=backend'], {
        cwd: c, env: { ...process.env, POLYFORGE_SOURCE: join(c, 'model') }, encoding: 'utf-8',
      })
      const o = (r.stdout || '') + (r.stderr || '')
      check(r.status !== 0, '缺 schemaVersion 应退出非 0')
      check(o.includes('缺少 schemaVersion'), '缺 schemaVersion 应提示缺失')
    } finally { rmSync(c, { recursive: true, force: true }) }
  }

  // major 不匹配 → 必须报错退出
  {
    const c = mkdtempSync(join(TMP_DIR, 'smoke-badmajor-'))
    try {
      mkdirSync(join(c, 'model'), { recursive: true })
      writeFileSync(join(c, 'model', 'dish.yaml'), MODEL, 'utf-8')
      writeFileSync(join(c, 'polyforge.config.yaml'), CONFIG.replace("schemaVersion: '1.0'", "schemaVersion: '2.0'"), 'utf-8')
      const r = spawnSync('node', [CLI, 'gen', '--target=backend'], {
        cwd: c, env: { ...process.env, POLYFORGE_SOURCE: join(c, 'model') }, encoding: 'utf-8',
      })
      const o = (r.stdout || '') + (r.stderr || '')
      check(r.status !== 0, 'schemaVersion major 不匹配应退出非 0')
      check(o.includes('不受当前 polyforge 支持'), 'major 不匹配应提示不支持')
    } finally { rmSync(c, { recursive: true, force: true }) }
  }

  // 裸数字 1.0（YAML 解析成 1）应被兜底接受
  {
    const c = mkdtempSync(join(TMP_DIR, 'smoke-numver-'))
    try {
      mkdirSync(join(c, 'model'), { recursive: true })
      writeFileSync(join(c, 'model', 'dish.yaml'), MODEL, 'utf-8')
      writeFileSync(join(c, 'polyforge.config.yaml'), CONFIG.replace("schemaVersion: '1.0'", 'schemaVersion: 1.0'), 'utf-8')
      const r = spawnSync('node', [CLI, 'gen', '--target=backend'], {
        cwd: c, env: { ...process.env, POLYFORGE_SOURCE: join(c, 'model') }, encoding: 'utf-8',
      })
      check(r.status === 0, '裸数字 1.0 应被兜底接受（实际退出码 ' + r.status + '）')
    } finally { rmSync(c, { recursive: true, force: true }) }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log('')
console.log('[gen-smoke] ' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail > 0 ? 1 : 0)
