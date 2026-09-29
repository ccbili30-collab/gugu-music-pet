import { app, Menu, Tray, nativeImage, screen } from 'electron'
import { join } from 'node:path'
import { getPetWindow, createChatWindow, createLoginWindow, createSettingsPanel, getSettingsPanel, setAppQuitting } from './windows'
import type { PlayerState } from './music/service'
import type { LoginState } from './music/provider'

let tray: Tray | null = null
let contextMenu: Menu | null = null
let panelLastHiddenAt = 0

const PANEL_W = 360

export function createTray(): Tray {
  if (tray) return tray
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('咕咕音乐桌宠')
  rebuildMenu(null, null)
  // 左键：托盘弹出设置面板（Keepresso 式）；右键：传统菜单
  tray.on('click', () => toggleSettingsPanel())
  tray.on('right-click', () => {
    if (contextMenu) tray?.popUpContextMenu(contextMenu)
  })
  return tray
}

export function refreshTray(player: PlayerState | null, login: LoginState | null): void {
  rebuildMenu(player, login)
}

/** 托盘图标下方弹出/收起设置面板 */
export function toggleSettingsPanel(): void {
  const panel = getSettingsPanel()
  const visible = panel?.isVisible() ?? false
  // 刚因失焦收起（比如点托盘图标触发 blur）就不立刻再弹
  if (!visible && Date.now() - panelLastHiddenAt < 300) return
  if (visible) {
    panel?.hide()
    panelLastHiddenAt = Date.now()
  } else {
    showSettingsPanel()
  }
}

export function showSettingsPanel(): void {
  const panel = createSettingsPanel()
  const bounds = tray?.getBounds()
  const display = screen.getDisplayNearestPoint(bounds ? { x: bounds.x, y: bounds.y } : screen.getPrimaryDisplay().workArea)
  const wa = display.workArea
  let x = wa.x + wa.width - PANEL_W - 8
  let y = wa.y + 5
  if (bounds) {
    x = Math.round(bounds.x + bounds.width / 2 - PANEL_W / 2)
    x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - PANEL_W - 8))
    y = Math.round(bounds.y + bounds.height + 5)
  }
  panel.setPosition(x, y)
  panel.show()
  panel.focus()
}

export function hideSettingsPanel(): void {
  const panel = getSettingsPanel()
  if (panel?.isVisible()) {
    panel.hide()
    panelLastHiddenAt = Date.now()
  }
}

function rebuildMenu(player: PlayerState | null, login: LoginState | null): void {
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
    { label: '设置…', click: () => showSettingsPanel() },
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
  contextMenu = Menu.buildFromTemplate(template)
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
