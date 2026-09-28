import { ipcMain, screen, app } from 'electron'
import { getPetWindow, createChatWindow, createLoginWindow, createSettingsWindow, PET_WINDOW, setAppQuitting } from './windows'
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
  // 渲染进程物理循环 → 移动宠物窗口（坐标为宠物脚底点的屏幕坐标）
  ipcMain.on('pet:move', (_e, x: number, y: number) => {
    const win = getPetWindow()
    if (!win) return
    const wx = Math.round(x - PET_WINDOW.anchorX)
    const wy = Math.round(y - PET_WINDOW.anchorY)
    const [cx, cy] = win.getPosition()
    if (cx !== wx || cy !== wy) win.setPosition(wx, wy, false)
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
  ipcMain.on('settings:open', () => createSettingsWindow())
  ipcMain.on('ui:regions', (_e, rects) => setRegions(rects))
  ipcMain.on('ui:dragging', (_e, d: boolean) => setDragging(d))
  ipcMain.on('app:quit', () => {
    setAppQuitting()
    app.quit()
  })
}
