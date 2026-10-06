export interface UiRect {
  x: number
  y: number
  w: number
  h: number
}

interface RegionInputs {
  /** 宠物脚底点的窗口本地坐标 */
  petX: number
  petY: number
  bubbleCount: number
  hasTrack: boolean
  hotOpen?: boolean
}

/** 计算当前需要接收鼠标的窗口区域（窗口本地坐标；全屏窗模式下随宠物移动） */
export function computeRegions({ petX, petY, bubbleCount, hasTrack, hotOpen }: RegionInputs): UiRect[] {
  const rects: UiRect[] = []
  // 宠物本体（精灵 96px + 余量）
  rects.push({ x: petX - 60, y: petY - 110, w: 120, h: 116 })
  if (hasTrack) {
    // 迷你播放器（宠物左上方，与右侧语言区物理隔离）
    rects.push({ x: petX - 258, y: petY - 138, w: 254, h: 46 })
  }
  // 聊天入口（脚边右侧）
  rects.push({ x: petX + 50, y: petY - 42, w: 44, h: 44 })
  if (bubbleCount > 0) {
    // 右侧气泡带
    rects.push({ x: petX + 44, y: petY - 170, w: 254, h: 176 })
  }
  if (hotOpen) {
    // 左侧热评卡
    rects.push({ x: petX - 262, y: petY - 210, w: 222, h: 222 })
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
