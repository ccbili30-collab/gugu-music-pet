// 宠物出生点：默认屏幕角落，记住上次位置
import { ipcMain, app, screen } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const posFile = (): string => join(app.getPath('userData'), 'pet-pos.json')

function defaultCorner(): { x: number; y: number } {
  const wa = screen.getPrimaryDisplay().workArea
  return { x: wa.x + wa.width - 110, y: wa.y + wa.height - 12 }
}

export function registerSpawnIpc(): void {
  ipcMain.handle('pet:spawn:get', () => {
    try {
      const saved = JSON.parse(readFileSync(posFile(), 'utf8')) as { x: number; y: number }
      if (typeof saved.x === 'number' && typeof saved.y === 'number') return saved
    } catch {
      /* 无存档 */
    }
    return defaultCorner()
  })
  ipcMain.on('pet:spawn:save', (_e, x: number, y: number) => {
    try {
      writeFileSync(posFile(), JSON.stringify({ x, y }))
    } catch {
      /* 忽略 */
    }
  })
}
