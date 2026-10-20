#!/usr/bin/env node
/**
 * PolyForge 测试运行器
 *
 * 设计要点（防伪）：
 *   本脚本不自己实现任何校验，而是 spawn polyforge 原生 CLI（check），
 *   把它的 stdout/stderr 原样透传。因此输出的每一条 C4/校验错误，
 *   都是 polyforge 真实打印的，测试脚本无法伪造。
 *
 * 机制：每个 case 放入独立临时目录，通过 POLYFORGE_SOURCE 指向它，
 *       spawn 一次 `node polyforge/index.mjs check`。
 *
 * 用法：node polyforge/tests/run.mjs
 */
import { spawnSync } from 'child_process'
import { readdirSync, mkdtempSync, copyFileSync, rmSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CASES_DIR = join(__dirname, 'cases')
const TMP_DIR = join(__dirname, '.tmp')
const CLI = join(ROOT, 'index.mjs')

mkdirSync(TMP_DIR, { recursive: true })

/** 期望输出里「必须包含」的子串 */
const EXPECT = {
  'cycle-view.yaml': ['C4'],
  'cycle-entity.yaml': ['C4'],
  'ref-cycle-ok.yaml': [],
  'ref-resolve.yaml': [],
  'ref-weak-edge.yaml': [],
  'ref-bad-target.yaml': ['引用不存在'],
  'alter-basic.yaml': [],
}

/** 期望输出里「不应出现」的子串 */
const NOT_EXPECT = {
  'ref-cycle-ok.yaml': ['C4'],
  'ref-weak-edge.yaml': ['C4'],
}

let pass = 0
let fail = 0

for (const file of readdirSync(CASES_DIR).sort()) {
  if (!file.endsWith('.yaml')) continue

  // 每个 case 独立临时目录，避免互相污染
  const tmp = mkdtempSync(join(TMP_DIR, 'case-'))
  copyFileSync(join(CASES_DIR, file), join(tmp, file))

  const res = spawnSync('node', [CLI, 'check'], {
    env: { ...process.env, POLYFORGE_SOURCE: tmp },
    encoding: 'utf-8',
  })
  const output = (res.stdout || '') + (res.stderr || '')

  console.log('')
  console.log('########## ' + file + ' ##########')
  // ↓ 原样透传 polyforge 的原生输出（含 [polyforge] 前缀日志与 C4 错误）
  console.log(output.trimEnd())

  const want = EXPECT[file] || []
  const notWant = NOT_EXPECT[file] || []
  const missing = want.filter((s) => !output.includes(s))
  const unexpected = notWant.filter((s) => output.includes(s))

  // 退出码校验：EXPECT 为空 = 期望模型合法，check 应通过（status 0）；
  // 非空 = 期望报错，check 应失败（status 非 0）。
  // 缺了这条，一个「校验失败但输出里没有期望子串」的 case 会被误判 PASS。
  const expectOk = want.length === 0
  const statusOk = expectOk ? res.status === 0 : res.status !== 0
  const ok = statusOk && missing.length === 0 && unexpected.length === 0

  if (ok) {
    pass++
    console.log('  => PASS')
  } else {
    fail++
    console.log('  => FAIL')
    if (!statusOk) console.log('     退出码不符: 期望 ' + (expectOk ? '0' : '非 0') + '，实际 ' + res.status)
    if (missing.length) console.log('     缺少期望: ' + missing.join(', '))
    if (unexpected.length) console.log('     不应出现: ' + unexpected.join(', '))
  }

  rmSync(tmp, { recursive: true, force: true })
}

console.log('')
console.log('[tests] ' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail > 0 ? 1 : 0)
