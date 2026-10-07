// 图片贴纸包烘焙器：characters/<id>/stickers/（jpg/png 任意命名，sips 预转 png）
// → 软抠白底 + 裁内容 bbox + 等比缩放 + 底对齐组 128x128 横排 sheet + pack.json（photo 系，linear 采样）
// 用法：node scripts/bake-image-pack.mjs <id>
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng, decodePng } from './lib-png.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const id = process.argv[2] ?? 'dafeiyu'
const SRC = join(root, 'characters', id, 'stickers')
const OUT = join(root, 'src/renderer/public/characters', id)
const CELL = 128
const TARGET_H = 108 // 内容最大高度，底部留白 6px 触地

/** 软抠白：离纯白越远越实，纯白全透（保留贴纸白描边为柔边） */
function softKeyWhite(rgba, t1 = 26, t2 = 90) {
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2]
    const d = Math.max(255 - r, 255 - g, 255 - b) // 与白色的最大通道距离
    const a = d <= t1 ? 0 : d >= t2 ? 1 : (d - t1) / (t2 - t1)
    rgba[i + 3] = Math.round(rgba[i + 3] * a)
  }
}

/** 内容 bbox（alpha>16） */
function contentBox(img) {
  const { width, height, rgba } = img
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

function loadSticker(file) {
  // sips 归一化为 PNG（解码器只吃 PNG）
  const pngPath = file.replace(/\.(jpe?g|JPE?G|png|PNG)$/, '') + '.norm.png'
  execFileSync('sips', ['-s', 'format', 'png', file, '--out', pngPath], { stdio: 'ignore' })
  const img = decodePng(readFileSync(pngPath))
  rmSync(pngPath)
  softKeyWhite(img.rgba)
  return img
}

/** 缩放 RGBA（最近邻，贴纸风格可接受；输入已带 alpha） */
function scaleRgba(src, srcW, srcH, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 4)
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH))
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW))
      const si = (sy * srcW + sx) * 4
      const di = (y * dstW + x) * 4
      out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3]
    }
  }
  return out
}

// ---- 槽位映射（dafeiyu 表情 → 动作语义）----
const SLOT_MAP = {
  idle: ['happy/ok', 'see/zhenjing'],
  stand: ['see/zhenjing'],
  walk_right: ['daily/ganfan'],
  walk_left: { mirrorOf: 'walk_right' },
  fly_right: ['happy/piaole'],
  fly_left: { mirrorOf: 'fly_right' },
  sit: ['work/tangping'],
  sleep: ['sleep/shuijiao'],
  hum: ['shy/haixiu'],
  dance: ['happy/deyi', 'like/bixin'],
  happy: ['like/bixin'],
  hurt: ['sad/yun'],
  drag: ['surprised/xia'],
  peck: ['fool/buyao']
}

if (!existsSync(SRC)) {
  console.error(`no stickers dir: ${SRC}`)
  process.exit(1)
}
const files = readdirSync(SRC).filter((f) => /\.(jpe?g|png)$/i.test(f))
// 去重 .norm 残留
const stickers = {}
for (const f of files) {
  const key = f.replace(/\.(jpe?g|png)$/i, '')
  stickers[key] = join(SRC, f)
}

// 解码全部并放入格子
const cells = []
const meta = []
for (const [slot, spec] of Object.entries(SLOT_MAP)) {
  if (!spec) continue
  if (Array.isArray(spec)) {
    for (const name of spec) {
      const base = name.split('/').pop()
      const file = stickers[base]
      if (!file) {
        console.warn(`! missing sticker ${name}`)
        continue
      }
      const img = loadSticker(file)
      const box = contentBox(img)
      if (!box) continue
      const scale = Math.min(TARGET_H / box.h, (CELL - 12) / box.w, 1.2)
      const dw = Math.max(1, Math.round(box.w * scale))
      const dh = Math.max(1, Math.round(box.h * scale))
      const scaled = scaleRgba(
        img.rgba.subarray((box.y0 * img.width + box.x0) * 4).length === 0 ? img.rgba : cropRgba(img, box),
        box.w, box.h, dw, dh
      )
      const idx = cells.length
      cells.push({ w: dw, h: dh, rgba: scaled })
      meta.push({ slot, name, index: idx })
    }
  }
}

function cropRgba(img, box) {
  const out = Buffer.alloc(box.w * box.h * 4)
  for (let y = 0; y < box.h; y++) {
    img.rgba.copy(out, y * box.w * 4, ((box.y0 + y) * img.width + box.x0) * 4, ((box.y0 + y) * img.width + box.x0 + box.w) * 4)
  }
  return out
}

// 组 sheet：底对齐 + 水平居中
const sheetW = CELL * Math.max(1, cells.length)
const sheet = Buffer.alloc(sheetW * CELL * 4)
cells.forEach((c, i) => {
  const ox = i * CELL + Math.floor((CELL - c.w) / 2)
  const oy = CELL - 8 - c.h // 底部留 8px 触地缓冲
  for (let y = 0; y < c.h; y++) {
    c.rgba.copy(sheet, ((oy + y) * sheetW + ox) * 4, y * c.w * 4, (y + 1) * c.w * 4)
  }
})

// pack.json
const slots = {}
const frames = {}
for (const m of meta) {
  const key = `${m.slot}_${m.name.replace(/\//g, '_')}`
  frames[key] = { index: m.index, groundRow: CELL - 9 }
  const slot = slots[m.slot]
  if (slot && Array.isArray(slot.frames)) slot.frames.push(key)
  else slots[m.slot] = { frames: [key], fps: m.slot === 'dance' ? 2.2 : 0.7, loop: true }
}
// mirrorOf 槽
for (const [slot, spec] of Object.entries(SLOT_MAP)) {
  if (spec && !Array.isArray(spec)) slots[slot] = spec
}

const pack = {
  id,
  name: '大肥鱼',
  version: '1.3.0',
  type: 'frames',
  pixel: false,
  sprite: { image: 'sheet.png', frameSize: [CELL, CELL], scale: 0.78 },
  frames,
  slots,
  fallbacks: { dance: 'idle', happy: 'idle', hurt: 'idle', peck: 'idle', hum: 'sit', walk_left: 'idle', fly_left: 'idle' }
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'sheet.png'), encodePng(sheetW, CELL, sheet))
writeFileSync(join(OUT, 'pack.json'), JSON.stringify(pack, null, 2))
console.log(`✓ ${id}: ${cells.length} 帧 ${slots.idle.frames.length} 槽位 → ${OUT}`)
