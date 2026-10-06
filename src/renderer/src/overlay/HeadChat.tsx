import { useEffect, useRef, useState } from 'react'

interface ReplyItem {
  id: number
  text: string
  kaomoji?: string
}

const MAX_STACK = 3

/**
 * 头顶对话气泡：宠物头顶的行内聊天。
 * 输入框贴着头，AI 回复向上堆叠（最多 3 条，越旧越淡），新回复永远离头最近。
 */
export function HeadChat({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const [input, setInput] = useState('')
  const [replies, setReplies] = useState<ReplyItem[]>([])
  const [thinking, setThinking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(1)

  useEffect(() => {
    if (!open) return
    // 打开即聚焦，直接可打字
    window.setTimeout(() => inputRef.current?.focus(), 60)
    const offReply = window.gugu.onChatReply((r) => {
      setThinking(false)
      if (!r.content) return
      setReplies((cur) => [...cur, { id: nextId.current++, text: r.content, kaomoji: r.kaomoji }].slice(-MAX_STACK))
    })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offReply()
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return <></>

  const send = (): void => {
    const t = input.trim()
    if (!t || thinking) return
    setInput('')
    setThinking(true)
    window.gugu.chat.send(t)
  }

  return (
    <div className="head-chat">
      {/* 旧 → 新，输入框在最下（贴头），新回复紧挨输入框上方 */}
      {replies.map((r, i) => (
        <div
          key={r.id}
          className="hc-reply"
          style={{ opacity: 0.5 + (0.5 * (i + 1)) / MAX_STACK }}
        >
          <span className="hc-text">{r.text.length > 90 ? r.text.slice(0, 90) + '…' : r.text}</span>
          {r.kaomoji && <span className="hc-kaomoji">{r.kaomoji}</span>}
        </div>
      ))}
      {thinking && (
        <div className="hc-reply hc-thinking">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      )}
      <div className="hc-input-bar">
        <input
          ref={inputRef}
          className="hc-input"
          placeholder="跟咕咕说点什么…"
          value={input}
          maxLength={120}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send()
          }}
        />
        <button className="hc-send" onClick={send} disabled={thinking || !input.trim()}>
          ↑
        </button>
      </div>
    </div>
  )
}
