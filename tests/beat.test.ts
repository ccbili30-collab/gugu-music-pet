import { describe, it, expect } from 'vitest'
import { BeatDetector } from '../src/renderer/src/pet/beat'

const DT = 1 / 60
const BINS = 64

/** 合成频谱：低频 bin 1..8 是低频能量区，其余给个稳定底噪 */
function synthFrame(bassLevel: number): Uint8Array {
  const d = new Uint8Array(BINS)
  for (let i = 0; i < BINS; i++) d[i] = 60 // 底噪
  for (let i = 1; i <= 8; i++) d[i] = Math.round(bassLevel * 255)
  return d
}

/**
 * 模拟一段固定 BPM 的音乐：
 * 每个 beat 周期开始的前 3 帧低频能量冲高（鼓点），其余帧回到基线。
 */
function feedBpm(bpm: number, seconds: number): { det: BeatDetector; beats: number[] } {
  const det = new BeatDetector()
  const beats: number[] = []
  det.onBeat = () => beats.push(0)
  const period = 60 / bpm
  let now = 0
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const phase = (now % period) / period
    const onBeatFrame = phase < 3 * DT / period
    det.update(DT, synthFrame(onBeatFrame ? 0.95 : 0.35), now)
    now += DT
  }
  return { det, beats }
}

describe('BeatDetector 节拍检测', () => {
  it('静音/平直频谱不触发 onset，BPM 保持 0', () => {
    const det = new BeatDetector()
    let beatCount = 0
    det.onBeat = () => beatCount++
    const flat = synthFrame(0.35)
    for (let now = 0; now < 10; now += DT) det.update(DT, flat, now)
    expect(beatCount).toBe(0)
    expect(det.bpm).toBe(0)
  })

  it('全零频谱安全运行', () => {
    const det = new BeatDetector()
    expect(() => {
      for (let now = 0; now < 2; now += DT) det.update(DT, new Uint8Array(BINS), now)
    }).not.toThrow()
  })

  it('120 BPM 合成鼓点：检出 onBeat 且 BPM 估计落在 ±10% 内', () => {
    const { det, beats } = feedBpm(120, 10)
    expect(beats.length).toBeGreaterThanOrEqual(8)
    expect(det.bpm).toBeGreaterThanOrEqual(108)
    expect(det.bpm).toBeLessThanOrEqual(132)
  })

  it('90 BPM 与 140 BPM 能区分', () => {
    const slow = feedBpm(90, 12).det
    const fast = feedBpm(140, 12).det
    expect(slow.bpm).toBeGreaterThan(0)
    expect(fast.bpm).toBeGreaterThan(0)
    expect(slow.bpm).toBeLessThan(fast.bpm)
    expect(slow.bpm).toBeLessThanOrEqual(99) // 归一化区间 60~180 内不折半
    expect(fast.bpm).toBeGreaterThanOrEqual(126)
  })

  it('能量随音量整体升高', () => {
    const quiet = new BeatDetector()
    const loud = new BeatDetector()
    const q = synthFrame(0.2)
    const l = synthFrame(0.9)
    for (let i = 0; i < 60; i++) {
      quiet.update(DT, q, i * DT)
      loud.update(DT, l, i * DT)
    }
    expect(loud.energy).toBeGreaterThan(quiet.energy)
    expect(quiet.energy).toBeGreaterThanOrEqual(0)
    expect(quiet.energy).toBeLessThanOrEqual(1)
  })

  it('beatPhase 始终在 [0,1)', () => {
    const det = new BeatDetector()
    for (let now = 0; now < 10; now += DT) det.update(DT, synthFrame(0.35), now)
    expect(det.beatPhase).toBeGreaterThanOrEqual(0)
    expect(det.beatPhase).toBeLessThan(1)
  })

  it('reset 清空状态', () => {
    const { det } = feedBpm(120, 8)
    expect(det.bpm).toBeGreaterThan(0)
    det.reset()
    expect(det.bpm).toBe(0)
    expect(det.energy).toBe(0)
    expect(det.beatPhase).toBe(0)
  })
})
