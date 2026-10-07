import { app, screen } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 测试实例隔离：--gugu-test 时 userData 指到临时目录，测试再也无法覆盖用户 key/历史
if (process.argv.includes('--gugu-test')) {
  const ud = join(tmpdir(), 'gugu-test-' + Date.now().toString(36))
  mkdirSync(ud, { recursive: true })
  app.setPath('userData', ud)
  try {
    writeFileSync('/tmp/gugu-test-ud', ud)
  } catch {
    /* 只读环境忽略 */
  }
  console.log('[test-mode] isolated userData:', ud)
}
import { createPetWindow, getPetWindow, focusPet, setAppQuitting } from './windows'
import { createTray, refreshTray } from './tray'
import { registerIpc } from './ipc'
import { registerMusicScheme, handleMusicProtocol } from './music/proxy'
import { registerPackScheme, handlePackProtocol } from './pack-scheme'
import { musicService, registerMusicIpc } from './music/service'
import { startSidecar, stopSidecar } from './music/sidecar'
import { startClickThrough } from './clickthrough'
import { registerAgentIpc } from './agent/ipc'

// music:// / gugu-pack:// 协议必须在 app ready 前注册
registerMusicScheme()
registerPackScheme()

// 单实例：重复启动时唤起已有宠物
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => focusPet())

  app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock?.hide()

    handleMusicProtocol()
    handlePackProtocol()
    void startSidecar()
      .then(() => musicService.init())
      .catch((e) => {
        console.error('[soda-sidecar] failed to start, music disabled:', e)
        void musicService.init()
        // 音乐不可用要在界面上说清楚，不能只留 console
        const win = getPetWindow()
        if (win) {
          win.webContents.once('did-finish-load', () => {
            win.webContents.send('pet:bubble', { kind: 'say', text: '音乐组件没启动起来，歌曲功能暂时不可用…' })
          })
        }
      })
    registerMusicIpc()

    createPetWindow()
    createTray()
    registerIpc()
    registerAgentIpc()
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
  app.on('before-quit', () => {
    setAppQuitting()
    stopSidecar()
  })
}
