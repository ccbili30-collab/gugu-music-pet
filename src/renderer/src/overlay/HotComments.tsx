import { useEffect, useRef, useState } from 'react'
import type { Comment } from '../../../preload/index'
import { LAYOUT } from '../pet/types'

/** 左侧热评卡：自动轮播（hover 暂停），播放当前歌的热评 */
export function HotComments({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const [comments, setComments] = useState<Comment[]>([])
  const [idx, setIdx] = useState(0)
  const [trackName, setTrackName] = useState('')
  const hovered = useRef(false)

  // 当前歌变化时拉热评
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async (trackId: number, name: string): Promise<void> => {
      try {
        const cs = await window.gugu.music.comments(trackId, 8)
        if (!cancelled) {
          setComments(cs)
          setIdx(0)
          setTrackName(name)
        }
      } catch {
        if (!cancelled) setComments([])
      }
    }
    void window.gugu.music.playerState().then((s) => {
      if (s.track) void load(s.track.id, s.track.name)
    })
    const off = window.gugu.onMusicState(({ player }) => {
      if (player.track) void load(player.track.id, player.track.name)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [open])

  // 轮播
  useEffect(() => {
    if (!open || comments.length < 2) return
    const t = window.setInterval(() => {
      if (!hovered.current) setIdx((i) => (i + 1) % comments.length)
    }, 4000)
    return () => window.clearInterval(t)
  }, [open, comments.length])

  if (!open) return <></>
  const c = comments[idx]

  return (
    <div className="hot-comments" style={{ right: LAYOUT.windowW - LAYOUT.anchorX + 70 }} onMouseEnter={() => (hovered.current = true)} onMouseLeave={() => (hovered.current = false)}>
      <div className="hc-head">
        <span className="hc-title">🔥 {trackName || '热评'}</span>
        <button className="hc-close" onClick={onClose}>
          ✕
        </button>
      </div>
      {c ? (
        <div key={c.id} className="hc-card">
          <div className="hc-content">{c.content}</div>
          <div className="hc-meta">
            <span className="hc-user">— {c.userName}</span>
            <span className="hc-liked">♥ {c.likedCount}</span>
          </div>
        </div>
      ) : (
        <div className="hc-card hc-empty-card">还没有热评…</div>
      )}
      <div className="hc-dots">
        {comments.slice(0, 8).map((x, i) => (
          <span key={x.id} className={`hc-dot ${i === idx ? 'on' : ''}`} />
        ))}
      </div>
    </div>
  )
}
