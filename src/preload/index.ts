import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

export interface ScreenInfo {
  id: number
  workArea: { x: number; y: number; width: number; height: number }
}

export interface GuguApi {
  move(x: number, y: number): void
  emitEvent(name: string, payload?: unknown): void
  screenInfo(x: number, y: number): Promise<ScreenInfo>
  onScreenChanged(cb: () => void): void
  onCommand(cb: (cmd: unknown) => void): void
  openChat(): void
  quit(): void
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
  openChat: () => ipcRenderer.send('chat:open'),
  quit: () => ipcRenderer.send('app:quit')
}

contextBridge.exposeInMainWorld('gugu', api)
