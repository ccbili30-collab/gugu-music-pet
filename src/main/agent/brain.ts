// 大脑：会话编排（tool-calling 循环）+ 记忆 + 驱动力 + 安静自主性 + 反射层
import { BrowserWindow } from 'electron'
import { chatCompletion, llmReady, type LlmMessage } from './llm'
import { systemPrompt, memoryExtractPrompt, autonomyPrompt, singPoolPrompt, singSummaryPrompt } from './prompt'
import { toolDefinitions, dispatchTool, type ToolContext } from './tools'
import { formatContext, readIndex, storeMemory } from './memory'
import { DriveSystem } from './drives'
import { loadConfig, saveHistory, loadHistory, type AppConfig, type ChatMsg } from '../store'
import { musicService } from '../music/service'
import type { Track } from '../music/provider'

const KAOMOJI_RE = /♪kaomoji♪\s*([（(][^）)]{1,20}[）)])/i

export interface PetBubbleMsg {
  kind: 'say' | 'hum' | 'comment' | 'resonance' | 'invite'
  text?: string
  kaomoji?: string
}

function sendToChat(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.getTitle().includes('聊天')) win.webContents.send(channel, payload)
  }
}

function sendToPet(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.getTitle() === 'Gugu Pet') win.webContents.send(channel, payload)
  }
}

export class Brain {
  private ctx: LlmMessage[] = []
  private history: ChatMsg[] = []
  drives = new DriveSystem()
  private activityUntil = 0
  private lastAutonomyAt = Date.now()
  private nextAutonomyDelay = 120_000
  private timer: NodeJS.Timeout | null = null
  private busy = false

  boot(): void {
    this.history = loadHistory()
    // 会话上下文从可见历史重建（最近 12 条）
    for (const m of this.history.slice(-12)) {
      if (m.role === 'user') this.ctx.push({ role: 'user', content: m.content })
      else if (m.role === 'assistant' && m.content) this.ctx.push({ role: 'assistant', content: m.content })
    }
    this.timer = setInterval(() => this.tickLoops(), 1000)
  }

