// 应用图标生成：大肥鱼 sheet 首帧(idle) → 1024x1024 圆角渐变底（奶油→珊瑚）
import { deflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from './lib-png.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHEET = join(root, 'src/renderer/public/characters/dafeiyu/sheet.png')
const CELL = 128

const img = decodePng(readFileSync(SHEET))
if (img.width < CELL) throw new Error('sheet too small')

const SIZE = 1024
const RADIUS = 232
const TOP = [255, 246, 235]
const BOT = [255, 158, 120]
const rgba = Buffer.alloc(SIZE * SIZE * 4)
const inRounded = (x, y) => {
  const r = RADIUS
  if (x >= r && x <= SIZE - r) return true
  if (y >= r && y <= SIZE - r) return true
  const dx = Math.min(x, SIZE - x)
  const dy = Math.min(y, SIZE - y)
  return (dx - r) ** 2 + (dy - r) ** 2 <= r * r
}
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4
    if (!inRounded(x, y)) continue
    const t = y / SIZE
    rgba[i] = Math.round(TOP[0] + (BOT[0] - TOP[0]) * t)
    rgba[i + 1] = Math.round(TOP[1] + (BOT[1] - TOP[1]) * t)
    rgba[i + 2] = Math.round(TOP[2] + (BOT[2] - TOP[2]) * t)
    rgba[i + 3] = 255
  }
}

// 首帧贴纸：7.5x 放大到 960，居中
const SCALE = 7.5
const dw = Math.round(CELL * SCALE)
const OFF = Math.floor((SIZE - dw) / 2)
for (let y = 0; y < dw; y++) {
  const sy = Math.min(CELL - 1, Math.floor(y / SCALE))
  for (let x = 0; x < dw; x++) {
    const sx = Math.min(CELL - 1, Math.floor(x / SCALE))
    const si = (sy * img.width + sx) * 4
    const a = img.rgba[si + 3]
    if (a === 0) continue
    const di = ((OFF + y) * SIZE + OFF + x) * 4
    const da = a / 255
    rgba[di] = Math.round(img.rgba[si] * da + rgba[di] * (1 - da))
    rgba[di + 1] = Math.round(img.rgba[si + 1] * da + rgba[di + 1] * (1 - da))
    rgba[di + 2] = Math.round(img.rgba[si + 2] * da + rgba[di + 2] * (1 - da))
    rgba[di + 3] = 255
  }
}

writeFileSync(join(root, 'build', 'icon.png'), encodePng(SIZE, SIZE, rgba))
console.log('✓ build/icon.png (1024x1024, dafeiyu)')
