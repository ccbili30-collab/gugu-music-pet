import { app, Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import { getPetWindow, createChatWindow, createLoginWindow, createSettingsWindow, setAppQuitting } from './windows'
import type { PlayerState } from './music/service'
import type { LoginState } from './music/provider'

let tray: Tray | null = null

export function createTray(): Tray {
  if (tray) return tray
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('咕咕音乐桌宠')
  refreshTray(null, null)
  return tray
}

export function refreshTray(player: PlayerState | null, login: LoginState | null): void {
  if (!tray) return
  const track = player?.track
  const template: Electron.MenuItemConstructorOptions[] = []

  if (track) {
    template.push({
      label: `${player?.playing ? '▶' : '⏸'} ${track.name} - ${track.artists}${player?.trial ? '（试听）' : ''}`,
      enabled: false
    })
    template.push(
      { label: '播放 / 暂停', click: () => void musicCommand('toggle') },
      { label: '上一首', click: () => void musicCommand('prev') },
      { label: '下一首', click: () => void musicCommand('next') },
      { type: 'separator' }
    )
  }
  template.push(
    { label: '显示咕咕', click: () => getPetWindow()?.show() },
    { label: '打开聊天', click: () => createChatWindow() },
    { label: '设置…', click: () => createSettingsWindow() },
    { type: 'separator' }
  )
  if (login?.loggedIn) {
    template.push(
      { label: `已登录：${login.nickname}`, enabled: false },
      { label: '退出网易云登录', click: () => void logout() }
    )
  } else {
    template.push({ label: '扫码登录网易云', click: () => createLoginWindow() })
  }
  template.push(
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        setAppQuitting()
        app.quit()
      }
    }
  )
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

// 延迟 import 打破 service ↔ tray 循环依赖
async function musicCommand(action: string): Promise<void> {
  const { musicService } = await import('./music/service')
  musicService.command(action)
}
async function logout(): Promise<void> {
  const { musicService } = await import('./music/service')
  await musicService.logout()
  refreshTray(null, { loggedIn: false })
}
