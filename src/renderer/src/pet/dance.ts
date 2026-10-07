// 8 拍编舞系统：动作是节拍相位的确定性曲线，随机只发生在选动作；
// 频谱降级为一次性高音 Pop 点缀（最多每 2 拍一次），不做连续形变。

export interface DanceTransform {
  rot: number
  scaleX: number
  scaleY: number
  offsetX: number
  offsetY: number
}

const ID = (): DanceTransform => ({ rot: 0, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 })

/** 第 i 拍内的相位 frac（0..1）与方向交替 dir（±1） */
function beatSub(phase: number, beats: number): { frac: number; sub: number; dir: number } {
  const f = Math.min(phase, 1) * beats
  const sub = Math.floor(f)
  const frac = f - sub
  return { frac, sub, dir: sub % 2 === 0 ? 1 : -1 }
}

const sinp = (f: number): number => Math.sin(Math.PI * f)

export interface MoveDef {
  name: string
  beats: number
  /** 大肥鱼包的帧名（其他包没有则回退普通 dance 槽循环） */
  frame: string
  /** 解锁所需最低舞能（0=随时，0.5=中，0.8=高能） */
  intensity: number
  /** 大招：跳完强制回 groove 喘口气 */
  accent: boolean
  weight: number
  curve: (phase: number, e: number) => DanceTransform
}

export const MOVES: MoveDef[] = [
  {
    name: 'groove',
    beats: 2,
    frame: 'idle_happy_ok',
    intensity: 0,
    accent: false,
    weight: 3,
    curve(p, e) {
      const t = ID()
      const { frac } = beatSub(p, 2)
      const d = sinp(frac)
      t.scaleY *= 1 - 0.06 * e * d
      t.scaleX *= 1 + 0.025 * e * d
      t.offsetY -= 2.5 * e * d
      return t
    }
  },
  {
    name: 'sway',
    beats: 4,
    frame: 'idle_see_zhenjing',
    intensity: 0,
    accent: false,
    weight: 2,
    curve(p, e) {
      const t = ID()
      const { frac, dir } = beatSub(p, 4)
      const d = sinp(frac)
      t.rot += dir * 0.1 * e * d
      t.offsetX += dir * 4 * e * d
      t.scaleY *= 1 - 0.02 * e * d
      return t
    }
  },
  {
    name: 'bob',
    beats: 2,
    frame: 'walk_right_daily_ganfan',
    intensity: 0,
    accent: false,
    weight: 2,
    curve(p, e) {
      const t = ID()
      const { frac } = beatSub(p, 2)
      const d = Math.pow(sinp(frac), 0.8)
      t.scaleY *= 1 - 0.05 * e * d
      t.offsetY -= 2 * e * d
      return t
    }
  },
  {
    name: 'twist',
    beats: 4,
    frame: 'dance_happy_deyi',
    intensity: 0.5,
    accent: false,
    weight: 2,
    curve(p, e) {
      const t = ID()
      const { frac, dir } = beatSub(p, 4)
      const d = sinp(frac)
      t.scaleX *= 1 + 0.06 * e * dir * d
      t.rot += dir * 0.05 * e * d
      t.scaleY *= 1 - 0.015 * e * d
      return t
    }
  },
  {
    name: 'pop',
    beats: 4,
    frame: 'dance_like_bixin',
    intensity: 0.8,
    accent: true,
    weight: 1.5,
    curve(p, e) {
      const t = ID()
      const { frac, sub } = beatSub(p, 4)
      if (sub < 3) {
        const d = sinp(frac) * 0.02 * e
        t.scaleY *= 1 - d
      } else {
        // 第 4 拍猛弹（快起慢落）
        const q = Math.pow(frac, 0.65)
        const amp = 0.12 * e * sinp(q)
        t.scaleY *= 1 + amp
        t.scaleX *= 1 - amp * 0.6
        t.offsetY -= 3 * e * sinp(q)
      }
      return t
    }
  },
  {
    name: 'slide',
    beats: 8,
    frame: 'fly_right_happy_piaole',
    intensity: 0.8,
    accent: true,
    weight: 1,
    curve(p, e) {
      const t = ID()
      // 8 拍滑出一个身位再滑回（正弦全程平滑）
      t.offsetX += 60 * e * Math.sin(Math.PI * Math.min(p, 1))
      const { frac } = beatSub(p, 8)
      const d = sinp(frac)
      t.scaleY *= 1 - 0.03 * e * d
      return t
    }
  }
]

const GROOVE = MOVES[0]

/** 选下一个动作：能量门槛 + 不连续重复 + 大招后回 groove，加权随机 */
export function pickNextMove(
  currentName: string | null,
  energy: number,
  afterAccent: boolean,
  rand: () => number = Math.random
): MoveDef {
  if (afterAccent) return GROOVE
  const gate = Math.max(0.25, energy)
  let pool = MOVES.filter((m) => m.intensity <= gate && m.name !== currentName)
  if (!pool.length) pool = MOVES.filter((m) => m.intensity <= gate)
  if (!pool.length) return GROOVE
  const total = pool.reduce((s, m) => s + m.weight, 0)
  let r = rand() * total
  for (const m of pool) {
    r -= m.weight
    if (r <= 0) return m
  }
  return pool[pool.length - 1]
}

/** 编舞器：节拍时钟驱动，输出变换目标 + 动作边界换帧 */
export class DanceDirector {
  private move: MoveDef = GROOVE
  private beatInMove = 0
  private afterAccent = false
  private accent = 0
  private accentCooldownBeats = 0
  private prevTreble = 0
  private energy = 0
  /** 当前动作锁定的帧名（包里没有此帧则引擎忽略、走普通 dance 槽） */
  pinnedFrame: string | null = null

  onBeat(strength: number): void {
    void strength
    this.beatInMove++
    if (this.accentCooldownBeats > 0) this.accentCooldownBeats--
    if (this.beatInMove >= this.move.beats) {
      const next = pickNextMove(this.move.name, this.energy, this.afterAccent)
      this.move = next
      this.beatInMove = 0
      this.afterAccent = next.accent
      this.pinnedFrame = next.frame
    }
  }

  /** dt 秒；beatPhase 0..1（节拍内相位）；energy 舞能 0..1；treble 平滑高音能量 */
  update(dt: number, beatPhase: number, energy: number, treble: number): DanceTransform {
    this.energy = energy
    const e = Math.min(1, Math.max(0.2, energy))
    const p = (this.beatInMove + beatPhase) / this.move.beats
    const base = this.move.curve(p, e)

    // 高音 onset → 一次性 Pop 点缀（每 2 拍最多一次）
    if (treble - this.prevTreble > 0.12 && treble > 0.25 && this.accentCooldownBeats === 0) {
      this.accent = 1
      this.accentCooldownBeats = 2
    }
    this.prevTreble = treble
    this.accent = Math.max(0, this.accent - dt * 6)

    if (this.accent > 0) {
      const a = this.accent * this.accent * 0.1 * e
      base.scaleY *= 1 + a
      base.scaleX *= 1 - a * 0.6
    }
    return base
  }
}
