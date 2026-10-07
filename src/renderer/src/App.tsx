import { useEffect, useRef, useState } from 'react'
import { PetEngine } from './pet/engine'
import { AudioEngine } from './pet/audio'
import { MicEngine } from './pet/mic'
import { bus, makeBubble, type BubbleData } from './pet/bus'
import { computeRegions, reportRegions } from './pet/regions'
import { Bubbles } from './overlay/Bubbles'
import { MiniPlayer } from './overlay/MiniPlayer'
import { HeadChat, type HeadChatHandle } from './overlay/HeadChat'
import { HotComments } from './overlay/HotComments'


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
  const [hasTrack, setHasTrack] = useState(false)
  const [sceneMode, setSceneMode] = useState<'normal' | 'emo' | 'listening'>('normal')
  const [hotOpen, setHotOpen] = useState(false)
  const headChatRef = useRef<HeadChatHandle>(null)
  const [headChatActive, setHeadChatActive] = useState(false)

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

  // 功能菜单已收进 mac 托盘：窗口内右键只做拦截（避免 Chromium 默认菜单）
  useEffect(() => {
    const onCtx = (e: MouseEvent): void => e.preventDefault()
    window.addEventListener('contextmenu', onCtx)
    return () => window.removeEventListener('contextmenu', onCtx)
  }, [])

  // 托盘「看看热评」→ 打开热评卡
  useEffect(() => {
    const off = bus.on('hotComments', () => setHotOpen(true))
    return off
  }, [])

  // ---- 全屏窗模式：跟随层 + 穿透区域随宠物移动 ----
  const followRef = useRef<HTMLDivElement>(null)
  const uiRef = useRef({ bubbleCount: 0, hasTrack: false, hotOpen: false, headChatActive: false })
  uiRef.current = { bubbleCount: bubbles.length, hasTrack, hotOpen, headChatActive }

  useEffect(() => {
    let lastReport = 0
    const report = (force = false): void => {
      const eng = engineRef.current
      if (!eng) return
      const now = performance.now()
      if (!force && now - lastReport < 120) return
      lastReport = now
      const { x, y } = eng.petLocal
      reportRegions(computeRegions({ petX: x, petY: y, ...uiRef.current }))
    }
    // 引擎每帧回调：跟随层 DOM 直改（不触发 React 渲染），穿透区域节流上报
    const attach = (): void => {
      const eng = engineRef.current
      if (!eng) {
        window.setTimeout(attach, 200)
        return
      }
      eng.onPetMoved = (lx, ly) => {
        if (followRef.current) followRef.current.style.transform = `translate(${lx}px, ${ly}px)`
        report()
      }
      eng.onPetHover = (over) => headChatRef.current?.hover(over)
      eng.onPetDblClick = () => headChatRef.current?.open()
      report(true)
    }
    attach()
    // UI 状态变化时立即重报
    const t = window.setInterval(() => report(true), 500)
    return () => {
      window.clearInterval(t)
      const eng = engineRef.current
      if (eng) eng.onPetMoved = null
    }
  }, [])

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
            text: r.error === 'mic-denied' ? '麦克风权限被拒了：系统设置 → 隐私与安全性 → 麦克风，勾选 pet' : '麦克风启动失败…',
            ttl: 8000
          })
        )
      } else {
        bus.emit('bubble', makeBubble({ kind: 'comment', text: '伴奏响起就来！我听着呢🎤', ttl: 4000 }))
      }
    }
  }

  useEffect(() => {
    let disposed = false
    void PetEngine.create(hostRef.current as HTMLElement).then((engine) => {
      if (disposed) {
        engine.destroy()
        return
      }
      engineRef.current = engine
      // 调试/自动化钩子挂活实例（CDP 观察/驱动拖拽、节拍等）
      ;(window as unknown as Record<string, unknown>).__guguEngine = engine
    })
    return () => {
      disposed = true
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

  // 语言区单条化：新气泡直接替换旧气泡，杜绝叠罗汉
  useEffect(() => {
    const off = bus.on('bubble', (b) => {
      setBubbles([b])
    })
    return off
  }, [])


  return (
    <div className={`overlay${sceneMode === 'emo' ? ' scene-emo' : ''}`}>
      <div ref={hostRef} className="stage" />
      {sceneMode === 'emo' && <div className="emo-vignette" />}
      <div ref={followRef} className="follow-layer">
        <HeadChat ref={headChatRef} onPhaseChange={setHeadChatActive} />
        <Bubbles
          items={bubbles}
          onInvite={(accept) => {
            if (accept) window.gugu.sceneAccept()
            else window.gugu.sceneDecline()
            setBubbles((cur) => cur.filter((b) => b.kind !== 'invite'))
          }}
        />
        <MiniPlayer engine={audio} micOn={micOn} onMicToggle={() => void toggleMic(mic)} />
        <HotComments open={hotOpen} onClose={() => setHotOpen(false)} />
      </div>
    </div>
  )
}
