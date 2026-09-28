// OpenAI 兼容 LLM 客户端（DeepSeek / GLM / Qwen / OpenAI …）
import type { LlmConfig } from '../store'

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

export interface LlmUsage {
  totalTokens: number
}

export interface LlmResult {
  ok: boolean
  content: string
  toolCalls: { id: string; name: string; args: string }[]
  usage?: LlmUsage
  error?: string
}

function normalizeBaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '')
  if (!u) return u
  if (!/\/v\d+$/.test(u)) u += '/v1'
  return u
}

export function llmReady(cfg: LlmConfig): boolean {
  return !!(cfg.baseUrl && cfg.apiKey && cfg.model)
}

export async function chatCompletion(
  cfg: LlmConfig,
  messages: LlmMessage[],
  tools?: ToolDef[],
  opts?: { maxTokens?: number; temperature?: number }
): Promise<LlmResult> {
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base || !cfg.apiKey) return { ok: false, content: '', toolCalls: [], error: '未配置 LLM' }
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        ...(tools && tools.length ? { tools, tool_choice: 'auto' } : {}),
        temperature: opts?.temperature ?? cfg.temperature,
        max_tokens: opts?.maxTokens ?? 800
      }),
      signal: AbortSignal.timeout(60_000)
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, content: '', toolCalls: [], error: `LLM ${res.status}: ${text.slice(0, 200)}` }
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: LlmMessage['tool_calls'] } }[]
      usage?: { total_tokens?: number }
    }
    const msg = body.choices?.[0]?.message
    return {
      ok: true,
      content: msg?.content ?? '',
      toolCalls: (msg?.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, args: c.function.arguments })),
      usage: { totalTokens: body.usage?.total_tokens ?? 0 }
    }
  } catch (e) {
    return { ok: false, content: '', toolCalls: [], error: String(e instanceof Error ? e.message : e) }
  }
}

export async function testConnection(cfg: LlmConfig): Promise<{ ok: boolean; error?: string }> {
  const r = await chatCompletion(
    { ...cfg, temperature: 0 },
    [{ role: 'user', content: 'ping，回复 pong 即可' }],
    undefined,
    { maxTokens: 10 }
  )
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}
