import { Assets, Rectangle, Texture } from 'pixi.js'
import type { CharacterPack, PackFrameInfo } from './types'

export interface LoadedPack {
  pack: CharacterPack
  textures: Map<string, Texture>
  frameInfo: Map<string, PackFrameInfo>
  frameSize: [number, number]
  scale: number
}

/** 加载帧动画角色包（pack.json + 精灵图）。type: spine 预留扩展。
 *  查找顺序：内置 characters/<id>/（fetch 相对路径）→ 用户导入包 gugu-pack://<id>/（userData）。 */
export async function loadPack(id: string): Promise<LoadedPack> {
  let res = await fetch(`characters/${id}/pack.json`)
  let baseUrl = `characters/${id}/`
  if (!res.ok) {
    res = await fetch(`gugu-pack://${id}/pack.json`)
    baseUrl = `gugu-pack://${id}/`
  }
  if (!res.ok) throw new Error(`pack ${id} not found: ${res.status}`)
  const pack = (await res.json()) as CharacterPack
  if (pack.type !== 'frames') throw new Error(`pack type "${pack.type}" not supported yet`)

  const base = (await Assets.load(`${baseUrl}${pack.sprite.image}`)) as Texture
  // 像素包用 nearest 保锐利；照片/贴纸包（pixel:false）用 linear
  base.source.scaleMode = pack.pixel === false ? 'linear' : 'nearest'

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
