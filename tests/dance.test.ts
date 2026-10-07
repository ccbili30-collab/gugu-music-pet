import { describe, it, expect } from 'vitest'
import { MOVES, pickNextMove } from '../src/renderer/src/pet/dance'

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9

describe('编舞动作曲线', () => {
  for (const move of MOVES) {
    it(`${move.name}: 起止归位（拍点 identity）`, () => {
      for (const p of [0, 1]) {
        const t = move.curve(p, 1)
        expect(close(t.rot, 0)).toBe(true)
        expect(close(t.scaleX, 1)).toBe(true)
        expect(close(t.scaleY, 1)).toBe(true)
        expect(close(t.offsetX, 0)).toBe(true)
        expect(close(t.offsetY, 0)).toBe(true)
      }
    })
    it(`${move.name}: 幅度有界（缩放≤16%/旋转≤0.16rad/位移≤70px）`, () => {
      for (let i = 0; i <= 200; i++) {
        const t = move.curve(i / 200, 1)
        expect(Math.abs(t.scaleX - 1)).toBeLessThanOrEqual(0.16)
        expect(Math.abs(t.scaleY - 1)).toBeLessThanOrEqual(0.16)
        expect(Math.abs(t.rot)).toBeLessThanOrEqual(0.16)
        expect(Math.abs(t.offsetX)).toBeLessThanOrEqual(70)
        expect(Math.abs(t.offsetY)).toBeLessThanOrEqual(8)
      }
    })
    it(`${move.name}: 动作中途连续（无瞬移，相邻相位差有界）`, () => {
      let prev = move.curve(0, 1)
      for (let i = 1; i <= 200; i++) {
        const t = move.curve(i / 200, 1)
        expect(Math.abs(t.scaleY - prev.scaleY)).toBeLessThan(0.05)
        expect(Math.abs(t.rot - prev.rot)).toBeLessThan(0.06)
        expect(Math.abs(t.offsetX - prev.offsetX)).toBeLessThan(10)
        prev = t
      }
    })
  }
})

describe('编舞器选动作', () => {
  it('不连续重复同一动作', () => {
    let cur: string | null = null
    for (let i = 0; i < 50; i++) {
      const next = pickNextMove(cur, 0.9, false)
      expect(next.name).not.toBe(cur)
      cur = next.name
    }
  })
  it('大招后强制回 groove', () => {
    expect(pickNextMove('pop', 0.9, true).name).toBe('groove')
  })
  it('低能量只解锁基础动作', () => {
    for (let i = 0; i < 30; i++) {
      const m = pickNextMove('groove', 0.1, false)
      expect(m.intensity).toBe(0)
    }
  })
  it('高能量可解锁大招', () => {
    const names = new Set<string>()
    for (let i = 0; i < 80; i++) names.add(pickNextMove(null, 1, false).name)
    expect(names.size).toBeGreaterThanOrEqual(5)
  })
})
