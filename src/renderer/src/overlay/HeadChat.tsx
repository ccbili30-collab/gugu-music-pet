import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

interface ReplyItem {
  id: number
  text: string
  kaomoji?: string
  /** 蒸发中 */
  fading?: boolean
}

const MAX_STACK = 3
/** 交流后空闲多久开始蒸发 */
const IDLE_FADE_MS = 6000
/** 唤醒后移开多久回收 */
const DWELL_OUT_MS = 1500
/** 级联蒸发间隔 */
const CASCADE_MS = 150

export interface HeadChatHandle {
  hover(over: boolean): void
  /** 双击唤醒：立刻弹出单个输入框（不带历史回复） */
  open(): void
}

/**
 * 头顶对话气泡（注意力阶梯）：
 * hidden →(悬停)peek →(300ms 停留)open →(打字)锁定 engaged →(空闲6s)fading 级联蒸发 → hidden
 * 蒸发可被悬停/打字/新回复打断；Esc 立即收起；再次唤醒时旧回复以淡显回溯。
 */
export const HeadChat = forwardRef<HeadChatHandle, { onPhaseChange?: (active: boolean) => void }>(
function HeadChat({ onPhaseChange }, ref): JSX.Element {
  const [phase, setPhase] = useState<'hidden' | 'open' | 'fading'>('hidden')
  const [replies, setReplies] = useState<ReplyItem[]>([])
  const [thinking, setThinking] = useState(false)
  const [input, setInput] = useState('')
  const [barFading, setBarFading] = useState(false)
  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem('gugu-hc-onboarded'))
  const inputRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(1)
  const engagedRef = useRef(false)
  const thinkingRef = useRef(false)
  const repliesRef = useRef<ReplyItem[]>([])
  repliesRef.current = replies
  const lastActivityRef = useRef(0)
  const hoverRef = useRef(false)
  const timersRef = useRef<number[]>([])
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const setPhaseBoth = (p: typeof phase): void => {
    phaseRef.current = p
    setPhase(p)
    onPhaseChange?.(p !== 'hidden')
  }
  const clearTimers = (): void => {
    for (const t of timersRef.current) window.clearTimeout(t)
    timersRef.current = []
  }
  const later = (fn: () => void, ms: number): void => {
    timersRef.current.push(window.setTimeout(fn, ms))
  }

  /** 顺序消散：回复旧→新逐条溶解，输入框最后消散，然后回 hidden */
  const cascadeClose = (fast: boolean): void => {
    clearTimers()
    setPhaseBoth('fading')
    const step = fast ? 70 : CASCADE_MS
    const n = repliesRef.current.length
    repliesRef.current.forEach((r, i) => {
      later(() => {
        setReplies((c) => c.map((x) => (x.id === r.id ? { ...x, fading: true } : x)))
      }, i * step)
    })
    // 输入框收尾消散
    later(() => setBarFading(true), n * step + (fast ? 60 : 120))
    later(
      () => {
        if (phaseRef.current === 'fading') {
          setPhaseBoth('hidden')
          thinkingRef.current = false
          setThinking(false)
          setBarFading(false)
          setReplies([])
        }
      },
      n * step + 460
    )
  }

  useImperativeHandle(ref, () => ({
    /** 双击唤醒：立刻弹出输入框，不带历史 */
    open(): void {
      clearTimers()
      setReplies([])
      setBarFading(false)
      setThinking(false)
      thinkingRef.current = false
      engagedRef.current = false
      setPhaseBoth('open')
      localStorage.setItem('gugu-hc-onboarded', '1')
      setOnboarded(true)
      window.setTimeout(() => inputRef.current?.focus(), 60)
    },
    hover(over: boolean): void {
      hoverRef.current = over
      clearTimers()
      if (over) {
        if (phaseRef.current === 'fading') {
          // 打断消散，恢复交流态
          clearTimers()
          setReplies((cur) => cur.map((r) => ({ ...r, fading: false })))
          setBarFading(false)
          setPhaseBoth('open')
          lastActivityRef.current = Date.now()
        }
      } else if (phaseRef.current === 'open' && !engagedRef.current) {
        later(() => {
          if (!hoverRef.current && phaseRef.current === 'open' && !engagedRef.current) cascadeClose(true)
        }, DWELL_OUT_MS)
      }
    }
  }))

  // 空闲蒸发巡检
  useEffect(() => {
    const t = window.setInterval(() => {
      if (
        phaseRef.current === 'open' &&
        engagedRef.current &&
        !thinkingRef.current &&
        Date.now() - lastActivityRef.current > IDLE_FADE_MS
      ) {
        cascadeClose(false)
      }
    }, 500)
    return () => window.clearInterval(t)
  }, [replies.length])

  // 大脑回复
  useEffect(() => {
    const off = window.gugu.onChatReply((r) => {
      // hidden 态只有挂起中的回复才恢复会话（自主气泡走右侧语言区）
      if ((phaseRef.current === 'hidden' && !thinkingRef.current) || !r.content) return
      clearTimers()
      thinkingRef.current = false
      setThinking(false)
      setBarFading(false)
      setReplies((cur) => cur.map((r) => ({ ...r, fading: false })))
      engagedRef.current = true
      lastActivityRef.current = Date.now()
      if (phaseRef.current === 'fading' || phaseRef.current === 'hidden') setPhaseBoth('open')
      setReplies((cur) => [...cur, { id: nextId.current++, text: r.content, kaomoji: r.kaomoji }].slice(-MAX_STACK))
    })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        engagedRef.current = false
        cascadeClose(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const send = (): void => {
    const t = input.trim()
    if (!t || thinking) return
    setInput('')
    engagedRef.current = true
    lastActivityRef.current = Date.now()
    thinkingRef.current = true
    setThinking(true)
    window.gugu.chat.send(t)
  }

  const visible = phase !== 'hidden'

  return (
    <>
      {phase === 'hidden' && !onboarded && (
        <div className="head-chat hc-onboard">Put your mouse on me and you can talk♪</div>
      )}
      {visible && (
        <div className={`head-chat hc-${phase}`}>
          {replies.map((r, i) => (
            <div
              key={r.id}
              className={`hc-reply${r.fading ? ' hc-evap' : ''}`}
              style={{ opacity: r.fading ? undefined : 0.5 + (0.5 * (i + 1)) / MAX_STACK }}
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
          <div className={`hc-input-bar${barFading ? ' hc-bar-evap' : ''}`}>
              <input
                ref={inputRef}
                className="hc-input"
                placeholder="Talk to Gugu…"
                value={input}
                maxLength={120}
                onChange={(e) => {
                  setInput(e.target.value)
                  engagedRef.current = true
                  lastActivityRef.current = Date.now()
                }}
                onKeyDown={(e) => {
                  engagedRef.current = true
                  lastActivityRef.current = Date.now()
                  if (e.key === 'Enter') send()
                }}
              />
              <button className="hc-send" onClick={send} disabled={thinking || !input.trim()}>
                ↑
              </button>
          </div>
        </div>
      )}
    </>
  )
}
)
