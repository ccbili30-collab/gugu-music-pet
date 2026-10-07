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
// 格子自适应：按最大原图边长取整到 16 的倍数（+16 余量）——原图直出，零压缩
let CELL = 448

/** 洪水填充抠白底：只抠与四边连通的近白背景，内部白色（高光/装饰）完整保留。
 *  边缘做 2 轮近白蚀刻吃掉 JPEG 白晕，再对边界带做 3x3 alpha 羽化。 */
function floodKeyWhite(rgba, w, h) {
  const nearWhite = (i, tol) => rgba[i] >= tol && rgba[i + 1] >= tol && rgba[i + 2] >= tol
  const bg = new Uint8Array(w * h)
  const queue = []
  // 种子：四边的近白像素
  const push = (x, y) => {
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
    const p = queue.pop()
    const x = p % w
    const y = (p / w) | 0
    if (x > 0) push(x - 1, y)
    if (x < w - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < h - 1) push(x, y + 1)
  }
  // 边缘蚀刻 ×2：贴着背景的近白像素（JPEG 白晕）划归背景
  for (let round = 0; round < 2; round++) {
    const add = []
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x
        if (bg[p]) continue
        if (!nearWhite(p * 4, 214)) continue
        const n = (bg[p - 1] ? 1 : 0) + (bg[p + 1] ? 1 : 0) + (bg[p - w] ? 1 : 0) + (bg[p + w] ? 1 : 0)
        if (n >= 2) add.push(p)
      }
    }
    if (!add.length) break
    for (const p of add) bg[p] = 1
  }
  // alpha：背景 0 / 内容 255；边界带 3x3 羽化
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
  floodKeyWhite(img.rgba, img.width, img.height)
  return img
}

/** 区域平均重采样（box filter，预乘 alpha）——缩小无锯齿、透明边缘颜色正确 */
function scaleRgba(src, srcW, srcH, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 4)
  for (let y = 0; y < dstH; y++) {
    const y0 = (y * srcH) / dstH
    const y1 = ((y + 1) * srcH) / dstH
    for (let x = 0; x < dstW; x++) {
      const x0 = (x * srcW) / dstW
      const x1 = ((x + 1) * srcW) / dstW
      let cr = 0, cg = 0, cb = 0, ca = 0, area = 0
      for (let sy = Math.floor(y0); sy < Math.min(srcH, Math.ceil(y1)); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy)
        for (let sx = Math.floor(x0); sx < Math.min(srcW, Math.ceil(x1)); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx)
          const wgt = wx * wy
          const i = (sy * srcW + sx) * 4
          const a = src[i + 3] / 255
          cr += src[i] * a * wgt
          cg += src[i + 1] * a * wgt
          cb += src[i + 2] * a * wgt
          ca += src[i + 3] * wgt
          area += wgt
        }
      }
      const di = (y * dstW + x) * 4
      if (ca > 0.0001) {
        // cr 是预乘累加（a∈[0,1]），ca 是 alpha 原值累加（0-255）：反预乘要 ×255
        out[di] = Math.min(255, Math.round((255 * cr) / ca))
        out[di + 1] = Math.min(255, Math.round((255 * cg) / ca))
        out[di + 2] = Math.min(255, Math.round((255 * cb) / ca))
        out[di + 3] = Math.round(ca / area)
      }
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
      const scale = Math.min((CELL - 12) / box.h, (CELL - 12) / box.w, 1)
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
  sprite: { image: 'sheet.png', frameSize: [CELL, CELL], scale: 104 / CELL },
  frames,
  slots,
  fallbacks: { dance: 'idle', happy: 'idle', hurt: 'idle', peck: 'idle', hum: 'sit', walk_left: 'idle', fly_left: 'idle' }
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'sheet.png'), encodePng(sheetW, CELL, sheet))
writeFileSync(join(OUT, 'pack.json'), JSON.stringify(pack, null, 2))
console.log(`✓ ${id}: ${cells.length} 帧 ${slots.idle.frames.length} 槽位 → ${OUT}`)
