import type { Track, PlayerState, MusicCommandMsg } from '../../../preload/index'

/**
 * 音频引擎：渲染层唯一的 <audio> 元素拥有者。
 * 主进程负责取链（music:// 代理），这里负责播放/队列/上报。
 * Web Audio 图（AnalyserNode）随首次播放建立，M5 用它做节拍检测。
 */
export class AudioEngine {
  private el: HTMLAudioElement
  private queue: Track[] = []
  private index = -1
  private track: Track | null = null
  private trial = false
  private actx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private reportTimer = 0
  private lastErrorTrackId = ''
  private lastSkipToastAt = 0
  private offCommand: (() => void) | null = null

  /** 播放失败等需要气泡反馈的事件 */
  onError: ((msg: string) => void) | null = null
  onTrackChange: ((track: Track | null, trial: boolean) => void) | null = null

  constructor() {
    this.el = new Audio()
    this.el.crossOrigin = 'anonymous'
    this.el.preload = 'auto'
    this.el.addEventListener('ended', () => this.next(true))
    this.el.addEventListener('play', () => this.report())
    this.el.addEventListener('pause', () => this.report())
    this.el.addEventListener('error', () => {
      if (!this.track) return
      if (this.lastErrorTrackId === this.track.id) {
        this.onError?.('这首歌的音频流出问题了，换一首试试…')
        return
      }
      // 403/解码失败：静默跳下一首（每首歌只自动跳一次）
      this.lastErrorTrackId = this.track.id
      this.next(true)
    })
    this.offCommand = window.gugu.onMusicCommand((cmd) => this.handleCommand(cmd))
    this.reportTimer = window.setInterval(() => {
      if (!this.el.paused) this.report()
    }, 1000)
    void this.restore()
  }

  private async restore(): Promise<void> {
    try {
      const [queue, state] = await Promise.all([
        window.gugu.music.queueGet(),
        window.gugu.music.playerState()
      ])
      this.queue = queue
      this.el.volume = typeof state.volume === 'number' ? state.volume : 0.8
    } catch {
      /* 首次启动无存档 */
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser
  }

  /**
   * 静音但不影响节拍分析：analyser 保持接在源上（照常取频谱），
   * 只断开 → 扬声器的那一段。音频图未建立时退化为 el.muted。
   */
  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.analyser) {
      // 图已建：静音只由 analyser 连接控制；el.muted 必须为 false——
      // MediaElementSource 对 muted 元素输出的是静音，分析器（BPM/频谱）会全零
      this.el.muted = false
      try {
        this.analyser.disconnect()
        if (!muted) this.analyser.connect(this.actx?.destination as AudioNode)
      } catch {
        /* 忽略 */
      }
    } else {
      this.el.muted = muted
    }
  }

  get isMuted(): boolean {
    return this.muted
  }

  private muted = false

  private ensureGraph(): void {
    if (this.actx) {
      if (this.actx.state === 'suspended') void this.actx.resume()
      return
    }
    try {
      this.actx = new AudioContext()
      const src = this.actx.createMediaElementSource(this.el)
      this.analyser = this.actx.createAnalyser()
      this.analyser.fftSize = 1024
      this.analyser.smoothingTimeConstant = 0.5
      src.connect(this.analyser)
      this.analyser.connect(this.actx.destination)
      // 建图后静音一律走 analyser 断连；el.muted 复位（否则分析器拿静音）
      this.el.muted = false
      if (this.muted) {
        // 建图时已处于静音模式（自动化测试）
        try {
          this.analyser.disconnect()
        } catch {
          /* 忽略 */
        }
      }
    } catch (e) {
      console.error('audio graph init failed', e)
    }
  }

  get state(): PlayerState {
    return {
      track: this.track,
      playing: !this.el.paused && !!this.track,
      positionSec: this.el.currentTime,
      durationSec: Number.isFinite(this.el.duration) ? this.el.duration : (this.track?.durationMs ?? 0) / 1000,
      volume: this.el.volume,
      queueIndex: this.index,
      queueCount: this.queue.length,
      trial: this.trial
    }
  }

  private report(): void {
    window.gugu.music.report(this.state)
  }

  async playQueue(tracks: Track[], startIndex = 0): Promise<void> {
    if (!tracks.length) return
    this.queue = tracks
    this.index = startIndex - 1
    window.gugu.music.queueSet(tracks, startIndex)
    await this.next()
  }

  async playAt(i: number): Promise<void> {
    if (i < 0 || i >= this.queue.length) return
    const track = this.queue[i]
    this.index = i
    const r = await window.gugu.music.resolve(track.id)
    if (!r.url) {
      // 连续跳歌时不刷屏：8 秒内只提示一次
      if (Date.now() - this.lastSkipToastAt > 8000) {
        this.onError?.(`《${track.name}》暂时放不了，pet 帮你跳下一首…`)
        this.lastSkipToastAt = Date.now()
      }
      window.setTimeout(() => {
        if (this.index === i) this.next(true)
      }, 1000)
      return
    }
    this.track = track
    this.trial = r.trial
    this.el.src = r.url
    this.ensureGraph()
    try {
      await this.el.play()
    } catch (e) {
      // 常见为加载竞态（上一首的 load 中断了 play）——静默重试一次，
      // 仍失败交给 error 事件兜底跳下一首，不弹"失败"吓用户
      console.error('play failed, retrying once', e)
      await new Promise((r) => setTimeout(r, 300))
      try {
        await this.el.play()
      } catch {
        /* error 事件兜底 */
      }
    }
    this.onTrackChange?.(track, this.trial)
    this.report()
  }

  toggle(): void {
    if (!this.track) {
      void this.next()
      return
    }
    if (this.el.paused) {
      this.ensureGraph()
      void this.el.play()
    } else {
      this.el.pause()
    }
  }

  next(auto = false): void {
    if (!this.queue.length) return
    if (this.index + 1 >= this.queue.length) {
      if (auto) {
        // 播完整个队列就停下
        this.stop()
        return
      }
      this.index = -1
    }
    void this.playAt(this.index + 1)
  }

  prev(): void {
    if (!this.queue.length) return
    if (this.index <= 0) return
    void this.playAt(this.index - 1)
  }

  stop(): void {
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
    this.track = null
    this.trial = false
    this.report()
  }

  seek(sec: number): void {
    if (Number.isFinite(this.el.duration)) this.el.currentTime = Math.max(0, Math.min(sec, this.el.duration))
  }

  setVolume(v: number): void {
    this.el.volume = Math.max(0, Math.min(1, v))
    this.report()
  }

  get isPlaying(): boolean {
    return !this.el.paused && !!this.track
  }

  private handleCommand(cmd: MusicCommandMsg): void {
    switch (cmd.action) {
      case 'toggle':
        this.toggle()
        break
      case 'next':
        this.next()
        break
      case 'prev':
        this.prev()
        break
      case 'stop':
        this.stop()
        break
      case 'volume':
        if (typeof cmd.value === 'number') this.setVolume(cmd.value)
        break
      case 'seek':
        if (typeof cmd.value === 'number') this.seek(cmd.value)
        break
      case 'play':
        if (typeof cmd.value === 'number') void this.playAt(cmd.value)
        break
      case 'playQueue':
        if (cmd.tracks?.length) {
          this.queue = cmd.tracks
          this.index = (cmd.startIndex ?? 0) - 1
          void this.playAt(cmd.startIndex ?? 0)
        }
        break
    }
  }

  destroy(): void {
    window.clearInterval(this.reportTimer)
    this.offCommand?.()
    this.el.pause()
    this.el.removeAttribute('src')
  }
}
