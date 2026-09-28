import { useEffect, useRef, useState } from 'react'
import { PetEngine } from './pet/engine'
import { AudioEngine } from './pet/audio'
import { MicEngine } from './pet/mic'
import { bus, makeBubble, type BubbleData } from './pet/bus'
import { computeRegions, reportRegions } from './pet/regions'
import { Bubbles } from './overlay/Bubbles'
import { MicOrb } from './overlay/MicOrb'
import { MiniPlayer } from './overlay/MiniPlayer'
import { HotComments } from './overlay/HotComments'
import { ContextMenu, type MenuItem } from './overlay/ContextMenu'


export default function App(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<PetEngine | null>(null)
  const [audio, setAudio] = useState<AudioEngine | null>(null)
  const [mic, setMic] = useState<MicEngine | null>(null)
  const [micOn, setMicOn] = useState(false)
  const audioRef = useRef<AudioEngine | null>(null)
  const micRef = useRef<MicEngine | null>(null)

  // 装配音律源（引擎与音频引擎都就绪后）
  useEffect(() => {
    let tries = 0
    const t = window.setInterval(() => {
      tries++
      if (engineRef.current && audioRef.current) {
        engineRef.current.setAudioSource({
          playing: () => audioRef.current?.isPlaying ?? false,
          analyser: () => audioRef.current?.getAnalyser() ?? null,
          micLevel: () => micRef.current?.level ?? 0
        })
        window.clearInterval(t)
      } else if (tries > 100) {
        window.clearInterval(t)
      }
    }, 200)
    return () => window.clearInterval(t)
  }, [])
  const [bubbles, setBubbles] = useState<BubbleData[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [packs, setPacks] = useState<{ id: string; name: string; version: string }[]>([])
  const [currentPack, setCurrentPack] = useState('pigeon')
  const [hasTrack, setHasTrack] = useState(false)
  const [sceneMode, setSceneMode] = useState<'normal' | 'emo' | 'listening'>('normal')
  const [hotOpen, setHotOpen] = useState(false)

  // 音乐状态（迷你播放器/交互区域需要知道是否有曲目）
  useEffect(() => {
    void window.gugu.music.playerState().then((s) => setHasTrack(!!s.track))
    const off = window.gugu.onMusicState(({ player }) => setHasTrack(!!player.track))
    return off
  }, [])

  // 场景状态（emo 氛围等）
  useEffect(() => {
    const off = window.gugu.onSceneState(({ mode }) => setSceneMode(mode))
    return off
  }, [])

  // 交互区域上报（点击穿透用）
  useEffect(() => {
    reportRegions(
      computeRegions({
        bubbleCount: bubbles.length,
        menu: menu ? { x: menu.x, y: menu.y, items: 11 + packs.length } : null,
        hasTrack,
        hotOpen
      })
    )
  }, [bubbles.length, menu, hasTrack, packs.length, hotOpen])

  // 主进程 → 宠物气泡（大脑回复/歌评/共鸣/邀请）
  useEffect(() => {
    const off = window.gugu.onPetBubble((msg) => {
      bus.emit(
        'bubble',
        makeBubble({ kind: msg.kind, text: msg.text, kaomoji: msg.kaomoji, ttl: msg.kind === 'invite' ? 12000 : 6500 })
      )
    })
    return off
  }, [])

  // 音频引擎（渲染层唯一 <audio>）
  useEffect(() => {
    const eng = new AudioEngine()
    eng.onError = (msg) => bus.emit('bubble', makeBubble({ kind: 'say', text: msg, ttl: 5000 }))
    eng.onTrackChange = (track, trial) => {
      if (!track) return
      bus.emit('trackChange', { name: track.name, artists: track.artists, trial })
    }
    audioRef.current = eng
    // 调试/自动化测试钩子（CDP 可静音验证，不打扰用户扬声器）
    ;(window as unknown as Record<string, unknown>).__guguAudio = eng
    setAudio(eng)
    return () => {
      eng.destroy()
      setAudio(null)
    }
  }, [])

  // 伴唱引擎
  useEffect(() => {
    const m = new MicEngine()
    m.onChange = setMicOn
    micRef.current = m
    setMic(m)
    return () => {
      m.stop()
      micRef.current = null
      setMic(null)
    }
  }, [])

  const toggleMic = async (m: MicEngine | null): Promise<void> => {
    if (!m) return
    if (m.recording) {
      m.stop()
      const text = await m.summary()
      bus.emit('bubble', makeBubble({ kind: 'comment', text, ttl: 6000 }))
    } else {
      const r = await m.start()
      if (!r.ok) {
        bus.emit(
          'bubble',
          makeBubble({
            kind: 'say',
            text: r.error === 'mic-denied' ? '麦克风权限被拒了：系统设置 → 隐私与安全性 → 麦克风，勾选咕咕' : '麦克风启动失败…',
            ttl: 8000
          })
        )
      } else {
        bus.emit('bubble', makeBubble({ kind: 'comment', text: '伴奏响起就来！我听着呢🎤', ttl: 4000 }))
      }
    }
  }

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

  const playRandom = async (): Promise<void> => {
    try {
      const list = await window.gugu.music.recommend()
      if (!list.length) {
        bus.emit('bubble', makeBubble({ kind: 'say', text: '推荐列表空空的…等会儿再试', ttl: 4000 }))
        return
      }
      await audio?.playQueue(list, 0)
    } catch {
      bus.emit('bubble', makeBubble({ kind: 'say', text: '拿推荐列表失败了，检查下网络？', ttl: 4000 }))
    }
  }

  const items: MenuItem[] = [
    { label: '💬 陪我聊聊', onClick: () => window.gugu.openChat() },
    { label: '🎵 随机来一首', onClick: () => void playRandom() },
    { label: '📝 看看热评', onClick: () => setHotOpen(true) },
    { label: '🌧️ 演示：雨夜EMO', onClick: () => void window.gugu.sceneForceEmo() },
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
    { label: '🔑 扫码登录网易云', onClick: () => window.gugu.openLogin() },
    { label: '🚪 再见', onClick: () => window.gugu.quit() }
  ]

  return (
    <div className={`overlay${sceneMode === 'emo' ? ' scene-emo' : ''}`}>
      <div ref={hostRef} className="stage" />
      {sceneMode === 'emo' && <div className="emo-vignette" />}
      <Bubbles
        items={bubbles}
        onInvite={(accept) => {
          if (accept) window.gugu.sceneAccept()
          else window.gugu.sceneDecline()
          setBubbles((cur) => cur.filter((b) => b.kind !== 'invite'))
        }}
      />
      <MicOrb recording={micOn} onClick={() => void toggleMic(mic)} />
      <MiniPlayer engine={audio} />
      <HotComments open={hotOpen} onClose={() => setHotOpen(false)} />
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
