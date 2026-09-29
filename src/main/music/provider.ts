// 汽水音乐 Provider：通过本地 go-music-api sidecar（127.0.0.1:28080）访问汽水（抖音）曲库。
// 接口收敛在这一个文件，未来换后端只改这里。
// 注意：汽水歌曲 id 是 19 位大数，Track.id 一律用 string（超过 Number.MAX_SAFE_INTEGER）。
import { sidecarFetch, SIDECAR_PORT } from './sidecar'

export interface Track {
  id: string
  name: string
  artists: string
  album?: string
  durationMs: number
  cover?: string
  vip?: boolean
}

export interface Comment {
  id: string
  userName: string
  avatar?: string
  content: string
  likedCount: number
}

export interface LyricLine {
  time: number
  text: string
}

export interface LoginState {
  loggedIn: boolean
  nickname?: string
  avatar?: string
  vip?: boolean
}

interface SodaSong {
  id: string
  name: string
  artist: string
  album?: string
  duration?: number // 秒
  cover?: string
  is_vip?: boolean
}

/** LRC 文本 → [{time,text}] */
function parseLrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const line of raw.split('\n')) {
    const m = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/.exec(line.trim())
    if (!m) continue
    const text = m[3].trim()
    if (!text) continue
    lines.push({ time: Number(m[1]) * 60 + Number(m[2]), text })
  }
  return lines
}

function toTrack(s: SodaSong): Track {
  return {
    id: String(s.id),
    name: s.name,
    artists: s.artist ?? '',
    album: s.album,
    durationMs: (s.duration ?? 0) * 1000,
    cover: s.cover,
    vip: !!s.is_vip
  }
}

/** 随机来一首用的热词池（汽水无个性化推荐接口） */
const HOT_QUERIES = ['热门金曲', '华语流行', '经典老歌', '轻音乐', '影视原声', '抖音热歌']

export class SodaProvider {
  readonly name = 'soda'

  async search(keyword: string, limit = 12): Promise<Track[]> {
    const res = await sidecarFetch(
      `/api/v1/music/search?q=${encodeURIComponent(keyword)}&type=song&sources=soda`
    )
    const body = (await res.json()) as { data?: { songs?: SodaSong[] } }
    return (body.data?.songs ?? []).slice(0, limit).map(toTrack)
  }

  /** 取播放链接：直接给 sidecar 的解密代理流（支持 Range，节拍检测可用） */
  async songUrl(id: string): Promise<{ url: string | null; trial: boolean }> {
    // 先确认可用性（sidecar 会解密并给出流）
    const check = await sidecarFetch(
      `/api/v1/music/inspect?source=soda&id=${encodeURIComponent(id)}`
    )
    if (!check.ok) return { url: null, trial: false }
    return {
      url: `http://127.0.0.1:${SIDECAR_PORT}/api/v1/music/stream?source=soda&id=${encodeURIComponent(id)}`,
      trial: false
    }
  }

  /** 汽水搜索结果自带元数据；按 id 回查用分享链接解析 */
  async songDetail(ids: string[]): Promise<Track[]> {
    const out: Track[] = []
    for (const id of ids) {
      try {
        const res = await sidecarFetch(
          `/api/v1/music/search?q=${encodeURIComponent(`https://www.qishui.com/track/${id}`)}`
        )
        const body = (await res.json()) as { data?: { songs?: SodaSong[] } }
        const s = body.data?.songs?.[0]
        if (s) out.push(toTrack(s))
      } catch {
        /* 单个失败忽略 */
      }
    }
    return out
  }

  /** 汽水无公开热评接口：返回空，热评卡 UI 自行兜底 */
  async hotComments(): Promise<Comment[]> {
    return []
  }

  async lyric(id: string): Promise<LyricLine[]> {
    const res = await sidecarFetch(`/api/v1/music/lyric?source=soda&id=${encodeURIComponent(id)}`)
    const body = (await res.json()) as { data?: { lyric?: string } }
    return parseLrc(body.data?.lyric ?? '')
  }

  async recommend(): Promise<Track[]> {
    const q = HOT_QUERIES[Math.floor(Math.random() * HOT_QUERIES.length)]
    try {
      return await this.search(q, 12)
    } catch {
      return []
    }
  }

  /** cookie = 汽水 sessionid（手动粘贴，见登录窗）；校验方式：写入后能搜索即算可用 */
  async loginState(cookie: string): Promise<LoginState> {
    if (!cookie) return { loggedIn: false }
    return { loggedIn: true, nickname: '汽水听众' }
  }

  /** 把 cookie 写进 sidecar（cookies.json 热更新） */
  async applyCookie(cookie: string): Promise<boolean> {
    try {
      const res = await sidecarFetch('/api/v1/system/cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soda: cookie })
      })
      return res.ok
    } catch {
      return false
    }
  }
}
