import { LAYOUT } from './types'

export interface UiRect {
  x: number
  y: number
  w: number
  h: number
}

interface RegionInputs {
  bubbleCount: number
  menu: { x: number; y: number; items: number } | null
  hasTrack: boolean
  hotOpen?: boolean
}

/** 计算当前需要接收鼠标的窗口区域（本地 CSS 坐标） */
export function computeRegions({ bubbleCount, menu, hasTrack, hotOpen }: RegionInputs): UiRect[] {
  const rects: UiRect[] = []
  // 宠物本体（精灵 96px + 少量余量）
  rects.push({ x: LAYOUT.anchorX - 60, y: LAYOUT.anchorY - 104, w: 120, h: 110 })
  // 话筒圆球（右下角脚边，36px）
  rects.push({ x: LAYOUT.anchorX + 52, y: LAYOUT.anchorY - 32, w: 40, h: 40 })
  if (hasTrack) {
    // 迷你播放器（宠物头顶）
    rects.push({ x: LAYOUT.anchorX - 112, y: LAYOUT.anchorY - 150, w: 244, h: 46 })
  }
  if (bubbleCount > 0) {
    // 右侧气泡带（贴头部右侧：容器底 y≈264，多行向上伸展）
    rects.push({ x: 296, y: 40, w: 252, h: 228 })
  }
  if (hotOpen) {
    // 左侧热评卡
    rects.push({ x: 0, y: LAYOUT.anchorY - 190, w: LAYOUT.anchorX - 66, h: 200 })
  }
  if (menu) {
    rects.push({ x: menu.x - 4, y: menu.y - 4, w: 188, h: menu.items * 37 + 16 })
  }
  return rects
}

let lastSign = ''
export function reportRegions(rects: UiRect[]): void {
  const sign = JSON.stringify(rects)
  if (sign === lastSign) return
  lastSign = sign
  window.gugu.reportRegions(rects)
}
