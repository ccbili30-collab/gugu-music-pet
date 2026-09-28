// 应用图标生成：pigeon idle 帧 → 1024x1024 圆角方块背景 + 像素鸽子（nearest-neighbor 放大）
// 纯 Node 实现，PNG 编码器与 bake-packs.mjs 同款（RGBA8 + filter 0）
import { deflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ---- PNG 编码（与 bake-packs.mjs 一致） ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(width, height, rgba) {
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

// ---- 像素画上色 ----
const src = JSON.parse(readFileSync(join(root, 'characters/pigeon/source.json'), 'utf8'))
const grid = src.frames.idle1
const palette = src.palette
const hexToRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const rgbOf = Object.fromEntries(Object.entries(palette).map(([k, hex]) => [k, hexToRgb(hex)]))

const SIZE = 1024
const RADIUS = 232
// 16px 网格 → 704px 鸽子（44 倍），四周留 160px 边距
const CELL = 44
const OFF = Math.floor((SIZE - grid.length * CELL) / 2)

// 渐变背景（浅紫 → 品牌紫，与 UI 一致），圆角外透明
const rgba = Buffer.alloc(SIZE * SIZE * 4)
const TOP = [244, 242, 255]
const BOT = [138, 122, 232]
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

// 鸽子像素（白色描边效果：先偏移画一圈深色再画本体？简化：直接画本体 + 脚爪已含 L 色）
for (let gy = 0; gy < grid.length; gy++) {
  const line = grid[gy]
  for (let gx = 0; gx < line.length; gx++) {
    const ch = line[gx]
    if (ch === '.') continue
    const [r, g, b] = rgbOf[ch] ?? [0, 0, 0]
    for (let py = 0; py < CELL; py++) {
      for (let px = 0; px < CELL; px++) {
        const x = OFF + gx * CELL + px
        const y = OFF + gy * CELL + py
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue
        const i = (y * SIZE + x) * 4
        rgba[i] = r
        rgba[i + 1] = g
        rgba[i + 2] = b
        rgba[i + 3] = 255
      }
    }
  }
}

writeFileSync(join(root, 'build', 'icon.png'), encodePng(SIZE, SIZE, rgba))
console.log('✓ build/icon.png (1024x1024)')
