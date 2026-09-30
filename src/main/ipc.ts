import { ipcMain, screen, app } from 'electron'
import { createChatWindow, createLoginWindow, fitPetWindow, setAppQuitting } from './windows'
import { showSettingsPanel } from './tray'
import { registerPacksIpc } from './packs'
import { setRegions, setDragging } from './clickthrough'
import { registerSpawnIpc } from './spawn'
import { registerSettingsIpc } from './settings'

export interface PetEventPayload {
  [key: string]: unknown
}

export function registerIpc(): void {
  registerPacksIpc()
  registerSpawnIpc()
  registerSettingsIpc()
  // 宠物窗贴满工作区（跨屏/分辨率变化时由渲染层请求重设）
  ipcMain.on('pet:fit', (_e, wa: { x: number; y: number; width: number; height: number }) => {
    if (
      Number.isFinite(wa?.x) && Number.isFinite(wa?.y) && Number.isFinite(wa?.width) && Number.isFinite(wa?.height) &&
      wa.width > 0 && wa.height > 0
    ) {
      fitPetWindow(wa)
    }
  })

  // 查询某点所在/最近的显示器工作区（用于物理边界）
  ipcMain.handle('screen:info', (_e, x: number, y: number) => {
    const display = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) })
    return { id: display.id, workArea: display.workArea }
  })

  // 宠物侧事件（点击/抚摸/投掷/落地…）→ 大脑驱动力 + 反射层
  ipcMain.on('pet:event', (_e, name: string, payload: PetEventPayload) => {
    void import('./agent/brain').then(({ brain }) => brain.petEvent(name))
    if (name === 'fling' || name === 'land') {
      console.log(`[pet:event] ${name}`, payload ?? '')
    }
  })

  ipcMain.on('chat:open', () => createChatWindow())
  ipcMain.on('login:open', () => createLoginWindow())
  ipcMain.on('settings:open', () => showSettingsPanel())
  ipcMain.on('ui:regions', (_e, rects) => setRegions(rects))
  ipcMain.on('ui:dragging', (_e, d: boolean) => setDragging(d))
  ipcMain.on('app:quit', () => {
    setAppQuitting()
    app.quit()
  })
}
