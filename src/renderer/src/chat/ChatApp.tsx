import { useEffect, useRef, useState } from 'react'
import type { Track } from '../../../preload/index'

interface Msg {
  role: 'user' | 'assistant'
  text: string
  kaomoji?: string
  kind?: 'say' | 'comment' | 'resonance' | 'invite' | 'hum'
}

interface SongCard {
  id: number
  tracks: Track[]
}

const CHIPS = ['来点适合写代码的歌', '随便放首好听的', '暂停', '推荐一首你喜欢的', '放周杰伦的歌']

export function ChatApp(): JSX.Element {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [cards, setCards] = useState<Record<number, SongCard>>({})
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [cfg, setCfg] = useState({ baseUrl: '', apiKey: '', model: '', personaName: '咕咕' })
  const [testResult, setTestResult] = useState<string>('')
  const [configured, setConfigured] = useState(true)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.gugu.chat.history().then((h) => {
      setMsgs(h.map((m) => ({ role: m.role, text: m.content })))
    })
    void window.gugu.chat.configGet().then((c) => {
      setCfg({ baseUrl: c.llm.baseUrl, apiKey: c.llm.apiKey, model: c.llm.model, personaName: c.personaName })
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

  const playTrack = (tracks: Track[], index: number): void => {
    window.gugu.music.playCard(tracks, index)
  }

  return (
    <div className="chat-app">
      <div className="chat-header">
        <span>🕊️ {cfg.personaName || '咕咕'} · 音乐伙伴</span>
        <button className="chat-gear" title="大脑设置" onClick={() => setShowSettings((v) => !v)}>
          ⚙️
        </button>
      </div>

      {showSettings && (
        <div className="chat-settings">
          <div className="cs-title">LLM 大脑（OpenAI 兼容）</div>
          <input
            className="cs-input"
            placeholder="Base URL，如 https://api.deepseek.com"
            value={cfg.baseUrl}
            onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
          />
          <input
            className="cs-input"
            placeholder="API Key"
            type="password"
            value={cfg.apiKey === '__SET__' ? '' : cfg.apiKey}
            onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
          />
          <input
            className="cs-input"
            placeholder="模型，如 deepseek-chat / glm-4.7"
            value={cfg.model}
            onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
          />
          <input
            className="cs-input"
            placeholder="宠物名字"
            value={cfg.personaName}
            onChange={(e) => setCfg({ ...cfg, personaName: e.target.value })}
          />
          <div className="cs-row">
            <button
              className="cs-btn"
              onClick={async () => {
                await window.gugu.chat.configSet({
                  llm: { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model },
                  personaName: cfg.personaName
                })
                setTestResult('已保存')
                setConfigured(!!(cfg.baseUrl && cfg.apiKey && cfg.model))
              }}
            >
              保存
            </button>
            <button
              className="cs-btn cs-btn-ghost"
              onClick={async () => {
                setTestResult('测试中…')
                const r = await window.gugu.chat.test()
                setTestResult(r.ok ? '连接成功 ✓' : `失败：${r.error?.slice(0, 60)}`)
              }}
            >
              测试连接
            </button>
            {testResult && <span className="cs-result">{testResult}</span>}
          </div>
        </div>
      )}

      <div className="chat-body" ref={bodyRef}>
        {msgs.length === 0 && !configured && (
          <div className="chat-empty">
            <span className="bird">🕊️</span>
            先在右上角 ⚙️ 填好 LLM API，咕咕才能思考
            <br />
            （推荐 DeepSeek / 智谱 GLM，任意 OpenAI 兼容接口都行）
          </div>
        )}
        {msgs.length === 0 && configured && (
          <div className="chat-empty">
            <span className="bird">🕊️</span>
            想听什么直接说，比如「来点适合写代码的歌」
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg-row ${m.role === 'user' ? 'msg-me' : 'msg-pet'}`}>
            <div className={`bubble-${m.role === 'user' ? 'me' : 'pet'} ${m.kind ? `bubble-kind-${m.kind}` : ''}`}>
              {m.text}
              {m.kaomoji && <span className="msg-kaomoji">{m.kaomoji}</span>}
            </div>
          </div>
        ))}
        {Object.values(cards).map((card) => (
          <div key={card.id} className="song-card">
            {card.tracks.slice(0, 8).map((t, i) => (
              <button key={t.id} className="song-item" onClick={() => playTrack(card.tracks, i)}>
                <span className="song-idx">{i + 1}</span>
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
          placeholder={`跟${cfg.personaName || '咕咕'}说点什么…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send(input)
          }}
        />
        <button className="chat-send" onClick={() => send(input)} disabled={thinking}>
          发送
        </button>
      </div>
    </div>
  )
}
