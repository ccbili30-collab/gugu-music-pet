import { app, Menu, Tray, nativeImage, screen, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { getPetWindow, createChatWindow, createLoginWindow, createSettingsPanel, getSettingsPanel, setAppQuitting } from './windows'
import { listPacks } from './packs'
import { loadConfig } from './store'
import type { PlayerState } from './music/service'
import type { LoginState } from './music/provider'

let tray: Tray | null = null
let contextMenu: Menu | null = null
let panelLastHiddenAt = 0
let lastPlayer: PlayerState | null = null
let lastLogin: LoginState | null = null

const PANEL_W = 360

export function createTray(): Tray {
  if (tray) return tray
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('pet 音乐桌宠')
  rebuildMenu(null, null)
  // 左键：托盘弹出设置面板；右键：完整功能菜单
  tray.on('click', () => toggleSettingsPanel())
  tray.on('right-click', () => {
    if (contextMenu) tray?.popUpContextMenu(contextMenu)
  })
  return tray
}

export function refreshTray(player: PlayerState | null, login: LoginState | null): void {
  rebuildMenu(player, login)
}

/** 换角色包后调用：刷新菜单勾选状态 */
export function refreshTrayMenu(): void {
  rebuildMenu(lastPlayer, lastLogin)
}

/** 托盘图标下方弹出/收起设置面板 */
export function toggleSettingsPanel(): void {
  const panel = getSettingsPanel()
  const visible = panel?.isVisible() ?? false
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

function petCmd(action: string, params: Record<string, unknown> = {}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.getTitle() === 'Gugu Pet') win.webContents.send('pet:command', { action, ...params })
  }
}

function rebuildMenu(player: PlayerState | null, login: LoginState | null): void {
  lastPlayer = player
  lastLogin = login
  const currentPackId = loadConfig().packId
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
      { label: '下一首', click: () => void musicCommand('next') }
    )
    template.push({ type: 'separator' })
  }

  template.push(
    { label: '随机来一首', click: () => void playRandom() },
    { label: '看看热评', click: () => petCmd('hotcomments') },
    { label: '演示：雨夜 EMO', click: () => void forceEmoDemo() },
    { label: '陪我聊聊', click: () => createChatWindow() },
    { type: 'separator' },
    { label: '走两步', click: () => petCmd('walk') },
    { label: '飞一圈', click: () => petCmd('fly') },
    { label: '悬浮模式 开/关', click: () => petCmd('hover') },
    { label: '变大一点', click: () => petCmd('scale-up') },
    { label: '变小一点', click: () => petCmd('scale-down') },
    { type: 'separator' }
  )

  const packs = listPacks()
  if (packs.length > 1) {
    template.push({
      label: '角色',
      submenu: packs.map((p) => ({
        label: `${p.id === currentPackId ? '● ' : ''}${p.name}`,
        click: () => {
          petCmd('pack', { id: p.id })
          rebuildMenu(lastPlayer, lastLogin)
        }
      }))
    })
    template.push({ type: 'separator' })
  }

  template.push(
    { label: '显示 pet', click: () => getPetWindow()?.show() },
    { label: '设置…', click: () => showSettingsPanel() },
    { type: 'separator' }
  )
  if (login?.loggedIn) {
    template.push(
      { label: `已登录：${login.nickname}`, enabled: false },
      { label: '退出汽水登录', click: () => void logout() }
    )
  } else {
    template.push({ label: '登录汽水音乐', click: () => createLoginWindow() })
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

async function playRandom(): Promise<void> {
  const { musicService } = await import('./music/service')
  try {
    const list = await musicService.api.recommend()
    if (list.length) musicService.playInRenderer(list, 0)
  } catch {
    /* 网络异常静默 */
  }
}

async function forceEmoDemo(): Promise<void> {
  const { sceneEngine } = await import('./agent/scenes')
  void sceneEngine.forceEmoForDemo()
}

async function logout(): Promise<void> {
  const { musicService } = await import('./music/service')
  await musicService.logout()
  rebuildMenu(null, { loggedIn: false })
}
