/**
 * 配置加载器
 * 优先读 polyforge.config.yaml，其次 polyforge.config.mjs，都没有则用默认值。
 * 所有路径相对 projectRoot（默认：含配置文件的目录，即 cwd）。
 */
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
import * as yaml from 'js-yaml'

const DEFAULT_CONFIG = {
  source: null,
  outputs: {
    frontend: null,
    backend: null,
    db: null,
  },
}

const YAML_FILE = 'polyforge.config.yaml'
const MJS_FILE = 'polyforge.config.mjs'

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

  // projectRoot：所有相对路径（含 manifest 的 key）都相对它算。默认 cwd。
  const projectRoot = userConfig.projectRoot ? resolve(cwd, userConfig.projectRoot) : cwd

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
      cacheDir: join(projectRoot, '.polyforge', 'cache'),
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
          }
        : null,
      db: userConfig.outputs?.db
        ? {
            flyway: userConfig.outputs.db.flyway
              ? resolve(cwd, userConfig.outputs.db.flyway)
              : null,
          }
        : null,
    },
  }

  return merged
}
