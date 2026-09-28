import { app, Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import { getPetWindow, createChatWindow, setAppQuitting } from './windows'

let tray: Tray | null = null

export function createTray(): Tray {
  if (tray) return tray
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('咕咕音乐桌宠')

  const rebuild = (): void => {
    const menu = Menu.buildFromTemplate([
      { label: '显示咕咕', click: () => getPetWindow()?.show() },
      { label: '打开聊天', click: () => createChatWindow() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          setAppQuitting()
          app.quit()
        }
      }
    ])
    tray?.setContextMenu(menu)
  }
  rebuild()
  return tray
}
