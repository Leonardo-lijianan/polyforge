/**
 * 配置加载器
 * 优先读 polyforge.config.yaml，其次 polyforge.config.mjs，都没有则用默认值。
 * 所有路径相对 projectRoot（默认：含配置文件的目录，即 cwd）。
 */
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { tmpdir, userInfo } from 'os'
import * as yaml from 'js-yaml'

const DEFAULT_CONFIG = {
  source: null,
  outputs: {
    frontend: null,
    backend: null,
    db: null,
    openapi: null,
  },
}

const YAML_FILE = 'polyforge.config.yaml'
const MJS_FILE = 'polyforge.config.mjs'

/**
 * 当前支持的配置 schema 版本（major.minor，只有两段，与包版本的 major.minor.hotfix 不同）。
 * 兼容判定只看 major：polyforge 1.x.y 接受 schemaVersion 1.*。
 * 递增规则见 docs/VERSIONING.md。
 */
const SUPPORTED_SCHEMA_MAJOR = 1
const SUPPORTED_SCHEMA_VERSION = '1.0'

async function readUserConfig(cwd) {
  const yamlPath = join(cwd, YAML_FILE)
  if (existsSync(yamlPath)) {
    const doc = yaml.load(readFileSync(yamlPath, 'utf8')) || {}
    return { config: doc, source: YAML_FILE }
  }
  const mjsPath = join(cwd, MJS_FILE)
  if (existsSync(mjsPath)) {
    const mod = await import(pathToFileURL(mjsPath).href)
    return { config: mod.default || {}, source: MJS_FILE }
  }
  return { config: {}, source: null }
}

/**
 * 加载配置
 * @param {string} [cwd] 用户项目根目录，默认 process.cwd()
 * @returns {Promise<object>} 合并默认值后的配置（路径已 resolve 为绝对路径）
 */
