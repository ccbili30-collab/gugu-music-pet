import { app, screen } from 'electron'
import { createPetWindow, getPetWindow, focusPet, setAppQuitting } from './windows'
import { createTray, refreshTray } from './tray'
import { registerIpc } from './ipc'
import { registerMusicScheme, handleMusicProtocol } from './music/proxy'
import { musicService, registerMusicIpc } from './music/service'
import { startClickThrough } from './clickthrough'

// music:// 协议必须在 app ready 前注册
registerMusicScheme()

// 单实例：重复启动时唤起已有宠物
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => focusPet())

  app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock?.hide()

    handleMusicProtocol()
    void musicService.init()
    registerMusicIpc()

    createPetWindow()
    createTray()
    registerIpc()
    startClickThrough()

    musicService.setStateListener((player, login) => {
      refreshTray(player, login)
    })

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
