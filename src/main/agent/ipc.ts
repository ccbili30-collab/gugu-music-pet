// Agent IPC：聊天收发 / LLM 配置 / 历史
import { ipcMain } from 'electron'
import { brain } from './brain'
import { loadConfig, saveConfig, type AppConfig } from '../store'
import { testConnection } from './llm'
import { memoryDir } from '../store'
import { join } from 'node:path'

export function registerAgentIpc(): void {
  brain.boot()

  ipcMain.handle('llm:config:get', () => {
    const c = loadConfig()
    // apiKey 不回传明文，只传是否已配置
    return { ...c, llm: { ...c.llm, apiKey: c.llm.apiKey ? '__SET__' : '' } }
  })
  ipcMain.handle('llm:config:set', (_e, partial: { llm?: Partial<AppConfig['llm']>; personaName?: string }) => {
    const cur = loadConfig()
    const next: AppConfig = {
      ...cur,
      personaName: partial.personaName ?? cur.personaName,
      llm: { ...cur.llm, ...partial.llm }
    }
    if (next.llm.apiKey === '__SET__') next.llm.apiKey = cur.llm.apiKey
    saveConfig(next)
    return { ok: true }
  })
  ipcMain.handle('llm:test', () => testConnection(loadConfig().llm))
  ipcMain.handle('chat:history', () => brain.chatHistory.slice(-100))
  ipcMain.handle('chat:clear', () => {
    brain.clearHistory()
    return { ok: true }
  })
  ipcMain.on('chat:send', (_e, text: string) => {
    void brain.chat(text)
  })
  ipcMain.handle('sing:pool', () => brain.singPool())
  ipcMain.handle('sing:summary', (_e, durSec: number) => brain.singSummary(durSec))
  ipcMain.handle('memory:dir', () => join(memoryDir(), '..'))
}
