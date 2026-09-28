import { app, screen } from 'electron'
import { createPetWindow, getPetWindow, focusPet, setAppQuitting } from './windows'
import { createTray } from './tray'
import { registerIpc } from './ipc'

// 单实例：重复启动时唤起已有宠物
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => focusPet())

  app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock?.hide()

    createPetWindow()
    createTray()
    registerIpc()

    screen.on('display-removed', () => getPetWindow()?.webContents.send('screen:changed', null))
    screen.on('display-metrics-changed', () => getPetWindow()?.webContents.send('screen:changed', null))

    app.on('activate', () => focusPet())
  })

  // 桌宠不响应窗口关闭（走托盘退出）；Cmd+Q 正常退出
  app.on('window-all-closed', () => {
    /* keep running */
  })

  // Cmd+Q / 系统退出时放行窗口关闭
  app.on('before-quit', () => setAppQuitting())
}
