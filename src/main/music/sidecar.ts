// 汽水音乐 sidecar：go-music-api 子进程（本地 HTTP，源码 github.com/guohuiyuan/go-music-api）
import { app } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const SIDECAR_PORT = 28080
const SIDECAR_BASE = `http://127.0.0.1:${SIDECAR_PORT}`

let proc: ChildProcess | null = null
let quitting = false

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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 杀掉同路径遗留 sidecar 并等端口真正释放（旧进程死透才不会被误判"已就绪"） */
async function killStaleAndWaitPortFree(bin: string): Promise<void> {
  try {
    execFile('pkill', ['-9', '-f', bin])
  } catch {
    /* 无 pkill 忽略 */
  }
  for (let i = 0; i < 20; i++) {
    if (!(await isUp())) return
    await sleep(200)
  }
}

function spawnSidecar(bin: string): ChildProcess {
  const child = spawn(bin, [], {
    env: { ...process.env, PORT: String(SIDECAR_PORT) },
    stdio: 'ignore',
    detached: false
  })
  child.on('exit', (code) => {
    console.log(`[soda-sidecar] exited (${code})`)
    if (proc === child) proc = null
    // 崩溃自动复活（退避），音乐能力自愈
    if (!quitting) {
      setTimeout(() => {
        if (!quitting) void startSidecar().catch(() => {})
      }, 2000)
    }
  })
  return child
}

/** 启动 sidecar 并等待**自己 spawn 的进程**就绪；端口被占先清理，失败重试一次 */
export async function startSidecar(): Promise<void> {
  const bin = binaryPath()
  if (!existsSync(bin)) {
    throw new Error(`sidecar binary missing: ${bin}（先跑 scripts/build-sidecar.sh）`)
  }

  // 已有健康实例且是我们管理的进程 → 直接用
  if (proc && !proc.killed && (await isUp())) return

  await killStaleAndWaitPortFree(bin)

  for (let attempt = 0; attempt < 2; attempt++) {
    const child = spawnSidecar(bin)
    proc = child
    for (let i = 0; i < 16; i++) {
      await sleep(400)
      const up = await isUp()
      const alive = !child.killed && child.exitCode === null
      if (up && alive) {
        console.log(`[soda-sidecar] ready on :${SIDECAR_PORT} (pid ${child.pid})`)
        return
      }
      if (!alive) break // 进程死了（多半端口竞态），清理后重试
    }
    await killStaleAndWaitPortFree(bin)
  }
  proc = null
  throw new Error('sidecar failed to start (port race or crash)')
}

export function stopSidecar(): void {
  quitting = true
  if (proc) {
    proc.kill()
    proc = null
  }
}

export function sidecarFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SIDECAR_BASE}${path}`, { ...init, signal: AbortSignal.timeout(15_000) })
}
