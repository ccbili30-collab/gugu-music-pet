import type { LoadedPack } from './pack'
import type { PackSlot, SlotName } from './types'

interface ResolvedSlot {
  frames: string[]
  fps: number
  flipped: boolean
}

/**
 * 帧动画层：动作槽位状态机（idle/walk/fly/sit/sleep/peck/hum…）。
 * 缺失槽位沿 pack.fallbacks 兜底，最终落到 idle——任何残缺角色包都能跑。
 * 支持 mirrorOf 镜像槽位（左向动作复用右向帧）。
 */
export class Animator {
  private slot: SlotName = 'idle'
  private elapsed = 0
  private frameIdx = 0
  private flipped = false
  currentFrame = ''

  constructor(private loaded: LoadedPack) {
    this.currentFrame = this.resolve('idle').frames[0] ?? ''
  }

  /** 解析槽位：兜底链 + 镜像，最终保证有帧 */
  private resolve(slot: SlotName): ResolvedSlot {
    const { pack } = this.loaded
    let s: string = slot
    let flipped = false
    const seen = new Set<string>()
    while (!pack.slots[s as SlotName] && pack.fallbacks[s] && !seen.has(s)) {
      seen.add(s)
      s = pack.fallbacks[s]
    }
    let def: PackSlot | undefined = pack.slots[s as SlotName]
    if (!def) {
      def = pack.slots['idle']
      s = 'idle'
    }
    if (def?.mirrorOf) {
      const target = pack.slots[def.mirrorOf as SlotName] ?? pack.slots['idle']
      def = target
      flipped = true
    }
    const frames = def?.frames ?? pack.slots['idle']!.frames!
    return { frames, fps: def?.fps ?? 2, flipped }
  }

  get slotName(): SlotName {
    return this.slot
  }

  get isFlipped(): boolean {
    return this.flipped
  }

  play(slot: SlotName, force = false): void {
    if (this.slot === slot && !force) return
    this.slot = slot
    this.elapsed = 0
    this.frameIdx = 0
    const r = this.resolve(slot)
    this.flipped = r.flipped
    this.currentFrame = r.frames[0] ?? this.currentFrame
  }

  update(dt: number): void {
    const r = this.resolve(this.slot)
    this.flipped = r.flipped
    if (r.frames.length < 2) return
    this.elapsed += dt
    const frameDur = 1 / Math.max(r.fps, 0.1)
    if (this.elapsed >= frameDur) {
      this.elapsed -= frameDur
      this.frameIdx = (this.frameIdx + 1) % r.frames.length
      this.currentFrame = r.frames[this.frameIdx]
    }
  }
}
