/**
 * 契约源解析：把契约仓库 clone 到【跨项目共享的缓存目录】，按需更新。
 *
 * 缓存位置由 config.source.cacheDir 决定（默认见 config.mjs：系统临时目录下的
 * polyforge-cache-<user>，绝不在任何项目目录内）。契约仓库与具体项目无关，
 * 同一台机器上的所有消费方共用一份 clone。
 *
 * 更新策略——先探测远程版本，同版本跳过网络传输：
 *   ref 是 branch    → ls-remote 取远程 HEAD sha，与本地 HEAD 比较；
 *                      相同则直接复用，不同才 fetch + reset
 *   ref 是 tag/commit → 不可变，本地已有即用（没有才去取）
 *
 * ref 类型判定失败（网络/认证）时抛错，绝不静默当成 commit——
 * 否则分支会被永久跳过更新，消费方一直用旧契约且毫无提示。
 */
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // 禁止 git 交互式询问凭据：脚本环境下会挂死。
    // 凭据助手（credential helper）不受影响，仍可正常认证。
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
}

export function sanitizeRef(ref) {
  return ref.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function repoNameOf(url) {
  return url.replace(/\.git$/, '').split(/[\/:]/).pop()
}

/**
 * 缓存目录名：仓库名 + URL 短哈希 + ref（ref 由调用方追加）。
 * 加 URL 哈希是因为不同 org 可能有同名仓库（如两个 we-engine-model），
 * 只按仓库名会撞车，导致一个项目的缓存被另一个覆盖。
 */
export function repoKeyOf(url) {
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 8)
  return repoNameOf(url) + '-' + hash
}

/** 本地 HEAD sha；失败返回 null（缓存可能损坏） */
function localHead(repoRoot) {
  try {
    return git(['-C', repoRoot, 'rev-parse', 'HEAD']).trim()
  } catch {
    return null
  }
}

/** 本地是否已有某个 commit 对象 */
function commitExists(repoRoot, sha) {
  try {
    git(['-C', repoRoot, 'cat-file', '-e', sha + '^{commit}'])
    return true
  } catch {
    return false
  }
}

/**
 * 判断 ref 类型：branch / tag / commit。
 * 用 git ls-remote 查 refs/heads 和 refs/tags，都查不到则视为 commit。
 *
 * 网络/认证失败时【必须抛错】——绝不能静默 fallback 到 commit。
 * 原因：fallback 会让一个分支 ref 被当成不可变 commit，从此跳过 pull，
 * 消费方永远用旧缓存且毫无提示。这是「契约不同源」的最隐蔽入口。
 */
function classifyRef(url, ref) {
  let out
  try {
    out = git(['ls-remote', url, 'refs/heads/' + ref, 'refs/tags/' + ref])
  } catch (e) {
    const detail = ((e.stderr && e.stderr.toString()) || e.message || '').trim()
    throw new Error(
      '无法访问契约仓库，无法判断 ref "' + ref + '" 的类型：\n'
      + '  ' + url + '\n'
      + '  ' + detail + '\n'
      + '请检查网络、git 凭据（SSH key / token），确认仓库可访问后重试。\n'
      + '（不会静默回退到 commit，否则分支会永远跳过 pull。）'
    )
  }
  if (out.split('\n').some((line) => line.endsWith('\trefs/heads/' + ref))) return 'branch'
  if (out.split('\n').some((line) => line.includes('refs/tags/' + ref))) return 'tag'

  // ls-remote 成功但既不是分支也不是标签。常见分支名却查不到，大概率是 ref 写错或
  // 远程仓库被改名/删分支。按 commit 处理会静默使用旧缓存，必须显式警告。
  if (/^(master|main|develop|release|trunk|dev)$/i.test(ref)) {
    console.warn('[polyforge] [warn] ref "' + ref + '" 看起来是分支名，但远程没有这个分支/标签。')
    console.warn('[polyforge] [warn] 当前按 commit 处理（缓存命中即用，不会 pull）。')
    console.warn('[polyforge] [warn] 请确认 ref 拼写正确，且远程仓库确实有这个分支。')
  }
  return 'commit'
}

/**
 * 探测远程 ref 当前指向的 commit sha。
 * - branch：ls-remote 取 refs/heads/<ref>
 * - tag：ls-remote 取 refs/tags/<ref>（annotated tag 取 peeled ^{}）
 * - commit：直接返回该 sha（无需网络，但调用方已知它是 commit）
 *
 * 网络/认证失败时抛错——不能静默退回本地缓存，否则消费方永远用旧契约。
 */
