// 网易云音乐 Provider：封装 NeteaseCloudMusicApi npm 包。
// 接口收敛在这一个文件，未来换后端只改这里。
import {
  register_anonimous,
  login_qr_key,
  login_qr_create,
  login_qr_check,
  login_status,
  cloudsearch,
  song_url_v1,
  song_detail,
  comment_music,
  lyric_new,
  personalized_newsong
} from 'NeteaseCloudMusicApi'

export interface Track {
  id: number
  name: string
  artists: string
  album?: string
  durationMs: number
  cover?: string
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

export interface QrInfo {
  key: string
  qrimg: string
}

export type QrPollStatus = 'waiting' | 'scanned' | 'confirmed' | 'expired'

function pickCookie(res: { cookie?: unknown; body?: { cookie?: unknown } }): string {
  const c = (res.cookie as string) || (res.body?.cookie as string) || ''
  return typeof c === 'string' ? c : ''
}

/** CDN 链接可用性探测（Range: bytes=0-1，失败重取可救活过期签名） */
async function urlPlayable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-1', 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' },
      signal: AbortSignal.timeout(8000)
    })
    return res.status === 200 || res.status === 206
  } catch {
    return false
  }
}

function toTrack(s: {
  id: number
  name: string
  ar?: { name: string }[]
  artists?: { name: string }[]
  al?: { name?: string; picUrl?: string }
  album?: { name?: string; picUrl?: string }
  dt?: number
  duration?: number
}): Track {
  const ar = s.ar ?? s.artists ?? []
  return {
    id: s.id,
    name: s.name,
    artists: ar.map((a) => a.name).join('/'),
    album: (s.al ?? s.album)?.name,
    durationMs: s.dt ?? s.duration ?? 0,
    cover: (s.al ?? s.album)?.picUrl
  }
}

export class NetEaseProvider {
  readonly name = 'netease'

  /** 匿名 cookie 引导（大多数读接口匿名可用，登录态操作需要） */
  async anonCookie(): Promise<string> {
    try {
      const res = await register_anonimous({})
      return pickCookie(res)
    } catch {
      return ''
    }
  }

  async createQr(cookie: string): Promise<QrInfo> {
    const keyRes = await login_qr_key({ cookie: cookie || undefined })
    const key = keyRes.body.data.unikey
    const qrRes = await login_qr_create({ key, qrimg: true, cookie: cookie || undefined })
    return { key, qrimg: qrRes.body.data.qrimg }
  }

  /** 轮询扫码状态；确认登录时返回 cookie */
  async pollQr(key: string, cookie: string): Promise<{ status: QrPollStatus; cookie?: string }> {
    const res = await login_qr_check({ key, cookie: cookie || undefined })
    const code = res.body.code
    if (code === 803) return { status: 'confirmed', cookie: pickCookie(res) }
    if (code === 802) return { status: 'scanned' }
    if (code === 800) return { status: 'expired' }
    return { status: 'waiting' }
  }

  async loginState(cookie: string): Promise<LoginState> {
    if (!cookie) return { loggedIn: false }
    try {
      const res = await login_status({ cookie })
      const profile = res.body?.data?.profile ?? res.body?.profile
      if (!profile) return { loggedIn: false }
      return {
        loggedIn: true,
        nickname: profile.nickname,
        avatar: profile.avatarUrl,
        vip: !!res.body?.data?.vipType && res.body.data.vipType > 0
      }
    } catch {
      return { loggedIn: false }
    }
  }

  async search(keyword: string, limit = 12, cookie = ''): Promise<Track[]> {
    const res = await cloudsearch({ keywords: keyword, limit, type: 1, cookie: cookie || undefined })
    const songs = res.body?.result?.songs ?? []
    return songs.map(toTrack)
  }

  async songDetail(ids: number[], cookie = ''): Promise<Track[]> {
    if (!ids.length) return []
    const res = await song_detail({ ids: ids.join(','), cookie: cookie || undefined })
    return (res.body?.songs ?? []).map(toTrack)
  }

  /** 取播放链接。trial=true 表示 VIP 歌只给了试听片段；URL 会先验证可用（403 自动重取一次） */
  async songUrl(
    id: number,
    cookie = ''
  ): Promise<{ url: string | null; br: number; trial: boolean }> {
    const fetchOnce = async (): Promise<{ url: string | null; br: number; trial: boolean }> => {
      const res = await song_url_v1({ id, level: 'exhigh', cookie: cookie || undefined })
      const d = res.body?.data?.[0]
      return { url: d?.url ?? null, br: d?.br ?? 0, trial: !!d?.freeTrialInfo }
    }
    let r = await fetchOnce()
    if (r.url && !(await urlPlayable(r.url))) {
      // CDN 签名过期等情况：重新取一次新链接
      r = await fetchOnce()
      if (!r.url || !(await urlPlayable(r.url))) return { url: null, br: 0, trial: r.trial }
    }
    return r
  }

  async hotComments(id: number, limit = 10, cookie = ''): Promise<Comment[]> {
    const res = await comment_music({ id, limit, cookie: cookie || undefined })
    const list = res.body?.hotComments ?? []
    return list.map((c: { commentId?: number; user?: { nickname: string; avatarUrl?: string }; content: string; likedCount?: number }) => ({
      id: String(c.commentId ?? Math.random()),
      userName: c.user?.nickname ?? '匿名',
      avatar: c.user?.avatarUrl,
      content: c.content,
      likedCount: c.likedCount ?? 0
    }))
  }

  async lyric(id: number, cookie = ''): Promise<LyricLine[]> {
    const res = await lyric_new({ id, cookie: cookie || undefined })
    const raw = res.body?.lrc?.lyric ?? ''
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

  async recommend(cookie = ''): Promise<Track[]> {
    const res = await personalized_newsong({ limit: 12, cookie: cookie || undefined })
    const list = res.body?.result ?? []
    return list.map(
      (item: { id: number; name: string; song?: Record<string, never> }) =>
        toTrack({
          id: item.id ?? item.song?.id,
          name: item.name,
          ar: item.song?.artists,
          al: item.song?.album,
          dt: item.song?.duration
        })
    )
  }
}
