import { Assets, Rectangle, Texture } from 'pixi.js'
import type { CharacterPack, PackFrameInfo } from './types'

export interface LoadedPack {
  pack: CharacterPack
  textures: Map<string, Texture>
  frameInfo: Map<string, PackFrameInfo>
  frameSize: [number, number]
  scale: number
}

/** 加载帧动画角色包（pack.json + 精灵图）。type: spine 预留扩展。 */
export async function loadPack(id: string): Promise<LoadedPack> {
  const res = await fetch(`characters/${id}/pack.json`)
  if (!res.ok) throw new Error(`pack ${id} not found: ${res.status}`)
  const pack = (await res.json()) as CharacterPack
  if (pack.type !== 'frames') throw new Error(`pack type "${pack.type}" not supported yet`)

  const base = (await Assets.load(`characters/${id}/${pack.sprite.image}`)) as Texture
  base.source.scaleMode = 'nearest'

  const [fw, fh] = pack.sprite.frameSize
  const textures = new Map<string, Texture>()
  const frameInfo = new Map<string, PackFrameInfo>()
  for (const [name, info] of Object.entries(pack.frames)) {
    textures.set(
      name,
      new Texture({ source: base.source, frame: new Rectangle(info.index * fw, 0, fw, fh) })
    )
    frameInfo.set(name, info)
  }
  return { pack, textures, frameInfo, frameSize: [fw, fh], scale: pack.sprite.scale }
}
