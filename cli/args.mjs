/**
 * 参数解析：把 process.argv 解析成结构化对象。
 *
 * 职责单一：不碰配置、不碰文件、不联网。纯字符串处理。
 * 调用方（index.mjs）根据返回值决定：直接打印帮助 / 返回版本 / 跑 docs / 跑主流程。
 */

/** 有独立子命令的命令 */
export const COMMANDS = ['check', 'gen', 'ir', 'docs', 'syntax', 'help', 'version']

/** 生成目标白名单 */
export const VALID_TARGETS = ['all', 'frontend', 'backend', 'db', 'openapi']

/**
 * 解析 argv。
 *
 * 支持的形态：
 *   polyforge                          → cmd = 'check'
 *   polyforge gen                      → cmd = 'gen'
 *   polyforge gen --target=backend     → cmd = 'gen', target = 'backend'
 *   polyforge --help                   → help = true
 *   polyforge -h                       → help = true
 *   polyforge --version                → version = true
 *   polyforge -v                       → version = true
 *   polyforge help gen                 → cmd = 'help', helpTarget = 'gen'
 *   polyforge gen --help               → cmd = 'gen', help = true, helpTarget = 'gen'
 *   polyforge docs sensitive           → cmd = 'docs', positionals = ['sensitive']
 *   polyforge syntax sensitive --json  → cmd = 'syntax', positionals = ['sensitive'], json = true
 *   polyforge abc                      → cmd = 'abc'（未知，由调用方报错）
 *
 * @param {string[]} argv  process.argv（含 node 和脚本路径，本函数内部 slice(2)）
 * @returns {{ cmd: string, positionals: string[], target: string, verbose: boolean,
 *             help: boolean, version: boolean, helpTarget: string | null,
 *             json: boolean, allowBreaking: boolean, error: string | null }}
 */
export function parseArgs(argv) {
  const args = argv.slice(2)

  const result = {
    cmd: null,
    positionals: [],
    target: 'all',
    verbose: false,
    help: false,
    version: false,
    helpTarget: null,
    json: false,
    allowBreaking: false,
    error: null,
  }

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg === '--version' || arg === '-v') {
      result.version = true
    } else if (arg === '--verbose') {
      result.verbose = true
    } else if (arg === '--json') {
      result.json = true
    } else if (arg === '--allow-breaking') {
      result.allowBreaking = true
    } else if (arg.startsWith('--target=')) {
      const t = arg.slice('--target='.length)
      if (!VALID_TARGETS.includes(t)) {
        result.error = '--target 只接受: ' + VALID_TARGETS.join(' | ') + '（收到: ' + t + '）'
        return result
      }
      result.target = t
    } else if (arg.startsWith('-')) {
      result.error = '未知选项: ' + arg
      return result
    } else if (result.cmd === null) {
      result.cmd = arg
    } else {
      result.positionals.push(arg)
    }
  }

  // 特殊处理：polyforge help <cmd> → 等价于 polyforge <cmd> --help
  if (result.cmd === 'help') {
    result.helpTarget = result.positionals[0] || null
    result.help = true
    result.cmd = result.helpTarget || 'help'
  }

  // polyforge gen --help → 记下 helpTarget
  if (result.help && result.cmd && result.cmd !== 'help' && !result.helpTarget) {
    result.helpTarget = result.cmd
  }

  // 无命令 → 默认 check
  if (result.cmd === null) result.cmd = 'check'

  return result
}

/** 是否为已知命令 */
export function isKnownCommand(cmd) {
  return COMMANDS.includes(cmd)
}
