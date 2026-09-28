import type { Physics } from './physics'

export type IdleAction =
  | { kind: 'peck' }
  | { kind: 'stand' }
  | { kind: 'walk'; targetX: number }
  | { kind: 'fly'; targetX: number; targetY: number }
  | { kind: 'sit' }

/**
 * 安静版自主调度器（替代旧项目 1~2 秒随机乱动 + canned 台词的三重调度）。
 * 小动作（啄地/站立）20~45s 一次；大动作（走/飞）2~5 分钟一次。
 * M4 接入大脑驱动力后由 brain 决策，本层退化为兜底。
 */
export class IdleScheduler {
  private nextMinor = performance.now() + 18_000
  private nextMajor = performance.now() + 50_000
  private minorTmp: { kind: 'peck' } | { kind: 'stand' } | { kind: 'sit' } | null = null
  private minorTmpUntil = 0

  constructor(
    private readonly act: (a: IdleAction) => void,
    private readonly rand: () => number = Math.random
  ) {}

  private walkTarget(ph: Physics): number {
    const span = this.rand() * 300 + 140
    const dir = this.rand() < 0.5 ? -1 : 1
    const t = ph.x + dir * span
    return Math.min(Math.max(t, ph.leftWall + 20), ph.rightWall - 20)
  }

  private flyTarget(ph: Physics): { targetX: number; targetY: number } {
    return {
      targetX: ph.leftWall + this.rand() * (ph.rightWall - ph.leftWall),
      targetY: ph.ceiling + 120 + this.rand() * Math.max(ph.floorY - ph.ceiling - 260, 60)
    }
  }

  /** idle 期间由引擎每帧调用；busy（拖拽/飞行/走路/睡眠/emo）时传 false */
  tick(now: number, idle: boolean, ph: Physics): void {
    if (!idle) {
      this.nextMinor = now + 25_000
      this.nextMajor = now + 90_000
      return
    }
    if (this.minorTmp) {
      if (now >= this.minorTmpUntil) {
        this.act(this.minorTmp)
        this.minorTmp = null
      }
      return
    }
    if (now >= this.nextMajor) {
      this.nextMajor = now + (120 + this.rand() * 180) * 1000
      // 飞行三成概率，走路七成
      if (this.rand() < 0.3) this.act({ kind: 'fly', ...this.flyTarget(ph) })
      else this.act({ kind: 'walk', targetX: this.walkTarget(ph) })
      return
    }
    if (now >= this.nextMinor) {
      this.nextMinor = now + (20 + this.rand() * 25) * 1000
      const r = this.rand()
      // 小动作先维持几秒再执行（打断了 idle 循环也不突兀）
      if (r < 0.45) {
        this.minorTmp = { kind: 'peck' }
        this.minorTmpUntil = now + 2600
      } else if (r < 0.8) {
        this.minorTmp = { kind: 'stand' }
        this.minorTmpUntil = now + 4000
      } else {
        this.minorTmp = { kind: 'sit' }
        this.minorTmpUntil = now + 5000
      }
    }
  }
}
