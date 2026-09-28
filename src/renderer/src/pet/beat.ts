// 节拍检测：低频能量 flux + onset 判定 + BPM 估计（简单可用版，逐帧喂 AnalyserNode 数据）
export class BeatDetector {
  private prevBass = 0
  private fluxAvg = 0
  private lastOnsetAt = 0
  private onsetIntervals: number[] = []
  private phase = 0
  bpm = 0
  energy = 0
  private energySmooth = 0
  onBeat: ((strength: number) => void) | null = null

  private static readonly REFRACTORY = 0.14

  /** dt 秒；freqData 为 getByteFrequencyData 的 Uint8Array */
  update(dt: number, freqData: Uint8Array, nowSec: number): void {
    // 低频能量（约 40~250Hz）
    let bass = 0
    const bins = Math.min(8, freqData.length)
    for (let i = 1; i <= bins; i++) bass += freqData[i]
    bass /= bins * 255

    // 全频能量（平滑）
    let total = 0
    for (let i = 0; i < freqData.length; i++) total += freqData[i]
    total /= freqData.length * 255
    this.energySmooth += (total - this.energySmooth) * Math.min(1, dt * 6)
    this.energy = this.energySmooth

    // 低频能量 flux
    const flux = Math.max(0, bass - this.prevBass)
    this.prevBass = bass
    this.fluxAvg += (flux - this.fluxAvg) * Math.min(1, dt * 2.5)

    const sinceOnset = nowSec - this.lastOnsetAt
    const threshold = this.fluxAvg * 1.4 + 0.012
    if (flux > threshold && sinceOnset > BeatDetector.REFRACTORY && bass > 0.12) {
      const strength = Math.min(1, (flux - threshold) / (threshold * 2 + 0.05) + 0.35)
      if (this.lastOnsetAt > 0) {
        let interval = nowSec - this.lastOnsetAt
        // 折半/加倍归一到 60~180 BPM 区间
        while (interval < 60 / 180) interval *= 2
        while (interval > 60 / 60) interval /= 2
        this.onsetIntervals.push(interval)
        if (this.onsetIntervals.length > 10) this.onsetIntervals.shift()
        const sorted = [...this.onsetIntervals].sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length / 2)]
        this.bpm = Math.round(60 / median)
      }
      this.lastOnsetAt = nowSec
      this.onBeat?.(strength)
    }

    // 连续相位（无 BPM 时按 100bpm 兜底），onset 时软对齐
    const bps = (this.bpm || 100) / 60
    this.phase += dt * bps
    if (this.lastOnsetAt > 0 && nowSec - this.lastOnsetAt < 0.05) {
      this.phase = Math.round(this.phase)
    }
    this.phase %= 1
  }

  get beatPhase(): number {
    return this.phase
  }

  reset(): void {
    this.prevBass = 0
    this.onsetIntervals = []
    this.bpm = 0
    this.energy = 0
    this.energySmooth = 0
    this.phase = 0
  }
}