function remoteHead(url, ref, kind) {
  if (kind === 'commit') return ref
  const patterns = kind === 'branch'
    ? ['refs/heads/' + ref]
    : ['refs/tags/' + ref, 'refs/tags/' + ref + '^{}']
  let out
  try {
    out = git(['ls-remote', url, ...patterns])
  } catch (e) {
    const detail = ((e.stderr && e.stderr.toString()) || e.message || '').trim()
    throw new Error(
      '无法访问契约仓库，无法确认 ref "' + ref + '" 的最新版本：\n'
      + '  ' + url + '\n'
      + '  ' + detail + '\n'
      + '请检查网络、git 凭据（SSH key / token），确认仓库可访问后重试。\n'
      + '（不会静默使用本地旧缓存，否则你会在不知情的情况下基于过期契约生成。）'
    )
  }
  // annotated tag 会有两行：<sha> refs/tags/x 和 <sha> refs/tags/x^{}
  // peeled 那行才是真正的 commit，优先取它。
  const lines = out.split('\n').filter(Boolean)
  const peeled = lines.find((l) => l.endsWith('\trefs/tags/' + ref + '^{}'))
  if (peeled) return peeled.split('\t')[0]
  const plain = lines.find((l) => l.includes('refs/' + (kind === 'branch' ? 'heads' : 'tags') + '/' + ref))
  if (plain) return plain.split('\t')[0]
  throw new Error('远程没有找到 ref "' + ref + '"（类型判定为 ' + kind + '）。')
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

  const repoRoot = join(s.cacheDir, repoKeyOf(s.git) + '-' + sanitizeRef(s.ref))
  const finalDir = s.path && s.path !== '.' ? join(repoRoot, s.path) : repoRoot
  const kind = classifyRef(s.git, s.ref)

  // git clone 不保证创建多级父目录（尤其共享缓存指向工作区外时），显式建好。
  if (!existsSync(s.cacheDir)) mkdirSync(s.cacheDir, { recursive: true })

  if (!existsSync(repoRoot)) {
    // 冷启动：缓存不存在，必须 clone
    console.log('[polyforge] 克隆契约仓库 ' + s.git + '（ref=' + s.ref + '，类型=' + kind + '）...')
    if (kind === 'branch') {
      git(['clone', '--branch', s.ref, '--single-branch', s.git, repoRoot])
    } else {
      git(['clone', s.git, repoRoot])
      git(['-C', repoRoot, 'checkout', s.ref])
    }
  } else {
    // 热启动：先探测远程版本，与本地比较
    const want = remoteHead(s.git, s.ref, kind)
    const have = localHead(repoRoot)

    // commit 类型下 want 可能是短 sha，直接与完整 HEAD 比较会永远不等。
    // 用 rev-parse 把 want 规范化成完整 sha 再比；解析失败（本地没这个对象）则保持原样，
    // 后续 commitExists 会走 fetch 分支。
    let wantFull = want
    if (kind === 'commit') {
      try { wantFull = git(['-C', repoRoot, 'rev-parse', '--verify', '--quiet', want + '^{commit}']).trim() }
      catch { wantFull = want }
    }

    if (wantFull && have === wantFull) {
      // 同版本——跳过一切网络传输，直接用
      console.log('[polyforge] 契约已是最新 ' + s.ref + '@' + wantFull.slice(0, 8) + '，跳过更新')
    } else if (kind === 'branch') {
      // 分支有新提交：fetch 该分支后 reset --hard（不 merge，保证与远程一致）
      console.log('[polyforge] 契约有更新 ' + s.ref + '：' + (have ? have.slice(0, 8) : '?') + ' → ' + want.slice(0, 8))
      try {
        git(['-C', repoRoot, 'fetch', 'origin', s.ref])
        git(['-C', repoRoot, 'reset', '--hard', 'FETCH_HEAD'])
      } catch (e) {
        throw new Error(
          '更新契约仓库失败：' + ((e.stderr && e.stderr.toString()) || e.message) + '\n'
          + '如果缓存损坏（比如手动改过），删除 ' + repoRoot + ' 后重试。'
        )
      }
    } else {
      // tag/commit：不可变。本地没有该对象时才 fetch。
      if (!commitExists(repoRoot, want)) {
        console.log('[polyforge] 拉取不可变 ref ' + s.ref + '@' + want.slice(0, 8) + '...')
        try {
          git(['-C', repoRoot, 'fetch', 'origin', want])
        } catch (e) {
          throw new Error(
            '拉取 commit 失败：' + ((e.stderr && e.stderr.toString()) || e.message) + '\n'
            + '如果缓存损坏，删除 ' + repoRoot + ' 后重试。'
          )
        }
      }
      try {
        git(['-C', repoRoot, 'checkout', want])
      } catch (e) {
        throw new Error(
          '切换 commit 失败：' + ((e.stderr && e.stderr.toString()) || e.message)
        )
      }
    }
  }

  if (!existsSync(finalDir)) {
    throw new Error('契约仓库内路径不存在：' + s.path + '（仓库根：' + repoRoot + '）')
  }
  return finalDir
}
