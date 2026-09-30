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

export interface QrInfo {
  key: string
  qrimg: string
}

export type QrPollStatus = 'waiting' | 'scanned' | 'confirmed' | 'expired'

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

// 汽水护照（抖音账号体系）二维码登录：纯 HTTP 无签名（协议同 PopDownloader 社区实现）
const AUTH_BASE = 'https://api.qishui.com'
const AUTH_QUERY = {
  passport_jssdk_version: '2.4.13',
  passport_jssdk_type: 'normal',
  is_from_ttaccountsdk: '1',
  aid: '386088',
  next: 'https://api.qishui.com'
}

export class SodaProvider {
  readonly name = 'soda'

  /** 获取登录二维码（抖音 App 扫码） */
  async createQr(): Promise<QrInfo> {
    const q = new URLSearchParams(AUTH_QUERY)
    const res = await fetch(`${AUTH_BASE}/passport/web/get_qrcode/?${q}`, {
      signal: AbortSignal.timeout(10_000)
    })
    const body = (await res.json()) as { data?: { token?: string; qrcode?: string } }
    if (!body.data?.token || !body.data.qrcode) throw new Error('get_qrcode failed')
    return { key: body.data.token, qrimg: body.data.qrcode }
  }

  /** 轮询扫码状态；confirmed 时从 Set-Cookie 提取 sessionid */
  async pollQr(token: string): Promise<{ status: QrPollStatus; cookie?: string }> {
    const q = new URLSearchParams({ ...AUTH_QUERY, iid: '27960026095955' })
    const body = new URLSearchParams({
      need_logo: 'false',
      need_short_url: 'false',
      is_frontier: 'true',
      token,
      is_new_login: '1',
      next: 'https://api.qishui.com'
    })
    const res = await fetch(`${AUTH_BASE}/passport/web/check_qrconnect/?${q}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000)
    })
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : res.headers.get('set-cookie')
          ? [res.headers.get('set-cookie') as string]
          : []
    let sessionid = ''
    for (const item of setCookies) {
      const m = /sessionid=([^;]+)/.exec(item)
      if (m) sessionid = m[1]
    }
    const payload = (await res.json()) as { data?: { status?: string; error_code?: number } }
    const st = payload.data?.status
    if (st === 'confirmed' && sessionid) {
      return { status: 'confirmed', cookie: `sessionid=${sessionid};` }
    }
    if (st === 'scanned') return { status: 'scanned' }
    if (payload.data?.error_code && payload.data.error_code !== 0 && !st) return { status: 'expired' }
    return { status: 'waiting' }
  }

  async search(keyword: string, limit = 12): Promise<Track[]> {
    const res = await sidecarFetch(
      `/api/v1/music/search?q=${encodeURIComponent(keyword)}&type=song&sources=soda`
    )
    const body = (await res.json()) as { data?: { songs?: SodaSong[] } }
    return (body.data?.songs ?? []).slice(0, limit).map(toTrack)
  }

  /** 取播放链接：sidecar 解密代理流（支持 Range，节拍检测可用）。
   *  部分曲目 sidecar 解密会 502，inspect 又探不出来——必须对真流做 Range 探测，
   *  否则死流交给 <audio> 才爆 code=4，用户看到"播放成功却说失败"。 */
  async songUrl(id: string): Promise<{ url: string | null; trial: boolean }> {
    const streamUrl = `http://127.0.0.1:${SIDECAR_PORT}/api/v1/music/stream?source=soda&id=${encodeURIComponent(id)}`
    try {
      const res = await fetch(streamUrl, {
        headers: { Range: 'bytes=0-1' },
        signal: AbortSignal.timeout(12_000)
      })
      // 消费掉连接（探测流不交给播放器）
      void res.body?.cancel()
      if (res.status !== 200 && res.status !== 206) return { url: null, trial: false }
    } catch {
      return { url: null, trial: false }
    }
    return { url: streamUrl, trial: false }
  }

  /** 汽水搜索结果自带元数据；按 id 回查用分享链接解析（并行，失败忽略） */
  async songDetail(ids: string[]): Promise<Track[]> {
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const res = await sidecarFetch(
          `/api/v1/music/search?q=${encodeURIComponent(`https://www.qishui.com/track/${id}`)}`
        )
        const body = (await res.json()) as { data?: { songs?: SodaSong[] } }
        const s = body.data?.songs?.[0]
        return s ? toTrack(s) : null
      })
    )
    const out: Track[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) out.push(r.value)
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
      const list = await this.search(q, 12)
      // VIP 曲目流经常取不到：非 VIP 优先，避免「随机来一首」连续跳歌
      const free = list.filter((t) => !t.vip)
      return free.length >= 3 ? free : list
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