  shutdown(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private tickLoops(): void {
    const active = Date.now() < this.activityUntil
    this.drives.mode = active
      ? 'chatting'
      : musicService.api.currentState().playing
        ? 'dancing'
        : 'idle'
    this.drives.tick(1)
    // 能量过低 → 催宠物睡觉
    if (this.drives.drives.energy < 0.12) {
      sendToPet('pet:command', { action: 'sleep' })
      this.drives.mode = 'sleeping'
    }
    if (this.drives.mode === 'sleeping' && this.drives.drives.energy > 0.6) {
      sendToPet('pet:command', { action: 'wake' })
      this.drives.mode = 'idle'
    }
    // 安静自主性：冷却到期 + 空闲 + LLM 可用
    if (
      llmReady(loadConfig().llm) &&
      !this.busy &&
      !active &&
      this.drives.mode !== 'sleeping' &&
      Date.now() - this.lastAutonomyAt > this.nextAutonomyDelay
    ) {
      this.lastAutonomyAt = Date.now()
      this.nextAutonomyDelay = 120_000 + Math.random() * 180_000
      void this.autonomyOnce()
    }
  }

  petEvent(name: string): void {
    this.drives.impact(name)
    this.activityUntil = Date.now() + 30_000
    // 反射层：只给颜文字，不说台词
    if (name === 'stroke') {
      const pool = ['(´,,•ω•,,)♡', '(๑>◡<๑)', '(っ´▽`)っ', '♡(˃͈ દ ˂͈ ༶ )']
      sendToPet('pet:bubble', { kind: 'say', kaomoji: pool[Math.floor(Math.random() * pool.length)] } as PetBubbleMsg)
    }
  }

  private toolContext(): ToolContext {
    return {
      music: musicService,
      petAction: (action, params) => sendToPet('pet:command', { action, ...params }),
      onSongsCard: (tracks: Track[]) => sendToChat('chat:card', { type: 'songs', tracks })
    }
  }

  async chat(userText: string): Promise<void> {
    const cfg: AppConfig = loadConfig()
    if (!llmReady(cfg.llm)) {
      sendToChat('chat:reply', { ok: false, content: '咕咕的大脑还没接上：右上角设置里填 LLM API（推荐 DeepSeek 或智谱 GLM）', kaomoji: '(⊙_⊙)' })
      return
    }
    if (this.busy) {
      sendToChat('chat:reply', { ok: false, content: '上一句还没想完…', kaomoji: '(；′⌒`)' })
      return
    }
    this.busy = true
    this.drives.impact('chat_message')
    this.activityUntil = Date.now() + 120_000
    try {
      this.ctx.push({ role: 'user', content: userText })
      const tools = toolDefinitions()
      const tctx = this.toolContext()

      for (let round = 0; round < 4; round++) {
        const sys = systemPrompt({
          personaName: cfg.personaName,
          player: musicService.api.currentState(),
          login: musicService.loginStateValue,
          memoryContext: formatContext(userText),
          now: new Date()
        })
        const res = await chatCompletion(cfg.llm, [{ role: 'system', content: sys }, ...this.ctx], tools)
        if (!res.ok) {
          sendToChat('chat:reply', { ok: false, content: `大脑转不动了：${res.error}`, kaomoji: '(⊙_⊙)' })
          this.ctx.pop()
          return
        }
        if (res.toolCalls.length) {
          this.ctx.push({
            role: 'assistant',
            content: res.content || null,
            tool_calls: res.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.args } }))
          })
          for (const call of res.toolCalls) {
            let args: Record<string, unknown> = {}
            try {
              args = JSON.parse(call.args || '{}') as Record<string, unknown>
            } catch {
              /* 空/坏参数按空对象 */
            }
            const r = await dispatchTool(call.name, args, tctx)
            this.ctx.push({ role: 'tool', content: r.output.slice(0, 1500), tool_call_id: call.id })
          }
          continue
        }
        // 最终回复
        const finalText = res.content.trim()
        const km = KAOMOJI_RE.exec(finalText)
        const kaomoji = km?.[1] ?? '(๑˃̵ᴗ˂̵)و'
        const clean = finalText.replace(KAOMOJI_RE, '').trim()
        this.ctx.push({ role: 'assistant', content: finalText })
        this.history.push({ role: 'user', content: userText, ts: Date.now() })
        this.history.push({ role: 'assistant', content: clean, ts: Date.now() })
        saveHistory(this.history)
        if (this.ctx.length > 40) this.ctx = this.ctx.slice(-30)
        sendToChat('chat:reply', { ok: true, content: clean, kaomoji })
        // 气泡（右侧）：回复太长就截第一句
        const short = clean.split(/[。！？!?\n]/)[0]?.slice(0, 26) || clean.slice(0, 26)
        sendToPet('pet:bubble', { kind: 'say', text: short, kaomoji } as PetBubbleMsg)
        void this.memoryExtract(userText, clean, cfg)
        return
      }
      sendToChat('chat:reply', { ok: false, content: '咕咕绕了四圈没想明白，换个说法试试？', kaomoji: '(⊙_⊙)' })
    } finally {
      this.busy = false
    }
  }

  /** 记忆提取（写路径，独立小调用，失败静默） */
  private async memoryExtract(user: string, assistant: string, cfg: AppConfig): Promise<void> {
    try {
      const p = memoryExtractPrompt({ user, assistant }, readIndex().slice(0, 1500))
      const res = await chatCompletion(
        cfg.llm,
        [
          { role: 'system', content: p.system },
          { role: 'user', content: p.user }
        ],
        undefined,
        { maxTokens: 120, temperature: 0.2 }
      )
      if (!res.ok) return
      const m = /\{[\s\S]*\}/.exec(res.content)
      if (!m) return
      const parsed = JSON.parse(m[0]) as { store?: boolean; type?: string; title?: string; summary?: string }
      if (parsed.store && parsed.summary) {
        storeMemory({ type: parsed.type ?? 'episodes', title: parsed.title ?? '', summary: parsed.summary })
      }
    } catch {
      /* 记忆失败不影响聊天 */
    }
  }

  private async autonomyOnce(): Promise<void> {
    const cfg = loadConfig()
    const player = musicService.api.currentState()
    const p = autonomyPrompt({
      personaName: cfg.personaName,
      drivesLine: this.drives.describe(),
      player,
      mood: this.drives.dominant
    })
    const res = await chatCompletion(
      cfg.llm,
      [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user }
      ],
      undefined,
      { maxTokens: 120, temperature: 0.9 }
    )
    if (!res.ok) return
    const m = /\{[\s\S]*\}/.exec(res.content)
    if (!m) return
    try {
      const parsed = JSON.parse(m[0]) as { intent?: string; bubble?: string; kaomoji?: string }
      const intent = parsed.intent ?? 'none'
      if (intent !== 'none') sendToPet('pet:command', { action: intent })
      if (parsed.bubble || parsed.kaomoji) {
        sendToPet('pet:bubble', { kind: intent === 'hum' ? 'hum' : 'say', text: parsed.bubble || undefined, kaomoji: parsed.kaomoji || undefined } as PetBubbleMsg)
      }
    } catch {
      /* JSON 解析失败就算了 */
    }
  }

  get chatHistory(): ChatMsg[] {
    return this.history
  }

  /** 伴唱：夸夸池（LLM 批量生成，失败返回空数组走渲染层兜底） */
  async singPool(): Promise<string[]> {
    const cfg = loadConfig()
    if (!llmReady(cfg.llm)) return []
    const track = musicService.api.currentState().track
    const p = singPoolPrompt(track ? `《${track.name}》- ${track.artists}` : '')
    const res = await chatCompletion(
      cfg.llm,
      [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user }
      ],
      undefined,
      { maxTokens: 300, temperature: 1.0 }
    )
    if (!res.ok) return []
    const m = /\[[\s\S]*\]/.exec(res.content)
    if (!m) return []
    try {
      const arr = JSON.parse(m[0]) as unknown[]
      return arr.filter((x) => typeof x === 'string').map((x) => String(x).slice(0, 20))
    } catch {
      return []
    }
  }

  async singSummary(durSec: number): Promise<string> {
    const cfg = loadConfig()
    if (!llmReady(cfg.llm)) return ''
    const p = singSummaryPrompt(durSec)
    const res = await chatCompletion(
      cfg.llm,
      [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user }
      ],
      undefined,
      { maxTokens: 60, temperature: 0.9 }
    )
    return res.ok ? res.content.trim().slice(0, 30) : ''
  }

  clearHistory(): void {
    this.history = []
    this.ctx = []
    saveHistory(this.history)
  }
}

export const brain = new Brain()
