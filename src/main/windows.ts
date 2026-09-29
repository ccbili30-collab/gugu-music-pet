import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

/**
 * 宠物锚点：宠物"脚底中心"在窗口内的坐标。
 * 渲染进程以屏幕坐标系里的脚底点驱动物理，主进程按此偏移换算窗口位置。
 */
export const PET_WINDOW = { width: 560, height: 420, anchorX: 250, anchorY: 316 }

let petWin: BrowserWindow | null = null
let chatWin: BrowserWindow | null = null
let loginWin: BrowserWindow | null = null
let settingsPanel: BrowserWindow | null = null

function rendererUrl(name: string): string | null {
  const base = process.env['ELECTRON_RENDERER_URL']
  return base ? `${base}/${name}.html` : null
}

function loadRenderer(win: BrowserWindow, name: string): void {
  const url = rendererUrl(name)
  if (url) win.loadURL(url)
  else win.loadFile(join(__dirname, '../renderer', `${name}.html`))
}

export function createPetWindow(): BrowserWindow {
  if (petWin && !petWin.isDestroyed()) return petWin
  petWin = new BrowserWindow({
    width: PET_WINDOW.width,
    height: PET_WINDOW.height,
    x: 240,
    y: 240,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    fullscreenable: false,
    show: false,
    backgroundColor: '#00000000',
    title: 'Gugu Pet',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  petWin.setAlwaysOnTop(true, 'screen-saver')
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWin.setIgnoreMouseEvents(false)
  petWin.once('ready-to-show', () => petWin?.show())
  // 渲染进程 console 转发到主进程日志，便于排查
  petWin.webContents.on('console-message', (_e, _level, message, _line, sourceId) => {
    if (message.includes('error') || message.includes('Error') || _level >= 2) {
      console.error(`[pet-renderer] ${message} (${sourceId})`)
    }
  })
  loadRenderer(petWin, 'pet')

  petWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  // 桌宠窗口不可被关闭销毁，只能隐藏
  petWin.on('close', (e) => {
    if (!appQuitting) {
      e.preventDefault()
      petWin?.hide()
    }
  })
  return petWin
}

export function getPetWindow(): BrowserWindow | null {
  return petWin && !petWin.isDestroyed() ? petWin : null
}

export function createChatWindow(): BrowserWindow {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.show()
    chatWin.focus()
    return chatWin
  }
  chatWin = new BrowserWindow({
    width: 400,
    height: 640,
    minWidth: 340,
    minHeight: 480,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#00000000',
    title: '咕咕 · 聊天',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  loadRenderer(chatWin, 'chat')
  chatWin.once('ready-to-show', () => {
    chatWin?.show()
    chatWin?.focus()
  })
  return chatWin
}

export function focusPet(): void {
  const win = getPetWindow()
  if (win) {
    win.show()
    win.focus()
  }
}

export function createLoginWindow(): BrowserWindow {
  if (loginWin && !loginWin.isDestroyed()) {
    loginWin.show()
    loginWin.focus()
    return loginWin
  }
  loginWin = new BrowserWindow({
    width: 340,
    height: 480,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#00000000',
    title: '登录汽水音乐',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  loadRenderer(loginWin, 'login')
  loginWin.once('ready-to-show', () => {
    loginWin?.show()
    loginWin?.focus()
  })
  return loginWin
}

/**
 * 设置面板：挂在托盘图标下方的弹出层（Keepresso 式）。
 * 无边框 + popover 毛玻璃；失去焦点自动收起（由 tray.ts 控制显示/定位）。
 */
export function createSettingsPanel(): BrowserWindow {
  if (settingsPanel && !settingsPanel.isDestroyed()) return settingsPanel
  settingsPanel = new BrowserWindow({
    width: 360,
    height: 640,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    vibrancy: 'popover',
    visualEffectState: 'active',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: true,
    title: '咕咕 · 设置',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  settingsPanel.setAlwaysOnTop(true, 'pop-up-menu')
  settingsPanel.on('blur', () => {
    // DevTools 打开时不收起，方便调试
    if (settingsPanel && !settingsPanel.webContents.isDevToolsOpened()) settingsPanel.hide()
  })
  settingsPanel.on('close', (e) => {
    if (!appQuitting) {
      e.preventDefault()
      settingsPanel?.hide()
    }
  })
  loadRenderer(settingsPanel, 'settings')
  return settingsPanel
}

export function getSettingsPanel(): BrowserWindow | null {
  return settingsPanel && !settingsPanel.isDestroyed() ? settingsPanel : null
}

let appQuitting = false
export function setAppQuitting(): void {
  appQuitting = true
}
export function isAppQuitting(): boolean {
  return appQuitting
}
