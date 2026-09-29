// 像素图标烘焙：scripts/pixel-icons.mjs → src/renderer/public/icons/<id>.png（32x32，2x）
// PNG 编码器与 bake-packs.mjs 同款（RGBA8 + filter 0）
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ICONS, PALETTE } from './pixel-icons.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'src/renderer/public/icons')

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

const hexToRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const SCALE = 2 // 16 网格 → 32px，Retina 下显示 16px 清晰

mkdirSync(OUT, { recursive: true })
for (const [id, grid] of Object.entries(ICONS)) {
  if (grid.length !== 16 || grid.some((l) => l.length !== 16)) {
    console.error(`✗ ${id}: 网格必须是 16x16`)
    process.exit(1)
  }
  const size = 16 * SCALE
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const ch = grid[y][x]
      if (ch === '.') continue
      const hex = PALETTE[ch]
      if (!hex) {
        console.error(`✗ ${id}(${y},${x}): 未知调色板字符 '${ch}'`)
        process.exit(1)
      }
      const [r, g, b] = hexToRgb(hex)
      for (let py = 0; py < SCALE; py++) {
        for (let px = 0; px < SCALE; px++) {
          const i = ((y * SCALE + py) * size + x * SCALE + px) * 4
          rgba[i] = r
          rgba[i + 1] = g
          rgba[i + 2] = b
          rgba[i + 3] = 255
        }
      }
    }
  }
  writeFileSync(join(OUT, `${id}.png`), encodePng(size, size, rgba))
  console.log(`✓ ${id}.png`)
}
console.log(`icons → ${OUT}`)
