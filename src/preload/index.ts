import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

export interface ScreenInfo {
  id: number
  workArea: { x: number; y: number; width: number; height: number }
}

export interface Track {
  id: string
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
  openSettings(): void
  quit(): void
  music: {
    cookieGet(): Promise<string>
    cookieSet(cookie: string): Promise<{ ok: boolean }>
    loginState(): Promise<LoginStateInfo>
    logout(): Promise<void>
    search(q: string, limit?: number): Promise<Track[]>
    resolve(id: string): Promise<{ url: string | null; trial: boolean; error?: string }>
    detail(ids: string[]): Promise<Track[]>
    comments(id: string, limit?: number): Promise<Comment[]>
    lyric(id: string): Promise<{ time: number; text: string }[]>
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
  sing: {
    pool(): Promise<string[]>
    summary(durSec: number): Promise<string>
  }
  onSceneState(cb: (msg: { mode: 'normal' | 'emo' | 'listening'; reason?: string }) => void): () => void
  sceneAccept(): void
  sceneDecline(): void
  sceneForceEmo(): Promise<void>
  settings: {
    get(): Promise<{ city: string }>
    setCity(city: string): Promise<{ ok: boolean; city?: string }>
    setVolume(v: number): Promise<{ ok: boolean }>
    switchPack(id: string): Promise<{ ok: boolean }>
  }
  petPackGet(): Promise<string>
  petPackSet(id: string): Promise<{ ok: boolean }>
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
  openSettings: () => ipcRenderer.send('settings:open'),
  quit: () => ipcRenderer.send('app:quit'),
  music: {
    cookieGet: () => ipcRenderer.invoke('music:cookie:get'),
    cookieSet: (cookie) => ipcRenderer.invoke('music:cookie:set', cookie),
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
  },
  sing: {
    pool: () => ipcRenderer.invoke('sing:pool'),
    summary: (durSec) => ipcRenderer.invoke('sing:summary', durSec)
  },
  onSceneState: (cb) => {
    const listener = (_e: IpcRendererEvent, msg: { mode: 'normal' | 'emo' | 'listening'; reason?: string }): void => cb(msg)
    ipcRenderer.on('scene:state', listener)
    return () => ipcRenderer.removeListener('scene:state', listener)
  },
  sceneAccept: () => ipcRenderer.send('scene:accept'),
  sceneDecline: () => ipcRenderer.send('scene:decline'),
  sceneForceEmo: () => ipcRenderer.invoke('scene:force-emo'),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setCity: (city) => ipcRenderer.invoke('settings:setCity', city),
    setVolume: (v) => ipcRenderer.invoke('settings:setVolume', v),
    switchPack: (id) => ipcRenderer.invoke('settings:switchPack', id)
  },
  petPackGet: () => ipcRenderer.invoke('pet:pack:get'),
  petPackSet: (id) => ipcRenderer.invoke('pet:pack:set', id)
}

contextBridge.exposeInMainWorld('gugu', api)
