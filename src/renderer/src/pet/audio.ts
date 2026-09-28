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
      if (this.track) this.onError?.('这首歌的音频流出问题了，换一首试试…')
    })
    window.gugu.onMusicCommand((cmd) => this.handleCommand(cmd))
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
      this.onError?.(
        r.error === 'vip'
          ? `《${track.name}》需要网易云 VIP 才能听完整的哦`
          : `《${track.name}》暂时放不了，咕咕帮你跳下一首…`
      )
      window.setTimeout(() => {
        if (this.index === i) this.next(true)
      }, 1200)
      return
    }
    this.track = track
    this.trial = r.trial
    this.el.src = r.url
    this.ensureGraph()
    try {
      await this.el.play()
    } catch (e) {
      console.error('play failed', e)
      this.onError?.('播放失败了…再点一次试试？')
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
    this.el.pause()
    this.el.removeAttribute('src')
  }
}
