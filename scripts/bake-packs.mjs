// 通用角色包烘焙器：characters/<id>/source.json -> renderer/public/characters/<id>/{sheet.png, pack.json}
// 纯 Node 实现（node:zlib + 手写 PNG 编码），无外部依赖。托盘图标由 pigeon idle 帧生成。
import { deflateSync } from 'node:zlib'
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = join(root, 'characters')
const OUT_BASE = join(root, 'src/renderer/public/characters')
const BUILD = join(root, 'build')

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
const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
]

function groundRowOf(grid, transparent) {
  let ground = 0
  grid.forEach((line, y) => {
    if (line.includes('L')) ground = y
  })
  if (ground === 0) {
    for (let y = grid.length - 1; y >= 0; y--) {
      if (grid[y].split('').some((c) => c !== transparent)) return y
    }
  }
  return ground
}

function bake(id) {
  const src = JSON.parse(readFileSync(join(SRC_DIR, id, 'source.json'), 'utf8'))
  const { palette, frames, sprite, slots, fallbacks } = src
  const width = src.width ?? 16
  const height = src.height ?? 16
  const transparent = src.transparent ?? '.'
  const names = Object.keys(frames)

  // 校验
  for (const [name, grid] of Object.entries(frames)) {
    if (grid.length !== height) throw new Error(`${id}/${name}: 期望 ${height} 行，实际 ${grid.length}`)
    grid.forEach((line, i) => {
      if (line.length !== width) throw new Error(`${id}/${name} 第 ${i} 行宽度 ${line.length} ≠ ${width}`)
    })
  }
  // mirrorOf 槽位必须存在
  for (const [slot, def] of Object.entries(slots)) {
    if (def.mirrorOf && !slots[def.mirrorOf]) throw new Error(`${id}/${slot}: mirrorOf "${def.mirrorOf}" 不存在`)
  }

  const RGB = Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, hexToRgb(v)]))
  const sheet = Buffer.alloc(names.length * width * height * 4)
  const frameMeta = {}
  names.forEach((name, i) => {
    frames[name].forEach((line, y) => {
      for (let x = 0; x < width; x++) {
        const ch = line[x]
        const px = (y * names.length * width + i * width + x) * 4
        const rgb = RGB[ch]
        if (ch === transparent || !rgb) {
          sheet[px + 3] = 0
          continue
        }
        sheet[px] = rgb[0]
        sheet[px + 1] = rgb[1]
        sheet[px + 2] = rgb[2]
        sheet[px + 3] = 255
      }
    })
    frameMeta[name] = { index: i, groundRow: groundRowOf(frames[name], transparent) }
  })

  const out = join(OUT_BASE, id)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'sheet.png'), encodePng(names.length * width, height, sheet))

  const pack = {
    id: src.id ?? id,
    name: src.name ?? id,
    version: src.version ?? '1.0.0',
    type: 'frames',
    author: src.author ?? '',
    sprite: { image: 'sheet.png', frameSize: [width, height], scale: sprite?.scale ?? 6 },
    frames: frameMeta,
    slots,
    fallbacks: fallbacks ?? {}
  }
  writeFileSync(join(out, 'pack.json'), JSON.stringify(pack, null, 2))
  console.log(`✓ ${id}: ${names.length} 帧 -> ${out}`)
  return { pack, frames, width, height, transparent }
}

let first = null
for (const entry of readdirSync(SRC_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  try {
    readFileSync(join(SRC_DIR, entry.name, 'source.json'))
  } catch {
    continue
  }
  const baked = bake(entry.name)
  if (!first) first = baked
}

// 托盘图标（用第一个角色的 idle 第一帧做黑色剪影 template）
if (first) {
  const { frames, width, height, transparent } = first
  const grid = frames[Object.keys(frames)[0]]
  const bakeTray = (size) => {
    const img = Buffer.alloc(size * size * 4)
    const scale = size / width
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const ch = grid[Math.floor(y / scale)]?.[Math.floor(x / scale)]
        const px = (y * size + x) * 4
        if (ch && ch !== transparent) {
          img[px] = 0; img[px + 1] = 0; img[px + 2] = 0; img[px + 3] = 255
        }
      }
    }
    return encodePng(size, size, img)
  }
  mkdirSync(BUILD, { recursive: true })
  writeFileSync(join(BUILD, 'trayTemplate.png'), bakeTray(16))
  writeFileSync(join(BUILD, 'trayTemplate@2x.png'), bakeTray(32))
  console.log('✓ tray icons')
}
