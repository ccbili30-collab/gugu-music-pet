// 烘焙鸽子角色包：frames.json -> spritesheet PNG + pack.json + 托盘图标
// 纯 Node 实现（node:zlib + 手写 PNG 编码），无任何外部依赖
import { deflateSync } from 'node:zlib'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = JSON.parse(readFileSync(join(root, 'characters/pigeon/frames.json'), 'utf8'))
const OUT = join(root, 'src/renderer/public/characters/pigeon')
const BUILD = join(root, 'build')
mkdirSync(OUT, { recursive: true })
mkdirSync(BUILD, { recursive: true })

const { width: FW, height: FH, palette, frames } = src
const FRAME_ORDER = Object.keys(frames)

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
const RGB = Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, hexToRgb(v)]))

// ---- 最小 PNG 编码器（RGBA8，filter 0） ----
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
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---- 精灵图：所有帧横向排布 ----
const sheet = Buffer.alloc(FRAME_ORDER.length * FW * FH * 4)
const groundRows = {}
FRAME_ORDER.forEach((name, i) => {
  const grid = frames[name]
  let ground = 0
  grid.forEach((line, y) => {
    for (let x = 0; x < FW; x++) {
      const ch = line[x]
      const px = (y * FRAME_ORDER.length * FW + i * FW + x) * 4
      if (ch === '.' || !RGB[ch]) {
        sheet[px + 3] = 0
        continue
      }
      const [r, g, b] = RGB[ch]
      sheet[px] = r
      sheet[px + 1] = g
      sheet[px + 2] = b
      sheet[px + 3] = 255
    }
    if (line.includes('L')) ground = y
  })
  if (ground === 0) {
    for (let y = FH - 1; y >= 0; y--) {
      if (frames[name][y].split('').some((c) => c !== '.')) { ground = y; break }
    }
  }
  groundRows[name] = ground
})
writeFileSync(join(OUT, 'sheet.png'), encodePng(FRAME_ORDER.length * FW, FH, sheet))
console.log(`sheet.png: ${FRAME_ORDER.length} frames, ${FRAME_ORDER.length * FW}x${FH}`)

// ---- pack.json ----
const frameIndex = Object.fromEntries(FRAME_ORDER.map((n, i) => [n, { index: i, groundRow: groundRows[n] }]))
const pack = {
  id: 'pigeon',
  name: '咕咕',
  version: '1.0.0',
  type: 'frames',
  author: 'gugu legacy revival',
  sprite: { image: 'sheet.png', frameSize: [FW, FH], scale: 6 },
  frames: frameIndex,
  slots: {
    idle: { frames: ['idle1', 'idle2'], fps: 2, loop: true },
    stand: { frames: ['stand1', 'stand2'], fps: 1.5, loop: true },
    walk_right: { frames: ['walk_right1', 'walk_right2'], fps: 6, loop: true },
    walk_left: { frames: ['walk_left1', 'walk_left2'], fps: 6, loop: true },
    fly_right: { frames: ['fly_right1', 'fly_right2'], fps: 10, loop: true },
    fly_left: { frames: ['fly_left1', 'fly_left2'], fps: 10, loop: true },
    sit: { frames: ['sit'], fps: 1, loop: true },
    sleep: { frames: ['sleep'], fps: 1, loop: true },
    peck: { frames: ['peck', 'stand1'], fps: 2, loop: true },
    hum: { frames: ['sit', 'sleep'], fps: 0.4, loop: true }
  },
  // 动作槽位兜底链：缺失槽位按此映射，最终落到 idle
  fallbacks: {
    dance: 'idle',
    happy: 'idle',
    hurt: 'idle',
    drag: 'fly_right',
    peck: 'idle'
  }
}
writeFileSync(join(OUT, 'pack.json'), JSON.stringify(pack, null, 2))
console.log('pack.json written')

// ---- 托盘图标（macOS template 图像，黑色剪影 + @2x） ----
function bakeTray(size) {
  const img = Buffer.alloc(size * size * 4)
  const scale = size / FW
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / scale)
      const gy = Math.floor(y / scale)
      const ch = frames['idle1'][gy]?.[gx]
      const px = (y * size + x) * 4
      if (ch && ch !== '.') {
        img[px] = 0; img[px + 1] = 0; img[px + 2] = 0; img[px + 3] = 255
      }
    }
  }
  return encodePng(size, size, img)
}
writeFileSync(join(BUILD, 'trayTemplate.png'), bakeTray(16))
writeFileSync(join(BUILD, 'trayTemplate@2x.png'), bakeTray(32))
console.log('tray icons written')
