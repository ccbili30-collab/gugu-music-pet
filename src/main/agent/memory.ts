// 长期记忆：Markdown 文件 + 索引（格式兼容旧 gugu 项目 memory/ 目录，可拷贝迁移）
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { memoryDir } from '../store'

export interface MemoryEntry {
  type: 'identity' | 'preferences' | 'episodes' | 'behavior'
  title: string
  summary: string
  file: string
}

const INDEX_FILE = 'MEMORY.md'

export function readIndex(): string {
  try {
    return readFileSync(join(memoryDir(), INDEX_FILE), 'utf8')
  } catch {
    return ''
  }
}

function appendIndex(entry: MemoryEntry): void {
  appendFileSync(join(memoryDir(), INDEX_FILE), `- [${entry.type}] ${entry.title}：${entry.summary}\n`)
}

export function storeMemory(raw: { type: string; title: string; summary: string }): void {
  const type = (['identity', 'preferences', 'episodes', 'behavior'].includes(raw.type) ? raw.type : 'episodes') as MemoryEntry['type']
  const title = (raw.title || '未命名').slice(0, 24)
  const summary = raw.summary.slice(0, 120)
  const file = join(memoryDir(), type, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.md`)
  const frontmatter = ['---', `type: ${type}`, `title: ${title}`, `created: ${new Date().toISOString()}`, '---', ''].join('\n')
  writeFileSync(file, `${frontmatter}${summary}\n`)
  appendIndex({ type, title, summary, file })
}

/** 关键词检索（token 重叠 + 新鲜度，移植旧 memory_retriever 思路，简化版） */
export function retrieve(query: string, limit = 3): MemoryEntry[] {
  const index = readIndex()
  if (!index) return []
  const tokens = query.split(/[\s,，。？！!?、/\\]+/).filter((t) => t.length >= 2)
  const lines = index.split('\n').filter((l) => l.startsWith('- ['))
  const scored = lines.map((line) => {
    let score = 0
    for (const t of tokens) if (line.includes(t)) score += 2
    return { line, score }
  })
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => {
      const m = /^- \[(\w+)\] (.+?)：(.+)$/.exec(s.line)
      if (!m) return null
      return { type: m[1] as MemoryEntry['type'], title: m[2], summary: m[3], file: '' }
    })
    .filter((e): e is MemoryEntry => e !== null)
}

export function formatContext(query: string): string {
  const entries = retrieve(query)
  if (!entries.length) return ''
  return `## 相关记忆（很久以前记住的）\n${entries.map((e) => `- ${e.title}：${e.summary}`).join('\n')}\n`
}

export function memoryFileExists(): boolean {
  return existsSync(join(memoryDir(), INDEX_FILE))
}
