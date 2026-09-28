// music:// 流代理：把网易云 CDN 的音频流转发给渲染层 <audio>，
// 消除 CORS 限制（Web Audio AnalyserNode 需要干净的源）
import { protocol } from 'electron'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

export const MUSIC_SCHEME = 'music'

/** 必须在 app ready 之前调用 */
export function registerMusicScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MUSIC_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

export function proxyStreamUrl(remoteUrl: string): string {
  return `${MUSIC_SCHEME}://stream/${encodeURIComponent(remoteUrl)}`
}

export function handleMusicProtocol(): void {
  protocol.handle(MUSIC_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'stream') {
      return new Response('not found', { status: 404 })
    }
    const target = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    if (!/^https?:\/\//.test(target)) {
      return new Response('bad url', { status: 400 })
    }
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Referer: 'https://music.163.com/'
    }
    const range = request.headers.get('range')
    if (range) headers.Range = range
    try {
      // 用 undici 的 global fetch（不走 Chromium net 栈，避免 ERR_BLOCKED_BY_CLIENT）
      const res = await fetch(target, { headers, redirect: 'follow' })
      const outHeaders: Record<string, string> = {
        'Access-Control-Allow-Origin': '*'
      }
      for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
        const v = res.headers.get(key)
        if (v) outHeaders[key] = v
      }
      if (res.status === 206 && !outHeaders['content-range'] && range) {
        outHeaders['content-range'] = `bytes */*`
      }
      return new Response(res.body, { status: res.status, headers: outHeaders })
    } catch (err) {
      return new Response(`proxy error: ${String(err)}`, { status: 502 })
    }
  })
}
