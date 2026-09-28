// 音乐服务：登录态持久化 + 搜索/取链/热评/歌词/推荐 + 播放器状态广播
import { app, ipcMain, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { NetEaseProvider, type Track, type LoginState } from './provider'
import { proxyStreamUrl } from './proxy'

export interface PlayerState {
  track: Track | null
  playing: boolean
  positionSec: number
  durationSec: number
  volume: number
  queueIndex: number
  queueCount: number
  trial: boolean
}

export interface MusicApi {
  resolve(id: number): Promise<{ url: string | null; trial: boolean; error?: string }>
  search(q: string, limit?: number): Promise<Track[]>
  detail(ids: number[]): Promise<Track[]>
  comments(id: number, limit?: number): Promise<Awaited<ReturnType<NetEaseProvider['hotComments']>>>
  lyric(id: number): Promise<Awaited<ReturnType<NetEaseProvider['lyric']>>>
  recommend(): Promise<Track[]>
  loginState(): Promise<LoginState>
  queue(): Track[]
  currentState(): PlayerState
}

const stateFile = (): string => join(app.getPath('userData'), 'music-state.json')

export class MusicService {
  private provider = new NetEaseProvider()
  private cookie = ''
  private anonCookie = ''
  private login: LoginState = { loggedIn: false }
  private queue: Track[] = []
  private player: PlayerState = {
    track: null,
    playing: false,
    positionSec: 0,
    durationSec: 0,
    volume: 0.8,
    queueIndex: -1,
    queueCount: 0,
    trial: false
  }
  private onStateChange: ((s: PlayerState, l: LoginState) => void) | null = null

  async init(): Promise<void> {
    // 恢复登录态
    try {
      const saved = JSON.parse(readFileSync(stateFile(), 'utf8')) as {
        cookie?: string
        login?: LoginState
        queue?: Track[]
        volume?: number
      }
      if (saved.cookie) {
        this.cookie = saved.cookie
        this.login = await this.provider.loginState(this.cookie)
      }
      if (saved.queue) this.queue = saved.queue
      if (typeof saved.volume === 'number') this.player.volume = saved.volume
      this.player.queueCount = this.queue.length
    } catch {
      /* 首次启动无存档 */
    }
    if (!this.cookie) this.anonCookie = await this.provider.anonCookie()
    this.fireState()
  }

  private persist(): void {
    try {
      mkdirSync(app.getPath('userData'), { recursive: true })
      writeFileSync(
        stateFile(),
        JSON.stringify({ cookie: this.cookie, login: this.login, queue: this.queue, volume: this.player.volume })
      )
    } catch (e) {
      console.error('[music] persist failed', e)
    }
  }

  setStateListener(cb: (s: PlayerState, l: LoginState) => void): void {
    this.onStateChange = cb
  }

  private fireState(): void {
    this.onStateChange?.(this.player, this.login)
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('music:state', { player: this.player, login: this.login })
    }
  }

  get api(): MusicApi {
    return {
      resolve: async (id) => {
        const r = await this.provider.songUrl(id, this.activeCookie())
        if (!r.url) return { url: null, trial: false, error: r.trial ? 'vip' : 'unavailable' }
        return { url: proxyStreamUrl(r.url), trial: r.trial }
      },
      search: (q, limit) => this.provider.search(q, limit, this.activeCookie()),
      detail: (ids) => this.provider.songDetail(ids, this.activeCookie()),
      comments: (id, limit) => this.provider.hotComments(id, limit, this.activeCookie()),
      lyric: (id) => this.provider.lyric(id, this.activeCookie()),
      recommend: () => this.provider.recommend(this.activeCookie()),
      loginState: async () => this.login,
      queue: () => this.queue,
      currentState: () => this.player
    }
  }

  private activeCookie(): string {
    return this.cookie || this.anonCookie
  }

  // ---- 播放器状态（渲染进程 audio 元素上报） ----

  setQueue(queue: Track[], startIndex = 0): void {
    this.queue = queue.slice(0, 200)
    this.persist()
    this.player.queueCount = this.queue.length
    this.player.queueIndex = startIndex
  }

  report(state: Partial<PlayerState>): void {
    this.player = { ...this.player, ...state }
    if (this.player.track) {
      this.player.queueCount = this.queue.length
    }
    this.fireState()
  }

  command(action: string, value?: number): void {
    // 转发给宠物窗口的 audio 引擎执行
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.getTitle() === 'Gugu Pet') {
        win.webContents.send('music:command', { action, value })
      }
    }
  }

  // ---- 登录 ----

  async createQr(): Promise<{ key: string; qrimg: string }> {
    return this.provider.createQr(this.activeCookie())
  }

  async pollQr(key: string): Promise<{ status: string; nickname?: string }> {
    const r = await this.provider.pollQr(key, this.activeCookie())
    if (r.status === 'confirmed' && r.cookie) {
      this.cookie = r.cookie
      this.login = await this.provider.loginState(this.cookie)
      this.persist()
      this.fireState()
      return { status: 'confirmed', nickname: this.login.nickname }
    }
    return { status: r.status }
  }

  async logout(): Promise<void> {
    this.cookie = ''
    this.login = { loggedIn: false }
    this.persist()
    this.fireState()
  }

  get loginStateValue(): LoginState {
    return this.login
  }
}

export const musicService = new MusicService()

export function registerMusicIpc(): void {
  const api = musicService.api
  ipcMain.handle('music:qr:create', () => musicService.createQr())
  ipcMain.handle('music:qr:poll', (_e, key: string) => musicService.pollQr(key))
  ipcMain.handle('music:login:state', () => api.loginState())
  ipcMain.handle('music:login:logout', () => musicService.logout())
  ipcMain.handle('music:search', (_e, q: string, limit?: number) => api.search(q, limit))
  ipcMain.handle('music:resolve', (_e, id: number) => api.resolve(id))
  ipcMain.handle('music:detail', (_e, ids: number[]) => api.detail(ids))
  ipcMain.handle('music:comments', (_e, id: number, limit?: number) => api.comments(id, limit))
  ipcMain.handle('music:lyric', (_e, id: number) => api.lyric(id))
  ipcMain.handle('music:recommend', () => api.recommend())
  ipcMain.handle('music:queue:get', () => api.queue())
  ipcMain.handle('music:player:state', () => api.currentState())
  ipcMain.on('music:report', (_e, state: Partial<PlayerState>) => musicService.report(state))
  ipcMain.on('music:queue:set', (_e, queue: Track[], startIndex: number) => musicService.setQueue(queue, startIndex))
}
