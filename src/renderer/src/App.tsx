import { useEffect, useRef, useState } from 'react'
import { PetEngine } from './pet/engine'
import { bus, type BubbleData } from './pet/bus'
import { Bubbles } from './overlay/Bubbles'
import { MicOrb } from './overlay/MicOrb'
import { ContextMenu, type MenuItem } from './overlay/ContextMenu'


export default function App(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<PetEngine | null>(null)
  const [bubbles, setBubbles] = useState<BubbleData[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [packs, setPacks] = useState<{ id: string; name: string; version: string }[]>([])
  const [currentPack, setCurrentPack] = useState('pigeon')

  useEffect(() => {
    void window.gugu.packsList().then(setPacks)
    const offPack = bus.on('pack', ({ id }) => setCurrentPack(id))
    return offPack
  }, [])

  useEffect(() => {
    let disposed = false
    void PetEngine.create(hostRef.current as HTMLElement).then((engine) => {
      if (disposed) {
        engine.destroy()
        return
      }
      engineRef.current = engine
    })
    const offMenu = bus.on('menu', (p) => setMenu(p))
    const offClose = bus.on('closeMenu', () => setMenu(null))
    return () => {
      disposed = true
      offMenu()
      offClose()
      engineRef.current?.destroy()
      engineRef.current = null
    }
  }, [])

  // 气泡生命周期
  useEffect(() => {
    if (!bubbles.length) return
    const timers = bubbles.map((b) => window.setTimeout(() => {
      setBubbles((cur) => cur.filter((x) => x.id !== b.id))
    }, b.ttl))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [bubbles])

  useEffect(() => {
    const off = bus.on('bubble', (b) => {
      setBubbles((cur) => [...cur.slice(-1), b])
    })
    return off
  }, [])

  const items: MenuItem[] = [
    { label: '💬 陪我聊聊', onClick: () => window.gugu.openChat() },
    { label: '🚶 走两步', onClick: () => engineRef.current?.walkTo() },
    { label: '🕊️ 飞一圈', onClick: () => engineRef.current?.flyAround() },
    engineRef.current?.isSleeping
      ? { label: '☀️ 叫醒咕咕', onClick: () => engineRef.current?.wake() }
      : { label: '😴 睡觉', onClick: () => engineRef.current?.sleep() },
    ...(packs.length > 1
      ? packs.map((p) => ({
          label: `${p.id === currentPack ? '●' : '○'} 换成 ${p.name}`,
          onClick: () => void engineRef.current?.switchPack(p.id)
        }))
      : []),
    { label: '⚙️ 设置（即将上线）', disabled: true, onClick: () => {} },
    { label: '🚪 再见', onClick: () => window.gugu.quit() }
  ]

  return (
    <div className="overlay">
      <div ref={hostRef} className="stage" />
      <Bubbles items={bubbles} />
      <MicOrb />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
