import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

export interface ScreenInfo {
  id: number
  workArea: { x: number; y: number; width: number; height: number }
}

export interface Track {
  id: number
  name: string
  artists: string
  album?: string
  durationMs: number
  cover?: string
}

export interface Comment {
  id: string
  userName: string
  avatar?: string
  content: string
  likedCount: number
}

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

export interface LoginStateInfo {
  loggedIn: boolean
  nickname?: string
  avatar?: string
  vip?: boolean
}

export interface MusicCommandMsg {
  action: 'toggle' | 'next' | 'prev' | 'stop' | 'volume' | 'seek' | 'play'
  value?: number
}

export interface GuguApi {
  move(x: number, y: number): void
  emitEvent(name: string, payload?: unknown): void
  screenInfo(x: number, y: number): Promise<ScreenInfo>
  onScreenChanged(cb: () => void): void
  onCommand(cb: (cmd: unknown) => void): void
  packsList(): Promise<{ id: string; name: string; version: string }[]>
  reportRegions(rects: { x: number; y: number; w: number; h: number }[]): void
  setDragging(d: boolean): void
  openChat(): void
  openLogin(): void
  quit(): void
  music: {
    qrCreate(): Promise<{ key: string; qrimg: string }>
    qrPoll(key: string): Promise<{ status: string; nickname?: string }>
    loginState(): Promise<LoginStateInfo>
    logout(): Promise<void>
    search(q: string, limit?: number): Promise<Track[]>
    resolve(id: number): Promise<{ url: string | null; trial: boolean; error?: string }>
    detail(ids: number[]): Promise<Track[]>
    comments(id: number, limit?: number): Promise<Comment[]>
    lyric(id: number): Promise<{ time: number; text: string }[]>
    recommend(): Promise<Track[]>
    queueGet(): Promise<Track[]>
    playerState(): Promise<PlayerState>
    report(state: Partial<PlayerState>): void
    queueSet(queue: Track[], startIndex: number): void
  }
  onMusicState(cb: (state: { player: PlayerState; login: LoginStateInfo }) => void): void
  onMusicCommand(cb: (cmd: MusicCommandMsg) => void): void
}

const api: GuguApi = {
  move: (x, y) => ipcRenderer.send('pet:move', x, y),
  emitEvent: (name, payload) => ipcRenderer.send('pet:event', name, payload ?? null),
  screenInfo: (x, y) => ipcRenderer.invoke('screen:info', x, y),
  onScreenChanged: (cb) => {
    const listener = (_e: IpcRendererEvent): void => cb()
    ipcRenderer.on('screen:changed', listener)
  },
  onCommand: (cb) => {
    const listener = (_e: IpcRendererEvent, cmd: unknown): void => cb(cmd)
    ipcRenderer.on('pet:command', listener)
  },
  packsList: () => ipcRenderer.invoke('packs:list'),
  reportRegions: (rects) => ipcRenderer.send('ui:regions', rects),
  setDragging: (d) => ipcRenderer.send('ui:dragging', d),
  openChat: () => ipcRenderer.send('chat:open'),
  openLogin: () => ipcRenderer.send('login:open'),
  quit: () => ipcRenderer.send('app:quit'),
  music: {
    qrCreate: () => ipcRenderer.invoke('music:qr:create'),
    qrPoll: (key) => ipcRenderer.invoke('music:qr:poll', key),
    loginState: () => ipcRenderer.invoke('music:login:state'),
    logout: () => ipcRenderer.invoke('music:login:logout'),
    search: (q, limit) => ipcRenderer.invoke('music:search', q, limit),
    resolve: (id) => ipcRenderer.invoke('music:resolve', id),
    detail: (ids) => ipcRenderer.invoke('music:detail', ids),
    comments: (id, limit) => ipcRenderer.invoke('music:comments', id, limit),
    lyric: (id) => ipcRenderer.invoke('music:lyric', id),
    recommend: () => ipcRenderer.invoke('music:recommend'),
    queueGet: () => ipcRenderer.invoke('music:queue:get'),
    playerState: () => ipcRenderer.invoke('music:player:state'),
    report: (state) => ipcRenderer.send('music:report', state),
    queueSet: (queue, startIndex) => ipcRenderer.send('music:queue:set', queue, startIndex)
  },
  onMusicState: (cb) => {
    const listener = (_e: IpcRendererEvent, state: { player: PlayerState; login: LoginStateInfo }): void => cb(state)
    ipcRenderer.on('music:state', listener)
  },
  onMusicCommand: (cb) => {
    const listener = (_e: IpcRendererEvent, cmd: MusicCommandMsg): void => cb(cmd)
    ipcRenderer.on('music:command', listener)
  }
}

contextBridge.exposeInMainWorld('gugu', api)
