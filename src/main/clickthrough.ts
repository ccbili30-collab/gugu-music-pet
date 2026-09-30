// macOS 透明窗点击穿透：主进程轮询光标位置，与渲染层上报的「交互区域」比对，
// 空白区域 setIgnoreMouseEvents(true) 让点击落到下层应用。
import { screen } from 'electron'
import { getPetWindow } from './windows'

export interface UiRect {
  x: number
  y: number
  w: number
  h: number
}

let rects: UiRect[] = []
let dragging = false
let ignoring = false
let started = false

export function startClickThrough(): void {
  if (started) return
  started = true
  setInterval(tick, 20)
}

export function setRegions(next: UiRect[]): void {
  rects = next
}

export function setDragging(d: boolean): void {
  dragging = d
  if (d) setIgnore(false)
}

function setIgnore(v: boolean): void {
  if (v === ignoring) return
  ignoring = v
  console.log('[clickthrough] ignoreMouseEvents =', v)
  getPetWindow()?.setIgnoreMouseEvents(v)
}

function tick(): void {
  const win = getPetWindow()
  if (!win || !win.isVisible() || win.isDestroyed()) return
  if (dragging) {
    setIgnore(false)
    return
  }
  const cursor = screen.getCursorScreenPoint()
  const [wx, wy] = win.getPosition()
  const lx = cursor.x - wx
  const ly = cursor.y - wy
  const hit = rects.some((r) => lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h)
  setIgnore(!hit)
}
