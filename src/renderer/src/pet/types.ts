export type SlotName =
  | 'idle'
  | 'stand'
  | 'walk_right'
  | 'walk_left'
  | 'fly_right'
  | 'fly_left'
  | 'sit'
  | 'sleep'
  | 'peck'
  | 'hum'
  | 'dance'
  | 'happy'
  | 'hurt'
  | 'drag'

export interface PackSlot {
  frames?: string[]
  /** 复用另一槽位的帧并水平镜像（如 walk_left = mirrorOf walk_right） */
  mirrorOf?: string
  fps?: number
  loop?: boolean
}

export interface PackInfo {
  id: string
  name: string
  version: string
}

export interface PackFrameInfo {
  index: number
  groundRow: number
}

export interface CharacterPack {
  id: string
  name: string
  version: string
  type: 'frames' | 'spine'
  sprite: { image: string; frameSize: [number, number]; scale: number }
  frames: Record<string, PackFrameInfo>
  slots: Partial<Record<SlotName, PackSlot>>
  fallbacks: Record<string, string>
}

/** 宠物周围 UI 布局（窗口本地坐标，与主进程 PET_WINDOW 对应） */
export const LAYOUT = {
  windowW: 560,
  windowH: 420,
  anchorX: 250,
  anchorY: 316,
  petW: 96,
  petH: 96
}

export type PhysMode = 'ground' | 'drag' | 'ballistic' | 'flyto' | 'hover'
