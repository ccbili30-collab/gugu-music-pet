import type { PhysMode } from './types'

export interface MotionContext {
  mode: PhysMode
  vx: number
  vy: number
  walking: boolean
  sleeping: boolean
  danceEnergy: number // 0..1，M5 节拍驱动
  beatPulse: number // 节拍瞬间的冲击包络 0..1（衰减）
  beatPhase: number // 连续相位，用于摇摆
}

export interface MotionOutput {
  scaleX: number
  scaleY: number
  rotation: number
  offsetY: number
}

/**
 * 变换律动层（v1 动效之二，与帧动画正交组合）：
 * 呼吸 / 落地挤压(squash&stretch) / 空中拉伸+侧倾 / 走路颠簸 / 节拍弹跳摇摆 / 睡眠慢呼吸。
 */
export class Motion {
  private t = 0
  // squash 弹簧（1 为中性，<1 被压扁）
  private squash = 1
  private squashV = 0
  // 节拍弹跳弹簧
  private bounce = 0
  private bounceV = 0
  private walkPhase = 0

  kickSquash(impulse: number): void {
    this.squashV -= impulse * 14
  }

  beatKick(strength: number): void {
    this.bounceV -= strength * 22
  }

  update(dt: number, ctx: MotionContext): MotionOutput {
    this.t += dt

    // squash 弹簧回归
    const k = 170
    const c = 15
    this.squashV += (-(this.squash - 1) * k - this.squashV * c) * dt
    this.squash += this.squashV * dt
    this.squash = Math.min(Math.max(this.squash, 0.45), 1.6)

    // 节拍弹跳弹簧
    const bk = 220
    const bc = 13
    this.bounceV += (-this.bounce * bk - this.bounceV * bc) * dt
    this.bounce += this.bounceV * dt

    const airborne = ctx.mode === 'ballistic' || ctx.mode === 'flyto' || ctx.mode === 'drag'
    const speed = Math.hypot(ctx.vx, ctx.vy)

    let scaleX = 1
    let scaleY = 1
    let rotation = 0
    let offsetY = 0

    // 呼吸（睡眠时更慢更深）
    if (!airborne && speed < 40) {
      const period = ctx.sleeping ? 5.2 : 3.4
      const amp = ctx.sleeping ? 0.03 : 0.02
      const br = Math.sin((this.t / period) * Math.PI * 2)
      scaleY *= 1 + amp * br
      scaleX *= 1 - amp * 0.7 * br
    }

    // 空中：沿速度方向的拉伸 + 侧倾
    if (airborne && speed > 240) {
      const stretch = 1 + Math.min(speed / 2400, 0.2)
      scaleY *= stretch
      scaleX /= Math.sqrt(stretch)
      rotation += Math.max(-1, Math.min(1, ctx.vx / 1500)) * 0.38
    }

    // 走路小颠簸 + 轻微摇摆
    if (ctx.walking && !airborne) {
      this.walkPhase += dt * Math.PI * 2 * 1.7
      offsetY -= Math.abs(Math.sin(this.walkPhase)) * 2.5
      rotation += Math.sin(this.walkPhase * 0.5) * 0.03
    }

    // 节拍律动（舞蹈/伴唱，M5 驱动；能量为 0 时无效果）
    if (ctx.danceEnergy > 0.01 && !airborne) {
      const e = ctx.danceEnergy
      rotation += Math.sin(ctx.beatPhase) * 0.14 * e
      scaleX *= 1 + Math.abs(Math.sin(ctx.beatPhase)) * 0.06 * e
      offsetY -= this.bounce * e
    }

    // 落地/点击挤压（体积近似守恒）
    scaleY *= this.squash
    scaleX *= 1 + (1 - this.squash) * 0.55

    return { scaleX, scaleY, rotation, offsetY }
  }
}
