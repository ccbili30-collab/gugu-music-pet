import { ipcMain, app } from 'electron'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface PackSummary {
  id: string
  name: string
  version: string
}

/** 扫描可用角色包（dev 与打包后路径不同） */
export function listPacks(): PackSummary[] {
  const dir = join(
    app.getAppPath(),
    app.isPackaged ? 'out/renderer/characters' : 'src/renderer/public/characters'
  )
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        try {
          const pack = JSON.parse(readFileSync(join(dir, d.name, 'pack.json'), 'utf8'))
          return { id: pack.id ?? d.name, name: pack.name ?? d.name, version: pack.version ?? '' }
        } catch {
          return null
        }
      })
      .filter((p): p is PackSummary => p !== null)
  } catch {
    return []
  }
}

export function registerPacksIpc(): void {
  ipcMain.handle('packs:list', () => listPacks())
}
