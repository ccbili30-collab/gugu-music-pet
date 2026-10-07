// 自定义宠物导入：用户选一组图片 → 软抠白 + 组 sheet → userData/characters/custom-*/（gugu-pack:// 协议供渲染层加载）
import { app, dialog, nativeImage } from 'electron'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

const CELL = 128
const TARGET_H = 108

// ---- PNG 编码（RGBA8 filter0，与 scripts/lib-png 同款）----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** 洪水填充抠白底（与 scripts/bake-image-pack.mjs 同算法）：
 *  只抠与四边连通的背景白，内部白色保留；2 轮近白蚀刻 + 3x3 边界羽化。 */
function floodKeyWhite(rgba: Buffer, w: number, h: number): void {
  const nearWhite = (i: number, tol: number): boolean => rgba[i] >= tol && rgba[i + 1] >= tol && rgba[i + 2] >= tol
  const bg = new Uint8Array(w * h)
  const queue: number[] = []
  const push = (x: number, y: number): void => {
    const p = y * w + x
    if (!bg[p] && nearWhite(p * 4, 235)) {
      bg[p] = 1
      queue.push(p)
    }
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  while (queue.length) {
    const p = queue.pop() as number
    const x = p % w
    const y = (p / w) | 0
    if (x > 0) push(x - 1, y)
    if (x < w - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < h - 1) push(x, y + 1)
  }
  for (let round = 0; round < 2; round++) {
    const add: number[] = []
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x
        if (bg[p] || !nearWhite(p * 4, 214)) continue
        const n = (bg[p - 1] ? 1 : 0) + (bg[p + 1] ? 1 : 0) + (bg[p - w] ? 1 : 0) + (bg[p + w] ? 1 : 0)
        if (n >= 2) add.push(p)
      }
    }
    if (!add.length) break
    for (const p of add) bg[p] = 1
  }
  const alpha = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) alpha[p] = bg[p] ? 0 : 255
  const feathered = Uint8Array.from(alpha)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x
      if (alpha[p] === 255 && (bg[p - 1] || bg[p + 1] || bg[p - w] || bg[p + w])) {
        let sum = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += alpha[p + dy * w + dx]
        feathered[p] = Math.round(sum / 9)
      }
    }
  }
  for (let p = 0; p < w * h; p++) rgba[p * 4 + 3] = feathered[p]
}

function contentBox(rgba: Buffer, w: number, h: number): { x0: number; y0: number; w: number; h: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

export interface ImportResult {
  ok: boolean
  id?: string
  count?: number
  error?: string
}

/** 打开图片选择对话框并烘焙为自定义宠物包 */
export async function importCustomPack(): Promise<ImportResult> {
  const r = await dialog.showOpenDialog({
    title: '选择宠物图片（可多选，白底/透明底均可）',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
  })
  if (r.canceled || !r.filePaths.length) return { ok: false, error: 'canceled' }

  const cells: { w: number; h: number; rgba: Buffer }[] = []
  for (const fp of r.filePaths.slice(0, 12)) {
    try {
      let img = nativeImage.createFromPath(fp)
      if (img.isEmpty()) continue
      // 预缩到目标高度内（resize 只给 height 时按比例）
      const size = img.getSize()
      if (size.height > 320) img = img.resize({ height: 320 })
      const bmp = img.toBitmap({ scaleFactor: 1 })
      const { width: w, height: h } = img.getSize()
      // BGRA → RGBA + 软抠白
      const rgba = Buffer.from(bmp)
      for (let i = 0; i < rgba.length; i += 4) {
        const b = rgba[i]
        rgba[i] = rgba[i + 2]
        rgba[i + 2] = b
      }
      floodKeyWhite(rgba, w, h)
      const box = contentBox(rgba, w, h)
      if (!box) continue
      const scale = Math.min(TARGET_H / box.h, (CELL - 12) / box.w, 1.5)
      const dw = Math.max(1, Math.round(box.w * scale))
      const dh = Math.max(1, Math.round(box.h * scale))
      const cell = Buffer.alloc(dw * dh * 4)
      for (let y = 0; y < dh; y++) {
        const sy = Math.min(box.h - 1, Math.floor((y * box.h) / dh))
        for (let x = 0; x < dw; x++) {
          const sx = Math.min(box.w - 1, Math.floor((x * box.w) / dw))
          rgba.copy(cell, (y * dw + x) * 4, ((box.y0 + sy) * w + box.x0 + sx) * 4, ((box.y0 + sy) * w + box.x0 + sx) * 4 + 4)
        }
      }
      cells.push({ w: dw, h: dh, rgba: cell })
    } catch {
      /* 单张失败跳过 */
    }
  }
  if (!cells.length) return { ok: false, error: '没有可用图片' }

  const sheetW = CELL * cells.length
  const sheet = Buffer.alloc(sheetW * CELL * 4)
  cells.forEach((c, i) => {
    const ox = i * CELL + Math.floor((CELL - c.w) / 2)
    const oy = CELL - 8 - c.h
    for (let y = 0; y < c.h; y++) {
      c.rgba.copy(sheet, ((oy + y) * sheetW + ox) * 4, y * c.w * 4, (y + 1) * c.w * 4)
    }
  })

  const frames: Record<string, { index: number; groundRow: number }> = {}
  const frameNames: string[] = []
  cells.forEach((_, i) => {
    const name = `idle_${i}`
    frames[name] = { index: i, groundRow: CELL - 9 }
    frameNames.push(name)
  })
  const id = `custom-${Date.now().toString(36)}`
  const pack = {
    id,
    name: `自定义 ${cells.length} 帧`,
    version: '1.0.0',
    type: 'frames' as const,
    pixel: false,
    sprite: { image: 'sheet.png', frameSize: [CELL, CELL], scale: 0.78 },
    frames,
    slots: { idle: { frames: frameNames, fps: 0.7, loop: true } },
    fallbacks: {}
  }

  const dir = join(app.getPath('userData'), 'characters', id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'sheet.png'), encodePng(sheetW, CELL, sheet))
  writeFileSync(join(dir, 'pack.json'), JSON.stringify(pack, null, 2))
  return { ok: true, id, count: cells.length }
}
