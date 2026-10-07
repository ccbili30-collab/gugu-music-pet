import { useEffect, useRef, useState } from 'react'
import type { Track } from '../../../preload/index'

interface Msg {
  role: 'user' | 'assistant'
  text: string
  kaomoji?: string
}

interface SongCard {
  id: number
  tracks: Track[]
}

const CHIPS = ['来点适合写代码的歌', '随便放首好听的', '推荐一首你喜欢的', '放周杰伦的歌']

/** 对话面板：透明玻璃风消息流 + 歌曲卡片（右键宠物打开） */
export function ChatApp(): JSX.Element {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [cards, setCards] = useState<Record<number, SongCard>>({})
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [configured, setConfigured] = useState(true)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.gugu.chat.history().then((h) => {
      setMsgs(h.map((m) => ({ role: m.role, text: m.content })))
    })
    void window.gugu.chat.configGet().then((c) => {
      setConfigured(!!(c.llm.baseUrl && c.llm.apiKey && c.llm.model))
    })
    const offReply = window.gugu.onChatReply((r) => {
      setThinking(false)
      setMsgs((cur) => [...cur, { role: 'assistant', text: r.content, kaomoji: r.kaomoji }])
    })
    const offCard = window.gugu.onChatCard((c) => {
      setCards((cur) => ({ ...cur, [Date.now()]: { id: Date.now(), tracks: c.tracks } }))
    })
    return () => {
      offReply()
      offCard()
    }
  }, [])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [msgs, thinking, cards])

  const send = (text: string): void => {
    const t = text.trim()
    if (!t || thinking) return
    setMsgs((cur) => [...cur, { role: 'user', text: t }])
    setInput('')
    setThinking(true)
    window.gugu.chat.send(t)
  }

  return (
    <div className="chat-app">
      <div className="chat-header">
        <span className="chat-title">对话</span>
        <span className="chat-status">{configured ? '' : '未配置 LLM'}</span>
      </div>

      <div className="chat-body" ref={bodyRef}>
        {msgs.length === 0 && (
          <div className="chat-empty">
            {configured ? '想听什么直接说，比如「来点适合写代码的歌」' : '托盘左键打开设置，填好 LLM 才能思考'}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg-row ${m.role === 'user' ? 'msg-me' : 'msg-pet'}`}>
            <div className={`bubble-${m.role === 'user' ? 'me' : 'pet'}`}>
              {m.text}
              {m.kaomoji && <span className="msg-kaomoji">{m.kaomoji}</span>}
            </div>
          </div>
        ))}
        {Object.values(cards).map((card) => (
          <div key={card.id} className="song-card">
            {card.tracks.slice(0, 8).map((t, i) => (
              <button
                key={t.id}
                className="song-item"
                onClick={() => window.gugu.music.playCard(card.tracks, i)}
              >
                {t.cover ? <img className="song-cover" src={t.cover} alt="" draggable={false} /> : <span className="song-cover song-cover-empty" />}
                <span className="song-name">{t.name}</span>
                <span className="song-artist">{t.artists}</span>
                <span className="song-play">▶</span>
              </button>
            ))}
          </div>
        ))}
        {thinking && (
          <div className="msg-row msg-pet">
            <div className="bubble-pet bubble-thinking">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}
      </div>

      <div className="chat-chips">
        {CHIPS.map((c) => (
          <button key={c} className="chip" onClick={() => send(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="chat-input-bar">
        <input
          className="chat-input"
          placeholder="说点什么…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(input)
          }}
        />
        <button className="chat-send" onClick={() => send(input)} disabled={thinking || !input.trim()}>
          ↑
        </button>
      </div>
    </div>
  )
}
