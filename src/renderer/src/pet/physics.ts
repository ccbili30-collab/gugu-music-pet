import type { PhysMode } from './types'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type PhysEvent =
  | { type: 'land'; impact: number }
  | { type: 'wall'; side: 'left' | 'right' | 'top'; impact: number }
  | { type: 'rest' }

interface FlyPath {
  p0: { x: number; y: number }
  p1: { x: number; y: number }
  p2: { x: number; y: number }
  p3: { x: number; y: number }
  t: number
  dur: number
}

/** 从旧 gugu 项目移植并换算为 DIP/秒 的物理参数 */
const G = 2000
const TERMINAL = 1500
const WALL_BOUNCE = 0.45
const GROUND_BOUNCE = 0.42
const AIR_DRAG = 0.3 // 指数空气阻力系数 /s
const FLING_MAX = 2100

export class Physics {
  x = 0
  y = 0
  vx = 0
  vy = 0
  mode: PhysMode = 'ground'
  workArea: Rect = { x: 0, y: 0, width: 1440, height: 900 }
  private fly: FlyPath | null = null

  get floorY(): number {
    return this.workArea.y + this.workArea.height - 10
  }

  get leftWall(): number {
    return this.workArea.x + 34
  }

  get rightWall(): number {
    return this.workArea.x + this.workArea.width - 34
  }

  get ceiling(): number {
    return this.workArea.y + 12
  }

  get airborne(): boolean {
    return this.mode === 'ballistic' || this.mode === 'flyto' || this.mode === 'drag'
  }

  /** 悬浮：无重力，可停在屏幕任意位置（全局可飞） */
  get hovering(): boolean {
    return this.mode === 'hover'
  }

  startHover(): void {
    this.mode = 'hover'
    this.vx = 0
    this.vy = 0
  }

  stopHover(): void {
    if (this.mode === 'hover') {
      this.mode = 'ballistic'
      this.vy = Math.max(this.vy, 0)
    }
  }

  setWorkArea(wa: Rect): void {
    this.workArea = wa
    // 显示器变化时把宠物夹回边界内
    this.x = Math.min(Math.max(this.x, this.leftWall), this.rightWall)
    if (!this.airborne) this.y = this.floorY
    this.y = Math.min(this.y, this.floorY)
  }

  startFling(vx: number, vy: number): void {
    const speed = Math.hypot(vx, vy)
    if (speed > FLING_MAX) {
      vx = (vx / speed) * FLING_MAX
      vy = (vy / speed) * FLING_MAX
    }
    this.vx = vx
    this.vy = Math.min(vy, 200)
    this.mode = 'ballistic'
  }

  startFlyTo(tx: number, ty: number): void {
    const p0 = { x: this.x, y: this.y }
    const p3 = { x: tx, y: ty }
    const dist = Math.hypot(tx - this.x, ty - this.y)
    const lift = 130 + Math.min(dist * 0.25, 220)
    const p1 = { x: p0.x + (p3.x - p0.x) * 0.25, y: p0.y - lift }
    const p2 = { x: p0.x + (p3.x - p0.x) * 0.75, y: p3.y - lift * 0.7 }
    this.fly = { p0, p1, p2, p3, t: 0, dur: Math.min(Math.max(dist / 300, 1.1), 3.6) }
    this.mode = 'flyto'
  }

  update(dt: number): PhysEvent[] {
    const events: PhysEvent[] = []
    if (this.mode === 'hover') {
      // 阻尼滑行（投掷后缓缓停住），边界内自由悬停
      this.vx *= Math.exp(-3 * dt)
      this.vy *= Math.exp(-3 * dt)
      this.x += this.vx * dt
      this.y += this.vy * dt
      this.x = Math.min(Math.max(this.x, this.leftWall), this.rightWall)
      this.y = Math.min(Math.max(this.y, this.ceiling + 30), this.floorY)
      return events
    }
    if (this.mode === 'flyto' && this.fly) {
      const f = this.fly
      const prev = { x: this.x, y: this.y }
      f.t = Math.min(f.t + dt / f.dur, 1)
      const u = 1 - f.t
      this.x = u * u * u * f.p0.x + 3 * u * u * f.t * f.p1.x + 3 * u * f.t * f.t * f.p2.x + f.t * f.t * f.t * f.p3.x
      this.y = u * u * u * f.p0.y + 3 * u * u * f.t * f.p1.y + 3 * u * f.t * f.t * f.p2.y + f.t * f.t * f.t * f.p3.y
      this.vx = (this.x - prev.x) / dt
      this.vy = (this.y - prev.y) / dt
      if (f.t >= 1) {
        this.fly = null
        this.mode = 'ballistic'
        this.vy = Math.max(this.vy, 0)
      }
      return events
    }

    if (this.mode === 'ballistic') {
      this.vy += G * dt
      const drag = Math.exp(-AIR_DRAG * dt)
      this.vx *= drag
      this.vy *= drag
      const v = Math.hypot(this.vx, this.vy)
      if (v > TERMINAL) {
        this.vx *= TERMINAL / v
        this.vy *= TERMINAL / v
      }
      this.x += this.vx * dt
      this.y += this.vy * dt

      if (this.x <= this.leftWall) {
        this.x = this.leftWall
        if (Math.abs(this.vx) > 260) events.push({ type: 'wall', side: 'left', impact: Math.abs(this.vx) })
        this.vx = Math.abs(this.vx) * WALL_BOUNCE
      } else if (this.x >= this.rightWall) {
        this.x = this.rightWall
        if (Math.abs(this.vx) > 260) events.push({ type: 'wall', side: 'right', impact: Math.abs(this.vx) })
        this.vx = -Math.abs(this.vx) * WALL_BOUNCE
      }
      if (this.y <= this.ceiling) {
        this.y = this.ceiling
        this.vy = Math.abs(this.vy) * 0.3
      }
      if (this.y >= this.floorY) {
        this.y = this.floorY
        if (this.vy > 340) {
          events.push({ type: 'land', impact: this.vy })
          this.vy = -this.vy * GROUND_BOUNCE
          this.vx *= 0.72
        } else {
          this.vy = 0
          this.mode = 'ground'
        }
      }
      return events
    }

    if (this.mode === 'ground') {
      this.y = this.floorY
      if (Math.abs(this.vx) > 1) {
        this.x += this.vx * dt
        this.vx *= Math.exp(-6 * dt)
        this.x = Math.min(Math.max(this.x, this.leftWall), this.rightWall)
        if (Math.abs(this.vx) < 50) {
          this.vx = 0
          events.push({ type: 'rest' })
        }
      }
    }
    // drag 模式由引擎直接驱动 x/y，不做积分
    return events
  }
}
