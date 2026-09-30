// 简单 JSON 持久化（userData）：LLM 配置 / 聊天历史 / 大脑状态
import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
}

export interface ChatMsg {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: { id: string; name: string; args: string }[]
  toolCallId?: string
  hidden?: boolean
  ts?: number
}

export interface AppConfig {
  llm: LlmConfig
  personaName: string
  /** 当前角色包 id（空 = 默认 pigeon） */
  packId: string
}

const DEFAULT_CONFIG: AppConfig = {
  llm: {
    baseUrl: '',
    apiKey: '',
    model: '',
    temperature: 0.8
  },
  personaName: '咕咕',
  packId: ''
}

function userDataFile(name: string): string {
  return join(app.getPath('userData'), name)
}

export function loadConfig(): AppConfig {
  try {
    const raw = JSON.parse(readFileSync(userDataFile('config.json'), 'utf8')) as {
      llmKeyEnc?: string
    } & Partial<AppConfig>
    const cfg: AppConfig = { ...DEFAULT_CONFIG, ...raw, llm: { ...DEFAULT_CONFIG.llm, ...raw.llm } }
    // apiKey 加密存储优先；兼容旧明文
    if (raw.llmKeyEnc) {
      try {
        cfg.llm.apiKey = safeStorage.decryptString(Buffer.from(raw.llmKeyEnc, 'base64'))
      } catch {
        cfg.llm.apiKey = ''
      }
    }
    return cfg
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(cfg: AppConfig): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  let llmKeyEnc: string | undefined
  let apiKeyPlain = cfg.llm.apiKey
  if (apiKeyPlain && safeStorage.isEncryptionAvailable()) {
    llmKeyEnc = safeStorage.encryptString(apiKeyPlain).toString('base64')
    apiKeyPlain = ''
  }
  writeFileSync(
    userDataFile('config.json'),
    JSON.stringify({ ...cfg, llm: { ...cfg.llm, apiKey: apiKeyPlain }, llmKeyEnc }, null, 2)
  )
}

export function loadHistory(): ChatMsg[] {
  try {
    return JSON.parse(readFileSync(userDataFile('chat-history.json'), 'utf8')) as ChatMsg[]
  } catch {
    return []
  }
}

export function saveHistory(msgs: ChatMsg[]): void {
  try {
    writeFileSync(userDataFile('chat-history.json'), JSON.stringify(msgs.slice(-200), null, 2))
  } catch (e) {
    console.error('[store] history save failed', e)
  }
}

export function memoryDir(): string {
  const dir = join(app.getPath('userData'), 'memory')
  if (!existsSync(dir)) {
    mkdirSync(join(dir, 'identity'), { recursive: true })
    mkdirSync(join(dir, 'preferences'), { recursive: true })
    mkdirSync(join(dir, 'episodes'), { recursive: true })
    mkdirSync(join(dir, 'behavior'), { recursive: true })
    writeFileSync(
      join(dir, 'MEMORY.md'),
      '# 记忆索引\n\n<!-- memory-extractor 维护，勿手改 -->\n'
    )
  }
  return dir
}
