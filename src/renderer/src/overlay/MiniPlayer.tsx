import { useEffect, useState } from 'react'
import type { PlayerState } from '../../../preload/index'
import { LAYOUT } from '../pet/types'

/** 迷你播放器导航键：🎙 ⏮ ▶/⏸ ⏭ + 歌名（有曲目时显示在宠物头顶） */
export function MiniPlayer({
  engine,
  micOn,
  onMicToggle
}: {
  engine: { toggle(): void; next(): void; prev(): void } | null
  micOn: boolean
  onMicToggle(): void
}): JSX.Element {
  const [state, setState] = useState<PlayerState | null>(null)

  useEffect(() => {
    void window.gugu.music.playerState().then((s) => setState(s))
    const off = window.gugu.onMusicState(({ player }) => setState(player))
    return off
  }, [])

  if (!state?.track) return <></>
  const t = state.track

  return (
    <div className="mini-player" style={{ left: LAYOUT.anchorX - 110, top: LAYOUT.anchorY - 148 }}>
      <button
        className={`mp-btn mp-mic${micOn ? ' mp-mic-on' : ''}`}
        title={micOn ? '结束伴唱' : '伴唱（跟唱模式）'}
        onClick={onMicToggle}
      >
        <img src="icons/mic.png" alt="" draggable={false} />
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
      <div className="mp-title">
        <span className="mp-name">
          {t.name}
          {state.trial ? '（试听）' : ''}
        </span>
        <span className="mp-artist">{t.artists}</span>
      </div>
    </div>
  )
}