export async function loadConfig(cwd = process.cwd()) {
  const { config: userConfig, source: configFile } = await readUserConfig(cwd)

  // schemaVersion 必填校验。只在「确实有配置文件」时检查——
  // 没有任何配置文件时走后面的「未找到 source」错误路径，不在这里重复报。
  // 规则见 docs/VERSIONING.md。
  if (configFile) {
    if (userConfig.schemaVersion === undefined) {
      throw new Error(
        '配置文件 ' + configFile + ' 缺少 schemaVersion 字段。\n'
        + '请在文件顶层添加：\n'
        + "  schemaVersion: '" + SUPPORTED_SCHEMA_VERSION + "'\n"
        + '说明见 docs/VERSIONING.md。'
      )
    }
    const raw = userConfig.schemaVersion
    // YAML 陷阱：schemaVersion: 1.0 不加引号会被 js-yaml 解析成数字 1（浮点尾部零被丢弃），
    // 于是 String(1) === '1'，格式校验会失败。所以下面既接受数字（宽松），
    // 也接受字符串，最终统一按 major.minor 校验。
    // 但推荐写法始终是带引号的 '1.0'，文档和示例都这么写。
    const verStr = raw === 1 ? '1.0' : String(raw)
    const major = parseInt(verStr.split('.')[0], 10)
    if (!/^\d+\.\d+$/.test(verStr)) {
      throw new Error(
        '配置文件 ' + configFile + ' 的 schemaVersion="' + verStr + '" 格式非法。\n'
        + "应写成带引号的 major.minor，例如：schemaVersion: '" + SUPPORTED_SCHEMA_VERSION + "'\n"
        + '（不加引号的 1.0 会被 YAML 解析成数字 1，务必加引号。）\n'
        + '说明见 docs/VERSIONING.md。'
      )
    }
    if (major !== SUPPORTED_SCHEMA_MAJOR) {
      throw new Error(
        '配置文件 ' + configFile + ' 的 schemaVersion=' + verStr + ' 不受当前 polyforge 支持。\n'
        + '当前支持 major=' + SUPPORTED_SCHEMA_MAJOR + '（如 ' + SUPPORTED_SCHEMA_VERSION + '）。\n'
        + '请升级 polyforge，或按 docs/VERSIONING.md 迁移配置。'
      )
    }
  }

  // projectRoot：所有相对路径（含 manifest 的 key）都相对它算。默认 cwd。
  const projectRoot = userConfig.projectRoot ? resolve(cwd, userConfig.projectRoot) : cwd

  // 缓存根目录：默认放系统临时目录，跨项目共享。
  // 契约仓库与具体项目无关——同一台机器上 client / server / 任何其他消费方共用一份 clone。
  // 缓存目录名按「仓库名 + URL 哈希 + ref」区分，不同仓库、不同 ref 互不干扰。
  // 通过 POLYFORGE_CACHE 可覆盖（例如 CI 里指向持久化目录，避免每次重建都重新 clone）。
  // 注意：branch ref 下多进程并发 fetch 可能打架，共享场景建议串行调用（如 rebuild 脚本）。
  const userTag = (() => {
    try { return userInfo().username.replace(/[^a-zA-Z0-9]/g, '_') }
    catch { return String(process.getuid?.() ?? 'default') }
  })()
  const defaultCacheDir = join(tmpdir(), 'polyforge-cache-' + userTag)

  // 源目录解析。只支持 git 形式（保证各消费方同步同一份契约，不留本地 fallback）。
  // POLYFORGE_SOURCE 环境变量仅供 polyforge 自身测试指向本地临时目录，不对外暴露。
  let source
  const envSource = process.env.POLYFORGE_SOURCE
  if (envSource) {
    source = { type: 'local', dir: resolve(cwd, envSource) }
  } else if (typeof userConfig.source === 'string') {
    throw new Error(
      'source 不支持字符串（本地路径）形式。请改为：\n'
      + 'source:\n'
      + '  git: git@gitee.com:org/we-engine-model.git\n'
      + '  ref: main\n'
      + '本地路径调试请用环境变量 POLYFORGE_SOURCE=<目录>。'
    )
  } else if (userConfig.source && typeof userConfig.source === 'object' && userConfig.source.git) {
    source = {
      type: 'git',
      git: userConfig.source.git,
      ref: userConfig.source.ref || 'main',
      path: userConfig.source.path || '.',
      cacheDir: process.env.POLYFORGE_CACHE
        ? resolve(cwd, process.env.POLYFORGE_CACHE)
        : defaultCacheDir,
    }
  } else {
    throw new Error(
      '未找到 source 配置。请在 polyforge.config.yaml 里声明：\n'
      + 'source:\n'
      + '  git: <契约仓库地址>\n'
      + '  ref: main'
    )
  }

  const merged = {
    projectRoot,
    configFile,
    source,
    outputs: {
      frontend: userConfig.outputs?.frontend
        ? {
            types: userConfig.outputs.frontend.types
              ? resolve(cwd, userConfig.outputs.frontend.types)
              : null,
            requestMap: userConfig.outputs.frontend.requestMap
              ? resolve(cwd, userConfig.outputs.frontend.requestMap)
              : null,
            validators: userConfig.outputs.frontend.validators
              ? resolve(cwd, userConfig.outputs.frontend.validators)
              : null,
          }
        : null,
      backend: userConfig.outputs?.backend
        ? {
            basePackage: userConfig.outputs.backend.basePackage,
            generatedDir: userConfig.outputs.backend.generatedDir
              ? resolve(cwd, userConfig.outputs.backend.generatedDir)
              : null,
            handServiceDir: userConfig.outputs.backend.handServiceDir
              ? resolve(cwd, userConfig.outputs.backend.handServiceDir)
              : null,
            dateTimeType: userConfig.outputs.backend.dateTimeType || 'OffsetDateTime',
          }
        : null,
      db: userConfig.outputs?.db
        ? {
            flyway: userConfig.outputs.db.flyway
              ? resolve(cwd, userConfig.outputs.db.flyway)
              : null,
            dialect: userConfig.outputs.db.dialect || 'postgres',
          }
        : null,
      openapi: (() => {
        const v = userConfig.outputs?.openapi
        if (v == null) return null
        if (typeof v !== 'string') {
          throw new Error(
            'outputs.openapi 必须是字符串路径（不是对象）。正确写法：\n'
            + 'outputs:\n'
            + '  openapi: docs/api/openapi.json'
          )
        }
        return resolve(cwd, v)
      })(),
    },
  }

  return merged
}
