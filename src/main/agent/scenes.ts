// 场景引擎：阴雨天/深夜 → 宠物自己躲角落听 EMO 歌单，哼歌气泡 + 纯共鸣（不评歌）；
// 用户点击 → 概率发出"一起听"邀请 → 接受后切回点评模式（换歌 40% AI 歌评）。
import { BrowserWindow } from 'electron'
import { fetchWeather, type WeatherNow } from '../weather'
import { musicService } from '../music/service'
import { loadConfig } from '../store'
import { llmReady, chatCompletion } from './llm'
import { songCommentPrompt, songResonancePrompt } from './prompt'

const RESONANCE_FALLBACK = ['呜呜呜', '要努力变强', '再听一遍', '…还好有歌', '雨声也对上了', '这首是我的角落搭子', '眼睛酸酸的', '明天的我会更厉害']
const HUM_PREFIX = ['♪~', '🎵', '~♪']

export type SceneMode = 'normal' | 'emo' | 'listening'

function sendToPet(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.getTitle() === 'Gugu Pet') win.webContents.send(channel, payload)
  }
}

class SceneEngine {
  mode: SceneMode = 'normal'
  private weather: WeatherNow | null = null
  private lastEmoDay = ''
  private emoStartedAt = 0
  private lastHumAt = 0
  private lastResonanceAt = 0
  private lastCommentAt = 0
  private lastCommentTrackId = ''
  private inviteCooldownUntil = 0
  private timer: NodeJS.Timeout | null = null
  private weatherTimer: NodeJS.Timeout | null = null
  private resonancePool: string[] = []

  boot(): void {
    void this.refreshWeather()
    this.weatherTimer = setInterval(() => void this.refreshWeather(), 30 * 60 * 1000)
    this.timer = setInterval(() => this.tick(), 15_000)
  }

  private async refreshWeather(): Promise<void> {
    this.weather = await fetchWeather()
    if (this.weather) {
      console.log(`[scene] weather ${this.weather.city} code=${this.weather.code} rain=${this.weather.raining} ${this.weather.tempC}°C`)
    }
  }

  private bubble(kind: 'hum' | 'resonance' | 'comment' | 'invite' | 'say', text?: string): void {
    sendToPet('pet:bubble', { kind, text })
  }

