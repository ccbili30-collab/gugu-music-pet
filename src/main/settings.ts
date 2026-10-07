// 设置面板 IPC：天气城市 / 音量 / 角色包（LLM 配置复用 agent/ipc.ts 的 llm:*）
import { ipcMain, BrowserWindow } from 'electron'
import { getCity, setCity } from './weather'
import { loadConfig, saveConfig } from './store'
import { refreshTrayMenu } from './tray'
import { importCustomPack } from './petpack'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => ({
    city: getCity()
  }))

  ipcMain.handle('settings:setCity', (_e, city: string) => {
    const c = String(city).trim().slice(0, 32)
    if (!c) return { ok: false }
    setCity(c)
    return { ok: true, city: c }
  })

  ipcMain.handle('settings:setVolume', (_e, v: unknown) => {
    const vol = Math.min(1, Math.max(0, Number(v)))
    if (!Number.isFinite(vol)) return { ok: false }
    void import('./music/service').then(({ musicService }) => musicService.command('volume', vol))
    return { ok: true }
  })

  ipcMain.handle('pet:scale:get', () => loadConfig())
  ipcMain.handle('pet:scale', (_e, v: unknown) => {
    const val = Math.min(2, Math.max(0.5, Number(v) || 1))
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.getTitle() === 'Gugu Pet') win.webContents.send('pet:command', { action: 'scale', value: val })
    }
    return { ok: true }
  })
  ipcMain.handle('pet:autonomy-demo', () => {
    void import('./agent/scenes').then(({ sceneEngine }) => sceneEngine.autonomyDemo())
    return { ok: true }
  })
  ipcMain.handle('pet:pack:get', () => loadConfig().packId || 'dafeiyu')
  ipcMain.handle('pet:import', () => importCustomPack())

  ipcMain.handle('pet:pack:set', (_e, id: string) => {
    const cur = loadConfig()
    saveConfig({ ...cur, packId: String(id).slice(0, 64) })
    void import('./tray').then(({ refreshTrayMenu }) => refreshTrayMenu())
    return { ok: true }
  })

  // 设置窗 / 托盘 → 宠物窗切换角色包
  ipcMain.handle('settings:switchPack', (_e, id: string) => {
    const cur = loadConfig()
    saveConfig({ ...cur, packId: String(id).slice(0, 64) })
    refreshTrayMenu()
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.getTitle() === 'Gugu Pet') {
        win.webContents.send('pet:command', { action: 'pack', id })
      }
    }
    return { ok: true }
  })
}
