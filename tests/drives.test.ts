import { describe, it, expect } from 'vitest'
import { DriveSystem, DEFAULT_DRIVES, type Drives } from '../src/main/agent/drives'

function makeDrives(overrides: Partial<Drives> = {}): DriveSystem {
  const d = new DriveSystem()
  d.drives = { ...DEFAULT_DRIVES, ...overrides }
  return d
}

describe('DriveSystem 自然漂移', () => {
  it('默认值在 [0,1] 区间', () => {
    for (const v of Object.values(DEFAULT_DRIVES)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('idle 模式能量缓慢下降', () => {
    const d = makeDrives()
    const before = d.drives.energy
    d.tick(60) // 一分钟
    expect(d.drives.energy).toBeLessThan(before)
  })

  it('sleeping 模式能量恢复（不触顶时线性）', () => {
    const d = makeDrives({ energy: 0.1 })
    d.mode = 'sleeping'
    d.tick(30) // +0.6，未触顶
    expect(d.drives.energy).toBeCloseTo(0.7, 2)
    d.tick(60) // 继续睡到触顶
    expect(d.drives.energy).toBe(1)
  })

  it('漂移被夹在 [0,1]', () => {
    const d = makeDrives({ energy: 0.01, social: 0.99 })
    d.mode = 'dancing' // energy -0.01/s
    for (let i = 0; i < 600; i++) d.tick(1) // 10 分钟
    expect(d.drives.energy).toBeGreaterThanOrEqual(0)
    expect(d.drives.energy).toBeLessThanOrEqual(1)

    const s = makeDrives({ social: 0.99 })
    s.mode = 'sleeping' // social -0.002/s
    for (let i = 0; i < 600; i++) s.tick(1)
    expect(s.drives.social).toBeGreaterThanOrEqual(0)

    const c = makeDrives({ social: 0 })
    c.mode = 'chatting' // social +0.02/s
    for (let i = 0; i < 600; i++) c.tick(1)
    expect(c.drives.social).toBeLessThanOrEqual(1)
  })

  it('未知模式退化为 idle 漂移', () => {
    const d = makeDrives({ energy: 0.5 })
    const dIdle = makeDrives({ energy: 0.5 })
    ;(d as unknown as { mode: string }).mode = 'nonexistent'
    d.tick(60)
    dIdle.tick(60)
    expect(d.drives.energy).toBeCloseTo(dIdle.drives.energy, 6)
  })
})

describe('DriveSystem 事件冲击', () => {
  it('stroke 增加社交与安心', () => {
    const d = makeDrives({ social: 0.5, comfort: 0.5 })
    d.impact('stroke')
    expect(d.drives.social).toBeCloseTo(0.62, 5)
    expect(d.drives.comfort).toBeCloseTo(0.56, 5)
  })

  it('fling 降低安心但不会跌破 0', () => {
    const d = makeDrives({ comfort: 0.03 })
    d.impact('fling')
    expect(d.drives.comfort).toBe(0)
  })

  it('未知事件无副作用', () => {
    const d = makeDrives()
    const before = { ...d.drives }
    d.impact('no_such_event')
    expect(d.drives).toEqual(before)
  })

  it('冲击后上限不超过 1', () => {
    const d = makeDrives({ social: 0.95 })
    d.impact('chat_message') // +0.18
    expect(d.drives.social).toBe(1)
  })
})

describe('DriveSystem 主导需求', () => {
  it('能量过低 → rest', () => {
    const d = makeDrives({ energy: 0.15 })
    expect(d.dominant).toBe('rest')
  })

  it('社交不足 → social', () => {
    const d = makeDrives({ energy: 0.5, social: 0.2 })
    expect(d.dominant).toBe('social')
  })

  it('安心不足 → comfort', () => {
    const d = makeDrives({ energy: 0.5, social: 0.5, comfort: 0.25 })
    expect(d.dominant).toBe('comfort')
  })

  it('好奇心旺盛 → explore', () => {
    const d = makeDrives({ energy: 0.5, social: 0.5, comfort: 0.5, curiosity: 0.8 })
    expect(d.dominant).toBe('explore')
  })

  it('默认兜底 → social', () => {
    const d = makeDrives({ energy: 0.5, social: 0.5, comfort: 0.5, curiosity: 0.5 })
    expect(d.dominant).toBe('social')
  })
})

describe('DriveSystem describe 文案', () => {
  it('输出四维状态描述', () => {
    const d = makeDrives()
    const text = d.describe()
    expect(text).toContain('能量')
    expect(text).toContain('社交欲')
    expect(text).toContain('好奇心')
    expect(text).toContain('安心度')
    expect(text).toMatch(/[高中低]/)
  })
})
