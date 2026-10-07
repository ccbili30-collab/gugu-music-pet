import { describe, it, expect } from 'vitest'
import { Physics, type Rect } from '../src/renderer/src/pet/physics'

const WA: Rect = { x: 0, y: 0, width: 1440, height: 900 }
const DT = 1 / 60

function makePhysics(): Physics {
  const p = new Physics()
  p.setWorkArea(WA)
  return p
}

/** 跑物理直到条件满足或超时，收集所有事件 */
function runUntil(p: Physics, cond: (p: Physics) => boolean, maxSec = 20): ReturnType<Physics['update']> {
  const events: ReturnType<Physics['update']> = []
  for (let t = 0; t < maxSec; t += DT) {
    events.push(...p.update(DT))
    if (cond(p)) break
  }
  return events
}

describe('Physics 地面模式', () => {
  it('初始在地面、无速度', () => {
    const p = makePhysics()
    p.y = p.floorY
    expect(p.mode).toBe('ground')
    expect(p.update(DT)).toEqual([])
  })

  it('地面滑行有摩擦，最终停下并发出 rest 事件', () => {
    const p = makePhysics()
    p.y = p.floorY
    p.vx = 600
    p.mode = 'ground'
    const events = runUntil(p, () => p.vx === 0, 10)
    expect(p.vx).toBe(0)
    expect(events.some((e) => e.type === 'rest')).toBe(true)
    // 停下后位置稳定在地面上
    expect(p.y).toBeCloseTo(p.floorY, 5)
  })

  it('滑行不会穿出左右墙', () => {
    const p = makePhysics()
    p.y = p.floorY
    p.vx = -5000
    p.mode = 'ground'
    runUntil(p, () => p.vx === 0, 10)
    expect(p.x).toBeGreaterThanOrEqual(p.leftWall)
    expect(p.x).toBeLessThanOrEqual(p.rightWall)
  })
})

describe('Physics 投掷（ballistic）', () => {
  it('startFling 进入弹道模式并限制最大初速', () => {
    const p = makePhysics()
    p.startFling(9000, -9000)
    expect(p.mode).toBe('ballistic')
    expect(Math.hypot(p.vx, p.vy)).toBeLessThanOrEqual(2100 + 1)
  })

  it('下落后落地：发出 land 事件、弹跳衰减、最终停在地面', () => {
    const p = makePhysics()
    p.x = 700
    p.y = 200
    p.startFling(120, -50)
    const events = runUntil(p, () => p.mode === 'ground', 30)
    const lands = events.filter((e) => e.type === 'land')
    expect(lands.length).toBeGreaterThanOrEqual(1)
    const impacts = lands.map((e) => (e as { impact: number }).impact)
    expect(Math.max(...impacts)).toBeGreaterThan(340)
    // 速度衰减：第二次落地冲击小于第一次
    if (impacts.length >= 2) expect(impacts[1]).toBeLessThan(impacts[0])
    expect(p.y).toBeCloseTo(p.floorY, 5)
    expect(p.mode).toBe('ground')
  })

  it('高速撞墙反弹并发出 wall 事件，速度按系数衰减', () => {
    const p = makePhysics()
    p.x = 200
    p.y = 760
    p.startFling(-1800, 0)
    const events = runUntil(p, () => p.vx > 0, 5)
    const walls = events.filter((e) => e.type === 'wall')
    expect(walls.length).toBeGreaterThanOrEqual(1)
    expect((walls[0] as { side: string }).side).toBe('left')
    expect(p.x).toBeCloseTo(p.leftWall, 5)
    expect(p.vx).toBeGreaterThan(0)
    // WALL_BOUNCE=0.45（含空气阻力，略小）
    expect(p.vx).toBeLessThan(1800 * 0.45 + 1)
  })

  it('低速撞墙不产生 wall 事件', () => {
    const p = makePhysics()
    p.x = 200
    p.y = 760
    p.startFling(-250, 0)
    const events = runUntil(p, () => p.mode === 'ground' && p.vx === 0, 30)
    expect(events.some((e) => e.type === 'wall')).toBe(false)
  })

  it('重力终速度不超过 TERMINAL=1500', () => {
    const p = makePhysics()
    p.x = 700
    p.y = 100
    p.startFling(0, 0)
    let maxV = 0
    for (let t = 0; t < 3; t += DT) {
      p.update(DT)
      maxV = Math.max(maxV, Math.hypot(p.vx, p.vy))
    }
    expect(maxV).toBeLessThanOrEqual(1500 + 1)
  })
})

describe('Physics 飞行（flyto）', () => {
  it('按贝塞尔曲线到达目标点附近，结束后转弹道', () => {
    const p = makePhysics()
    p.x = 200
    p.y = p.floorY
    p.startFlyTo(1200, 500)
    expect(p.mode).toBe('flyto')
    const events = runUntil(p, () => p.mode !== 'flyto', 10)
    expect(events).toEqual([]) // flyto 阶段不产生碰撞事件
    expect(Math.hypot(p.x - 1200, p.y - 500)).toBeLessThan(5)
    expect(p.mode).toBe('ballistic')
    expect(p.vy).toBeGreaterThanOrEqual(0)
  })

  it('飞行过程中间高度高于起终点（先抬升）', () => {
    const p = makePhysics()
    p.x = 200
    p.y = p.floorY
    p.startFlyTo(1200, 800)
    let minY = p.y
    for (let t = 0; t < 3; t += DT) {
      p.update(DT)
      if (p.mode === 'flyto') minY = Math.min(minY, p.y)
    }
    expect(minY).toBeLessThan(Math.min(p.floorY, 800) - 50)
  })
})

describe('Physics 工作区', () => {
  it('显示器变化时把宠物夹回边界内', () => {
    const p = makePhysics()
    p.x = 1400
    p.y = p.floorY
    p.setWorkArea({ x: 0, y: 0, width: 800, height: 600 })
    expect(p.x).toBeLessThanOrEqual(p.rightWall)
    expect(p.y).toBe(p.floorY)
  })
})
