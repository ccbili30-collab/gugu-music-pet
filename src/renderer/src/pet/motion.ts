import type { PhysMode } from './types'

export interface MotionContext {
  mode: PhysMode
  vx: number
  vy: number
  walking: boolean
  sleeping: boolean
  /** 音乐播放中（安静段也保持慢摇微变形） */
  listening: boolean
}

export interface MotionOutput {
  scaleX: number
  scaleY: number
  rotation: number
  offsetY: number
}

/**
 * 变换律动层（与帧动画正交）：呼吸 / 落地/点击挤压 / 空中拉伸+侧倾 / 走路颠簸 / 睡眠慢呼吸。
 * 节拍舞蹈已移交 dance.ts（8 拍编舞）——本层不再做任何节拍运动。
 */
export class Motion {
  private t = 0
  // squash 弹簧（1 为中性，<1 被压扁）
  private squash = 1
  private squashV = 0
  private walkPhase = 0

  kickSquash(impulse: number): void {
    this.squashV -= impulse * 14
  }

  update(dt: number, ctx: MotionContext): MotionOutput {
    this.t += dt

    // squash 弹簧回归
    const k = 170
    const c = 15
    this.squashV += (-(this.squash - 1) * k - this.squashV * c) * dt
    this.squash += this.squashV * dt
    this.squash = Math.min(Math.max(this.squash, 0.45), 1.6)

    const airborne = ctx.mode === 'ballistic' || ctx.mode === 'flyto' || ctx.mode === 'drag'
    const speed = Math.hypot(ctx.vx, ctx.vy)

    let scaleX = 1
    let scaleY = 1
    let rotation = 0
    let offsetY = 0

    // 待机微压缩拉伸（呼吸）：纵缩横胀体积守恒，睡眠更慢更深
    if (!airborne && speed < 40) {
      const period = ctx.sleeping ? 5.2 : 3.2
      const amp = ctx.sleeping ? 0.035 : 0.032
      const br = Math.sin((this.t / period) * Math.PI * 2)
      scaleY *= 1 + amp * br
      scaleX *= 1 / (1 + amp * br) // 体积守恒：压扁时变宽、拉长时变窄
    }

    // 空中：沿速度方向的拉伸 + 侧倾
    if (airborne && speed > 240) {
      const stretch = 1 + Math.min(speed / 2400, 0.2)
      scaleY *= stretch
      scaleX /= Math.sqrt(stretch)
      rotation += Math.max(-1, Math.min(1, ctx.vx / 1500)) * 0.38
    }

    // 听歌摇摆：安静段也慢慢晃 + 微形变（编舞层在其上叠加节拍动作）
    if (ctx.listening && !airborne && !ctx.sleeping) {
      rotation += Math.sin(this.t * 1.4) * 0.05
      const w = Math.sin(this.t * 2.8)
      scaleX *= 1 + w * 0.014
      scaleY *= 1 - w * 0.012
    }

    // 走路小颠簸 + 轻微摇摆
    if (ctx.walking && !airborne) {
      this.walkPhase += dt * Math.PI * 2 * 1.7
      offsetY -= Math.abs(Math.sin(this.walkPhase)) * 2.5
      rotation += Math.sin(this.walkPhase * 0.5) * 0.03
    }

    // 落地/点击挤压（体积近似守恒）
    scaleY *= this.squash
    scaleX *= 1 + (1 - this.squash) * 0.55

    return { scaleX, scaleY, rotation, offsetY }
  }
}
