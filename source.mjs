/**
 * 契约源解析：按 config.source 的 git 配置，把仓库 clone/pull 到 .polyforge/cache/。
 *
 * 设计：只用 git，不留本地 fallback——保证所有消费方拉到的都是同一份契约。
 *   ref 是 branch  → 每次 pull --ff-only（跟随分支最新）
 *   ref 是 commit/tag → 缓存命中即用（不可变，无需更新）
 */
import { existsSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function sanitizeRef(ref) {
  return ref.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function repoNameOf(url) {
  return url.replace(/\.git$/, '').split(/[\/:]/).pop()
}

/**
 * 判断 ref 类型：branch / tag / commit。
 * 用 git ls-remote 查 refs/heads 和 refs/tags，都查不到则视为 commit。
 * 网络失败时不抛错，按 commit 处理（后续 clone 会给出真实错误）。
 */
function classifyRef(url, ref) {
  try {
    const out = git(['ls-remote', url, 'refs/heads/' + ref, 'refs/tags/' + ref])
    if (out.split('\n').some((line) => line.endsWith('\trefs/heads/' + ref))) return 'branch'
    if (out.split('\n').some((line) => line.includes('refs/tags/' + ref))) return 'tag'
    return 'commit'
  } catch {
    return 'commit'
  }
}

/**
 * 解析契约源目录：确保 cache 里有正确的 commit，返回实际目录（含 path 子目录）。
 * @param {object} config loadConfig() 的返回值
 * @returns {Promise<string>} 契约目录绝对路径
 */
export async function resolveSourceDir(config) {
  const s = config.source

  if (s.type === 'local') {
    if (!existsSync(s.dir)) {
      throw new Error('POLYFORGE_SOURCE 指向的目录不存在：' + s.dir)
    }
    return s.dir
  }

  const repoRoot = join(s.cacheDir, repoNameOf(s.git) + '-' + sanitizeRef(s.ref))
  const finalDir = s.path && s.path !== '.' ? join(repoRoot, s.path) : repoRoot
  const kind = classifyRef(s.git, s.ref)

  if (!existsSync(repoRoot)) {
    console.log('[polyforge] 克隆契约仓库 ' + s.git + '（ref=' + s.ref + '，类型=' + kind + '）...')
    if (kind === 'branch') {
      git(['clone', '--branch', s.ref, '--single-branch', s.git, repoRoot])
    } else {
      git(['clone', s.git, repoRoot])
      git(['-C', repoRoot, 'checkout', s.ref])
    }
  } else if (kind === 'branch') {
    console.log('[polyforge] 更新契约仓库 ' + repoRoot + '（pull ' + s.ref + '）...')
    try {
      git(['-C', repoRoot, 'pull', '--ff-only'])
    } catch (e) {
      throw new Error(
        '更新契约仓库失败：' + ((e.stderr && e.stderr.toString()) || e.message) + '\n'
        + '如果缓存损坏（比如手动改过），删除 ' + repoRoot + ' 后重试。'
      )
    }
  } else {
    console.log('[polyforge] 使用缓存 ' + repoRoot + '（ref=' + s.ref + '，' + kind + '，不可变）')
  }

  if (!existsSync(finalDir)) {
    throw new Error('契约仓库内路径不存在：' + s.path + '（仓库根：' + repoRoot + '）')
  }
  return finalDir
}
