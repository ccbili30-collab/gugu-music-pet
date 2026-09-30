// 汽水音乐 sidecar：go-music-api 子进程（本地 HTTP，源码 github.com/guohuiyuan/go-music-api）
// dev 从 <项目>/sidecar/，打包后从 process.resourcesPath/sidecar/ 启动
import { app } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const SIDECAR_PORT = 28080
const SIDECAR_BASE = `http://127.0.0.1:${SIDECAR_PORT}`

let proc: ChildProcess | null = null

function binaryPath(): string {
  const packaged = join(process.resourcesPath ?? '', 'sidecar', 'go-music-api')
  if (app.isPackaged && existsSync(packaged)) return packaged
  return join(app.getAppPath(), 'sidecar', 'go-music-api')
}

async function isUp(): Promise<boolean> {
  try {
    const res = await fetch(`${SIDECAR_BASE}/api/v1/music/search?q=test&type=song&sources=soda`, {
      signal: AbortSignal.timeout(4000)
    })
    return res.ok
  } catch {
    return false
  }
}

/** 清理历史遗留的同路径 sidecar（app 崩溃时没机会 stopSidecar 会留下孤儿） */
function killStaleSidecar(bin: string): void {
  try {
    execFile('pkill', ['-f', bin], (err) => {
      if (!err) console.log('[soda-sidecar] killed stale instance')
    })
  } catch {
    /* pkill 不存在等场景忽略 */
  }
}

/** 启动 sidecar 并等待就绪；同路径遗留进程先清掉，保证进程始终被本 app 托管 */
export async function startSidecar(): Promise<void> {
  const bin = binaryPath()
  if (!existsSync(bin)) {
    throw new Error(`sidecar binary missing: ${bin}（先跑 scripts/build-sidecar.sh）`)
  }
  killStaleSidecar(bin)
  // 等 pkill 生效、端口释放
  await new Promise((r) => setTimeout(r, 600))
  const bin2 = binaryPath()
  if (!existsSync(bin)) {
    throw new Error(`sidecar binary missing: ${bin}（先跑 scripts/build-sidecar.sh）`)
  }
  proc = spawn(bin2, [], {
    env: { ...process.env, PORT: String(SIDECAR_PORT) },
    stdio: 'ignore',
    detached: false
  })
  proc.on('exit', (code) => {
    console.log(`[soda-sidecar] exited (${code})`)
    proc = null
  })
  for (let i = 0; i < 20; i++) {
    if (await isUp()) {
      console.log(`[soda-sidecar] ready on :${SIDECAR_PORT}`)
      return
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('sidecar did not become ready in 10s')
}

export function stopSidecar(): void {
  if (proc) {
    proc.kill()
    proc = null
  }
}

export function sidecarFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SIDECAR_BASE}${path}`, { ...init, signal: AbortSignal.timeout(15_000) })
}
