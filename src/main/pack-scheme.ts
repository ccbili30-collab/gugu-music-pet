// gugu-pack://<id>/<file>：服务 userData/characters 下的自定义宠物包
import { protocol } from 'electron'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const PACK_SCHEME = 'gugu-pack'

/** 必须在 app ready 之前调用 */
export function registerPackScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PACK_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
    }
  ])
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.json': 'application/json'
}

export function handlePackProtocol(): void {
  protocol.handle(PACK_SCHEME, (request) => {
    const url = new URL(request.url)
    const id = url.hostname.replace(/[^a-z0-9-]/gi, '')
    const file = decodeURIComponent(url.pathname.replace(/^\/+/, '')).replace(/[/\\]|\.\./g, '')
    if (!id || !file) return new Response('bad request', { status: 400 })
    const path = join(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('electron').app.getPath('userData'),
      'characters',
      id,
      file
    )
    if (!existsSync(path)) return new Response('not found', { status: 404 })
    const mime = MIME[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream'
    return new Response(new Uint8Array(readFileSync(path)), {
      headers: { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' }
    })
  })
}
