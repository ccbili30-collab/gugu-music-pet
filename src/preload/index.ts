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
  action: 'toggle' | 'next' | 'prev' | 'stop' | 'volume' | 'seek' | 'play' | 'playQueue'
  value?: number
  tracks?: Track[]
  startIndex?: number
}

export interface ChatReplyMsg {
  ok: boolean
  content: string
  kaomoji?: string
}

export interface SongsCardMsg {
  type: 'songs'
  tracks: Track[]
}

export interface GuguApi {
  move(x: number, y: number): void
  emitEvent(name: string, payload?: unknown): void
  screenInfo(x: number, y: number): Promise<ScreenInfo>
  onScreenChanged(cb: () => void): void
  onCommand(cb: (cmd: unknown) => void): void
  packsList(): Promise<{ id: string; name: string; version: string }[]>
  spawnGet(): Promise<{ x: number; y: number }>
  spawnSave(x: number, y: number): void
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
    playCard(tracks: Track[], index: number): void
  }
  onMusicState(cb: (state: { player: PlayerState; login: LoginStateInfo }) => void): () => void
  onMusicCommand(cb: (cmd: MusicCommandMsg) => void): () => void
  onPetBubble(cb: (msg: { kind: 'say' | 'hum' | 'comment' | 'resonance' | 'invite'; text?: string; kaomoji?: string }) => void): () => void
  chat: {
    send(text: string): void
    history(): Promise<{ role: 'user' | 'assistant'; content: string; ts?: number }[]>
    clear(): Promise<{ ok: boolean }>
    configGet(): Promise<{ llm: { baseUrl: string; apiKey: string; model: string; temperature: number }; personaName: string }>
    configSet(cfg: { llm?: Partial<{ baseUrl: string; apiKey: string; model: string; temperature: number }>; personaName?: string }): Promise<{ ok: boolean }>
    test(): Promise<{ ok: boolean; error?: string }>
  }
  onChatReply(cb: (msg: ChatReplyMsg) => void): () => void
  onChatCard(cb: (msg: SongsCardMsg) => void): () => void
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
  spawnGet: () => ipcRenderer.invoke('pet:spawn:get'),
  spawnSave: (x, y) => ipcRenderer.send('pet:spawn:save', x, y),
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
    queueSet: (queue, startIndex) => ipcRenderer.send('music:queue:set', queue, startIndex),
    playCard: (tracks, index) => ipcRenderer.send('music:play-card', tracks, index)
  },
  onMusicState: (cb) => {
    const listener = (_e: IpcRendererEvent, state: { player: PlayerState; login: LoginStateInfo }): void => cb(state)
    ipcRenderer.on('music:state', listener)
    return () => ipcRenderer.removeListener('music:state', listener)
  },
  onMusicCommand: (cb) => {
    const listener = (_e: IpcRendererEvent, cmd: MusicCommandMsg): void => cb(cmd)
    ipcRenderer.on('music:command', listener)
    return () => ipcRenderer.removeListener('music:command', listener)
  },
  onPetBubble: (cb) => {
    const listener = (_e: IpcRendererEvent, msg: Parameters<typeof cb>[0]): void => cb(msg)
    ipcRenderer.on('pet:bubble', listener)
    return () => ipcRenderer.removeListener('pet:bubble', listener)
  },
  chat: {
    send: (text) => ipcRenderer.send('chat:send', text),
    history: () => ipcRenderer.invoke('chat:history'),
    clear: () => ipcRenderer.invoke('chat:clear'),
    configGet: () => ipcRenderer.invoke('llm:config:get'),
    configSet: (cfg) => ipcRenderer.invoke('llm:config:set', cfg),
    test: () => ipcRenderer.invoke('llm:test')
  },
  onChatReply: (cb) => {
    const listener = (_e: IpcRendererEvent, msg: ChatReplyMsg): void => cb(msg)
    ipcRenderer.on('chat:reply', listener)
    return () => ipcRenderer.removeListener('chat:reply', listener)
  },
  onChatCard: (cb) => {
    const listener = (_e: IpcRendererEvent, msg: SongsCardMsg): void => cb(msg)
    ipcRenderer.on('chat:card', listener)
    return () => ipcRenderer.removeListener('chat:card', listener)
  }
}

contextBridge.exposeInMainWorld('gugu', api)
