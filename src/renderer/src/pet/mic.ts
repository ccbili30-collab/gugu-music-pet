// 伴唱引擎：右侧话筒圆球 → getUserMedia 录音（只在内存分析，不落盘）
// 宠物随歌声律动；夸夸池（LLM 批量生成/内置兜底）按音频事件触发弹出
import { bus, makeBubble } from './bus'

interface MicEvent {
  kind: 'loud' | 'sustain' | 'breath'
}

const FALLBACK_POOL = [
  '这句好听！', '哇耳朵怀孕了', '高音上去了！', '节奏感绝了', '继续继续~',
  '这句有感情', '稳得像 CD', '哇哦这转音！', ' chorus 起飞了！', '唱到心巴上了'
]

const FALLBACK_SUMMARY = '刚才那段超好听，再来亿遍也行！'

export class MicEngine {
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private data: Uint8Array<ArrayBuffer> | null = null
  private raf = 0
  private pool: string[] = []
  private startedAt = 0
  private lastFireAt = 0
  private singingSince = 0
  private lastBreathAt = 0
  private nextCooldown = 5000

  onChange: ((recording: boolean) => void) | null = null
  /** 0..1 麦克风电平（供宠物律动） */
  level = 0
  get recording(): boolean {
    return !!this.stream
  }

  async start(): Promise<{ ok: boolean; error?: string }> {
    if (this.stream) return { ok: true }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      })
    } catch {
      return { ok: false, error: 'mic-denied' }
    }
    this.ctx = new AudioContext()
    const src = this.ctx.createMediaStreamSource(this.stream)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 512
    src.connect(this.analyser)
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount))
    this.startedAt = performance.now()
    this.pool = []
    void this.loadPool()
    this.onChange?.(true)
    this.tick()
    return { ok: true }
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    void this.ctx?.close()
    this.ctx = null
    this.analyser = null
    this.onChange?.(false)
  }

  toggle(): void {
    if (this.recording) this.stop()
    else void this.start()
  }

  /** LLM 夸夸池（没配置大脑时用内置鼓励池） */
  private async loadPool(): Promise<void> {
    try {
      const r = await window.gugu.sing.pool()
      if (r?.length) this.pool = [...r]
    } catch {
      /* 用兜底 */
    }
    if (!this.pool.length) this.pool = [...FALLBACK_POOL]
  }

  private tick = (): void => {
    this.raf = requestAnimationFrame(this.tick)
    if (!this.analyser || !this.data) return
    this.analyser.getByteFrequencyData(this.data as Uint8Array<ArrayBuffer>)
    let sum = 0
    for (let i = 1; i < this.data.length; i++) sum += this.data[i]
    const level = sum / ((this.data.length - 1) * 255)
    // 平滑 + 抬升低值（人声一般 RMS 不高）
    this.level += (Math.min(1, level * 2.2) - this.level) * 0.25

    const now = performance.now()
    const singing = this.level > 0.16

    if (singing) {
      if (!this.singingSince) this.singingSince = now
      // 事件判定：突然很响 / 持续唱了 2.5s
      const dur = now - this.singingSince
      if (this.level > 0.55 && now - this.lastFireAt > 3500) this.fire({ kind: 'loud' })
      else if (dur > 2500 && now - this.lastFireAt > 7000) this.fire({ kind: 'sustain' })
      this.lastBreathAt = now
    } else if (this.singingSince) {
      // 换气/停顿：刚唱了 1.5s 以上，喘口气就夸一句
      if (now - this.singingSince > 1500 && now - this.lastBreathAt > 900 && now - this.lastFireAt > 4000) {
        this.fire({ kind: 'breath' })
      }
      this.singingSince = 0
    }
  }

  private fire(_ev: MicEvent): void {
    const now = performance.now()
    if (now - this.lastFireAt < this.nextCooldown) return
    this.lastFireAt = now
    this.nextCooldown = 5000 + Math.random() * 4000
    const text = this.pool.length ? this.pool.splice(Math.floor(Math.random() * this.pool.length), 1)[0] : undefined
    if (text) {
      bus.emit('bubble', makeBubble({ kind: 'comment', text, ttl: 4200 }))
    }
  }

  /** 结束时总结（LLM 或兜底） */
  async summary(): Promise<string> {
    const dur = Math.round((performance.now() - this.startedAt) / 1000)
    try {
      const r = await window.gugu.sing.summary(dur)
      if (r) return r
    } catch {
      /* 兜底 */
    }
    return FALLBACK_SUMMARY
  }
}
