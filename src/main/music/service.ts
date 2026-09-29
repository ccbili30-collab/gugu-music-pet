// 音乐服务：登录态持久化 + 搜索/取链/热评/歌词/推荐 + 播放器状态广播（汽水音乐源）
import { app, ipcMain, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SodaProvider, type Track, type Comment, type LyricLine, type LoginState } from './provider'
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
  resolve(id: string): Promise<{ url: string | null; trial: boolean; error?: string }>
  search(q: string, limit?: number): Promise<Track[]>
  detail(ids: string[]): Promise<Track[]>
  comments(id: string, limit?: number): Promise<Comment[]>
  lyric(id: string): Promise<LyricLine[]>
  recommend(): Promise<Track[]>
  loginState(): Promise<LoginState>
  queue(): Track[]
  currentState(): PlayerState
}

const stateFile = (): string => join(app.getPath('userData'), 'music-state.json')

export class MusicService {
  private provider = new SodaProvider()
  private cookie = '' // 汽水 sessionid（可选；免登录也能搜大部分内容）
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
        // sidecar 重启后 cookie.json 丢失，恢复写回
        void this.provider.applyCookie(this.cookie)
      }
      if (saved.queue) this.queue = saved.queue
      if (typeof saved.volume === 'number') this.player.volume = saved.volume
      this.player.queueCount = this.queue.length
    } catch {
      /* 首次启动无存档 */
    }
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
        const r = await this.provider.songUrl(id)
        if (!r.url) return { url: null, trial: false, error: 'unavailable' }
        return { url: proxyStreamUrl(r.url), trial: r.trial }
      },
      search: (q, limit) => this.provider.search(q, limit),
      detail: (ids) => this.provider.songDetail(ids),
      comments: (_id, _limit) => this.provider.hotComments(),
      lyric: (id) => this.provider.lyric(id),
      recommend: () => this.provider.recommend(),
      loginState: async () => this.login,
      queue: () => this.queue,
      currentState: () => this.player
    }
  }

  // ---- 播放器状态（渲染进程 audio 元素上报） ----

  setQueue(queue: Track[], startIndex = 0): void {
    this.queue = queue.slice(0, 200)
    this.persist()
    this.player.queueCount = this.queue.length
    this.player.queueIndex = startIndex
  }

  report(state: Partial<PlayerState>): void {
    const prevTrackId = this.player.track?.id
    this.player = { ...this.player, ...state }
    if (this.player.track) {
      this.player.queueCount = this.queue.length
    }
    this.fireState()
    // 换歌 → 场景引擎（AI 歌评/emo 维护），避免 import 环用动态加载
    if (state.track && state.track.id !== prevTrackId && prevTrackId !== undefined) {
      void import('../agent/scenes').then(({ sceneEngine }) => {
        void sceneEngine.onTrackChange(state.track as { id: string; name: string; artists: string }, sceneEngine.mode !== 'emo')
      })
    }
  }

  command(action: string, value?: number): void {
    // 转发给宠物窗口的 audio 引擎执行
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.getTitle() === 'Gugu Pet') {
        win.webContents.send('music:command', { action, value })
      }
    }
  }

  /** Agent 工具用：设队列并让渲染层从头播放 */
  playInRenderer(queue: Track[], startIndex: number): void {
    this.setQueue(queue, startIndex)
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.getTitle() === 'Gugu Pet') {
        win.webContents.send('music:command', { action: 'playQueue', tracks: queue, startIndex })
      }
    }
  }

  // ---- 登录（汽水：抖音 App 扫码 / Cookie 粘贴兜底） ----

  async createQr(): Promise<{ key: string; qrimg: string }> {
    return this.provider.createQr()
  }

  async pollQr(key: string): Promise<{ status: string; nickname?: string }> {
    const r = await this.provider.pollQr(key)
    if (r.status === 'confirmed' && r.cookie) {
      await this.provider.applyCookie(r.cookie)
      this.cookie = r.cookie
      this.login = { loggedIn: true, nickname: '汽水听众' }
      this.persist()
      this.fireState()
      return { status: 'confirmed', nickname: this.login.nickname }
    }
    return { status: r.status }
  }

  /** 登录窗读取当前 cookie（回显用，明文本地窗口，无脱敏必要） */
  getSodaCookie(): string {
    return this.cookie
  }

  /** 保存汽水 cookie：写 sidecar（生效）+ 本地持久化 */
  async setSodaCookie(cookie: string): Promise<{ ok: boolean }> {
    const c = cookie.trim()
    if (!c) return { ok: false }
    const ok = await this.provider.applyCookie(c)
    if (!ok) return { ok: false }
    this.cookie = c
    this.login = { loggedIn: true, nickname: '汽水听众' }
    this.persist()
    this.fireState()
    return { ok: true }
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
  ipcMain.handle('music:cookie:get', () => musicService.getSodaCookie())
  ipcMain.handle('music:cookie:set', (_e, cookie: string) => musicService.setSodaCookie(cookie))
  ipcMain.handle('music:login:state', () => api.loginState())
  ipcMain.handle('music:login:logout', () => musicService.logout())
  ipcMain.handle('music:search', (_e, q: string, limit?: number) => api.search(q, limit))
  ipcMain.handle('music:resolve', (_e, id: string) => api.resolve(id))
  ipcMain.handle('music:detail', (_e, ids: string[]) => api.detail(ids))
  ipcMain.handle('music:comments', (_e, id: string, limit?: number) => api.comments(id, limit))
  ipcMain.handle('music:lyric', (_e, id: string) => api.lyric(id))
  ipcMain.handle('music:recommend', () => api.recommend())
  ipcMain.handle('music:queue:get', () => api.queue())
  ipcMain.handle('music:player:state', () => api.currentState())
  ipcMain.on('music:report', (_e, state: Partial<PlayerState>) => musicService.report(state))
  ipcMain.on('music:queue:set', (_e, queue: Track[], startIndex: number) => musicService.setQueue(queue, startIndex))
  // 聊天窗歌曲卡片点播 → 设队列并推给宠物窗口播放
  ipcMain.on('music:play-card', (_e, tracks: Track[], index: number) => musicService.playInRenderer(tracks, index))
}
