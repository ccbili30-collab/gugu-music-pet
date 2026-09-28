import type { LoadedPack } from './pack'
import type { SlotName } from './types'

/**
 * 帧动画层：动作槽位状态机（idle/walk/fly/sit/sleep/peck/hum…）。
 * 缺失槽位沿 pack.fallbacks 兜底，最终落到 idle——任何残缺角色包都能跑。
 */
export class Animator {
  private slot: SlotName = 'idle'
  private elapsed = 0
  private frameIdx = 0
  currentFrame = ''

  constructor(private loaded: LoadedPack) {
    this.currentFrame = this.framesOf('idle')[0] ?? ''
  }

  private framesOf(slot: SlotName): string[] {
    const { pack } = this.loaded
    let s: string = slot
    const seen = new Set<string>()
    while (!pack.slots[s as SlotName] && pack.fallbacks[s] && !seen.has(s)) {
      seen.add(s)
      s = pack.fallbacks[s]
    }
    return pack.slots[s as SlotName]?.frames ?? pack.slots['idle']!.frames
  }

  get slotName(): SlotName {
    return this.slot
  }

  play(slot: SlotName, force = false): void {
    if (this.slot === slot && !force) return
    this.slot = slot
    this.elapsed = 0
    this.frameIdx = 0
    this.currentFrame = this.framesOf(slot)[0] ?? this.currentFrame
  }

  update(dt: number): void {
    const frames = this.framesOf(this.slot)
    if (frames.length < 2) return
    const slotDef = this.loaded.pack.slots[this.slot]
    const fps = slotDef?.fps ?? 2
    this.elapsed += dt
    const frameDur = 1 / Math.max(fps, 0.1)
    if (this.elapsed >= frameDur) {
      this.elapsed -= frameDur
      this.frameIdx = (this.frameIdx + 1) % frames.length
      this.currentFrame = frames[this.frameIdx]
    }
  }
}
