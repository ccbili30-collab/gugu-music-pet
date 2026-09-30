export interface BubbleData {
  id: number
  kind: 'say' | 'hum' | 'comment' | 'resonance' | 'invite'
  text?: string
  kaomoji?: string
  born: number
  ttl: number
}

export type BusEvents = {
  bubble: BubbleData
  openChat: undefined
  pack: { id: string }
  trackChange: { name: string; artists: string; trial: boolean }
  hotComments: undefined
}

type Handler<K extends keyof BusEvents> = (payload: BusEvents[K]) => void

/** 渲染层内部事件总线（引擎 → React overlay） */
export class Bus {
  private handlers = new Map<string, Set<(payload: never) => void>>()

  on<K extends keyof BusEvents>(key: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(key)
    if (!set) {
      set = new Set()
      this.handlers.set(key, set)
    }
    const cast = fn as (payload: never) => void
    set.add(cast)
    return () => {
      set?.delete(cast)
    }
  }

  emit<K extends keyof BusEvents>(key: K, payload: BusEvents[K]): void {
    const set = this.handlers.get(key)
    if (set) for (const fn of set) (fn as Handler<K>)(payload)
  }
}

export const bus = new Bus()

let nextBubbleId = 1
export function makeBubble(data: Omit<BubbleData, 'id' | 'born'> & { ttl?: number }): BubbleData {
  return { id: nextBubbleId++, born: Date.now(), ...data, ttl: data.ttl ?? 6000 }
}