  /** 换歌钩子（music service 调用）：normal 模式 40% 概率 AI 歌评；emo 模式不评歌 */
  async onTrackChange(track: { id: string; name: string; artists: string }, userDriven: boolean): Promise<void> {
    if (this.mode === 'emo') return
    if (!userDriven && this.mode === 'normal') return
    const now = Date.now()
    if (track.id === this.lastCommentTrackId || now - this.lastCommentAt < 4 * 60 * 1000) return
    this.lastCommentTrackId = track.id
    if (Math.random() > 0.4) return
    this.lastCommentAt = now
    const cfg = loadConfig()
    let lyricHint = ''
    try {
      const lines = await musicService.api.lyric(track.id)
      lyricHint = lines.slice(2, 6).map((l) => l.text).join(' / ').slice(0, 80)
    } catch {
      /* 无歌词也能评 */
    }
    if (!llmReady(cfg.llm)) {
      this.bubble('comment', '这首歌好棒')
      return
    }
    const p = songCommentPrompt(track, lyricHint)
    const res = await chatCompletion(
      cfg.llm,
      [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user }
      ],
      undefined,
      { maxTokens: 60, temperature: 1.0 }
    )
    if (res.ok && res.content.trim()) this.bubble('comment', res.content.trim().slice(0, 24))
  }

  /** 宠物点击钩子：emo 模式下 60% 发听歌邀请 */
  onPetClick(): void {
    if (this.mode !== 'emo' || Date.now() < this.inviteCooldownUntil) return
    this.inviteCooldownUntil = Date.now() + 3 * 60 * 1000
    if (Math.random() < 0.6) {
      const lines = ['外面在下雨…要一起听会儿吗？', '这首太emo了，一个人听不完，陪我？', '角落有点冷，一起听吗？']
      this.bubble('invite', lines[Math.floor(Math.random() * lines.length)])
    }
  }

  /** 用户接受邀请 → 切回点评模式 */
  acceptInvite(): void {
    if (this.mode !== 'emo') return
    this.mode = 'listening'
    sendToPet('scene:state', { mode: 'listening' })
    sendToPet('pet:command', { action: 'sit' })
    this.bubble('say', '好耶…这首给你听 ♪')
    // listening 模式下继续放当前队列，换歌即触发点评
  }

  declineInvite(): void {
    this.inviteCooldownUntil = Date.now() + 10 * 60 * 1000
    this.bubble('resonance', '好吧…那我继续听')
  }

  exitToListening(): void {
    if (this.mode === 'emo') this.mode = 'listening'
  }

  /** 演示入口：无视触发条件立刻进 emo（右键菜单/测试用） */
  forceEmoForDemo(): void {
    if (this.mode === 'normal') {
      this.lastEmoDay = new Date().toDateString()
      void this.enterEmo('雨夜')
    }
  }

  private tick(): void {
    const now = new Date()
    const hour = now.getHours()
    const today = now.toDateString()

    if (this.mode === 'emo') {
      // emo 维护：哼歌 / 共鸣交替；25 分钟后自动收场去睡觉
      if (Date.now() - this.emoStartedAt > 25 * 60 * 1000) {
        this.mode = 'normal'
        sendToPet('scene:state', { mode: 'normal' })
        musicService.command('stop')
        sendToPet('pet:command', { action: 'sleep' })
        return
      }
      void this.emoAmbience()
      return
    }

    // 触发：雨天晚间 或 深夜 00:00–05:00，每日一次，且当前没放歌
    const lateNight = hour >= 0 && hour < 5
    const rainyEvening = !!this.weather?.raining && (hour >= 21 || hour <= 1)
    if ((lateNight || rainyEvening) && this.lastEmoDay !== today) {
      const player = musicService.api.currentState()
      if (!player.track) {
        this.lastEmoDay = today
        // 深夜只进角落哼歌（不自动开声放歌，避免惊扰休息的用户）；雨夜才播 EMO 歌单
        void this.enterEmo(lateNight ? '深夜' : '雨夜', !lateNight)
      }
    }
  }

  private async enterEmo(reason: string, autoplay = true): Promise<void> {
    this.mode = 'emo'
    this.emoStartedAt = Date.now()
    this.resonancePool = []
    sendToPet('scene:state', { mode: 'emo', reason })
    sendToPet('pet:command', { action: 'corner' })
    sendToPet('pet:command', { action: 'hum' })

    // EMO 歌单：搜伤感歌
    let queue: Awaited<ReturnType<typeof musicService.api.search>> = []
    const keywords = ['伤感', 'emo', '深夜']
    for (const k of keywords) {
      try {
        queue = await musicService.api.search(k, 12)
        if (queue.length >= 5) break
      } catch {
        /* 换下一个关键词 */
      }
    }
    if (!queue.length || !autoplay) {
      if (!autoplay) this.bubble('resonance', '（深夜模式：只哼歌，不开声…）')
      else this.bubble('resonance', '（耳机没电了…）')
      this.mode = 'normal'
      sendToPet('scene:state', { mode: 'normal' })
      return
    }
    musicService.playInRenderer(queue, 0)
    musicService.command('volume', 0.35)
    this.bubble('hum', `${reason}了…我自己听会儿 ♪`)
  }

  /** emo 中的哼歌（歌词片段）与纯共鸣交替 */
  private async emoAmbience(): Promise<void> {
    const now = Date.now()
    const since = now - Math.max(this.lastHumAt, this.lastResonanceAt)
    if (since < 30_000) return
    const player = musicService.api.currentState()
    const doHum = Math.random() < 0.55
    if (doHum) {
      this.lastHumAt = now
      let line = ''
      try {
        if (player.track) {
          const pos = player.positionSec
          const lines = await musicService.api.lyric(player.track.id)
          const near = lines.filter((l) => l.time <= pos + 1).slice(-1)[0]
          line = near?.text ?? ''
        }
      } catch {
        /* 无词就哼 */
      }
      const prefix = HUM_PREFIX[Math.floor(Math.random() * HUM_PREFIX.length)]
      this.bubble('hum', line ? `${prefix} ${line.slice(0, 14)} ${prefix}` : `${prefix} 嗯嗯嗯~ ${prefix}`)
    } else {
      this.lastResonanceAt = now
      let text = ''
      if (!this.resonancePool.length) {
        this.resonancePool = await this.genResonance(player.track)
      }
      text = this.resonancePool.pop() ?? RESONANCE_FALLBACK[Math.floor(Math.random() * RESONANCE_FALLBACK.length)]
      this.bubble('resonance', text)
    }
  }

  private async genResonance(track: { name: string; artists: string } | null): Promise<string[]> {
    const cfg = loadConfig()
    if (!llmReady(cfg.llm) || !track) return [...RESONANCE_FALLBACK].sort(() => Math.random() - 0.5)
    const p = songResonancePrompt(track)
    const out: string[] = []
    // 三次小调用凑 6 条（每次一条，便宜且多样）
    for (let i = 0; i < 6; i++) {
      const res = await chatCompletion(
        cfg.llm,
        [
          { role: 'system', content: p.system },
          { role: 'user', content: p.user }
        ],
        undefined,
        { maxTokens: 30, temperature: 1.1 }
      )
      if (res.ok) out.push(res.content.trim().slice(0, 10))
    }
    return out.filter((s) => s && !/歌|曲|建议/.test(s))
  }

  shutdown(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.weatherTimer) clearInterval(this.weatherTimer)
  }
}

export const sceneEngine = new SceneEngine()
