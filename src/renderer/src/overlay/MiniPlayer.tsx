import { useEffect, useState } from 'react'
import type { PlayerState } from '../../../preload/index'

/** 迷你播放器：极简一行胶囊（控制组 + 歌名 + 底部细进度线） */
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
  const pct = state.durationSec > 0 ? Math.min(100, (state.positionSec / state.durationSec) * 100) : 0

  return (
    <div className="mini-player">
      <button className={`mp-btn mp-mic${micOn ? ' mp-mic-on' : ''}`} title={micOn ? '结束伴唱' : '伴唱'} onClick={onMicToggle}>
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
      <div className="mp-mid">
        <span className="mp-name">
          ♪ {t.name} · {t.artists}
          {state.trial ? '（试听）' : ''}
        </span>
        <div className="mp-progress">
          <div className="mp-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}
