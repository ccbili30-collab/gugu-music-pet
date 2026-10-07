import { useEffect, useRef, useState } from 'react'
import type { PlayerState } from '../../../preload/index'

const MicIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
    <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" />
    <path d="M18 11a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V19H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.09A6 6 0 0 0 18 11z" />
  </svg>
)

/** 迷你播放器：居中小胶囊（歌名 / 控制 / 可拖动进度条），透明细线风 */
export function MiniPlayer({
  engine,
  micOn,
  onMicToggle
}: {
  engine: { toggle(): void; next(): void; prev(): void; seek(sec: number): void } | null
  micOn: boolean
  onMicToggle(): void
}): JSX.Element {
  const [state, setState] = useState<PlayerState | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const lastSeekRef = useRef(0)

  useEffect(() => {
    void window.gugu.music.playerState().then((s) => setState(s))
    const off = window.gugu.onMusicState(({ player }) => setState(player))
    return off
  }, [])

  if (!state?.track) return <></>
  const t = state.track
  const pct = state.durationSec > 0 ? Math.min(100, (state.positionSec / state.durationSec) * 100) : 0

  /** 指针位置 → 拖动 seek（节流 120ms，拖动中仅视觉即时、落点 seek） */
  const seekFromEvent = (e: React.PointerEvent, final = false): void => {
    const el = trackRef.current
    if (!el || !state || state.durationSec <= 0) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    // 拖动中节流 seek，松手必 seek
    const now = performance.now()
    if (!final && now - lastSeekRef.current < 120) return
    lastSeekRef.current = now
    engine?.seek(ratio * state.durationSec)
  }

  return (
    <div className="mini-player">
      <div className="mp-name" title={`${t.name} · ${t.artists}`}>
        ♪ {t.name} · {t.artists}
        {state.trial ? '（试听）' : ''}
      </div>
      <div className="mp-row">
        <button className={`mp-btn mp-mic${micOn ? ' mp-mic-on' : ''}`} title={micOn ? '结束伴唱' : '伴唱'} onClick={onMicToggle}>
          <MicIcon />
        </button>
        <button className="mp-btn" title="上一首" onClick={() => engine?.prev()}>
          ⏮
        </button>
        <button className="mp-btn mp-main" title={state.playing ? '暂停' : '播放'} onClick={() => engine?.toggle()}>
          {state.playing ? '⏸' : '▶'}
        </button>
        <button className="mp-btn" title="下一首" onClick={() => engine?.next()}>
          ⏭
        </button>
      </div>
      <div
        className="mp-progress"
        ref={trackRef}
        title="拖动快进/快退"
        onPointerDown={(e) => {
          draggingRef.current = true
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          seekFromEvent(e)
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) seekFromEvent(e)
        }}
        onPointerUp={(e) => {
          if (draggingRef.current) {
            draggingRef.current = false
            seekFromEvent(e, true)
          }
        }}
      >
        <div className="mp-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
