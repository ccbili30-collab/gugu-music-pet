import { Application, Container, Rectangle, Sprite, Texture } from 'pixi.js'
// CSP 禁止 unsafe-eval 时 Pixi v8 需要这个兼容模块（shader 编译走非 eval 路径）
import 'pixi.js/unsafe-eval'
import { loadPack, type LoadedPack } from './pack'
import { Animator } from './animator'
import { Motion } from './motion'
import { Physics } from './physics'
import { Particles } from './particles'
import { IdleScheduler, type IdleAction } from './scheduler'
import { LAYOUT, type SlotName } from './types'
import { bus, makeBubble } from './bus'
import { BeatDetector } from './beat'

/** 音频源注入（音乐 analyser + 伴唱麦 电平），由 App 装配 */
export interface AudioSource {
  playing(): boolean
  analyser(): AnalyserNode | null
  micLevel(): number
}

interface DragSample {
  t: number
  x: number
  y: number
}

export class PetEngine {
  private app!: Application
  private loaded!: LoadedPack
  private sprite!: Sprite
  private motionContainer!: Container
  private animator!: Animator
  private motion = new Motion()
  private physics = new Physics()
  private particles!: Particles
  private scheduler!: IdleScheduler

  private walking: { targetX: number; dir: 1 | -1 } | null = null
  private sleeping = false
  private minorAction: { kind: 'peck' | 'stand' | 'sit'; until: number } | null = null
  private facing: 1 | -1 = 1
  private danceEnergy = 0
  private danceUntil = 0
  private hummingUntil = 0
  private beat = new BeatDetector()
  private audioSource: AudioSource | null = null
  private freqData: Uint8Array<ArrayBuffer> | null = null

  private dragging = false
  private pointerDownAt = 0
  private pointerDownPos = { x: 0, y: 0 }
  private pointerMoved = false
  private grabOffset = { x: 0, y: 0 }
  private samples: DragSample[] = []
  private lastClickAt = 0
  private lastStrokeAt = 0
  private strokeAccum = 0
  private lastPointer = { x: 0, y: 0 }
  private lastSent = { x: -9999, y: -9999 }
  private lastSaved = { x: -9999, y: -9999 }
  private lastZzz = 0
  private boundsTimer = 0
  private boundsFetching = false
  private windowListenersBound = false
  private lastTime = 0
  private raf = 0

  static async create(host: HTMLElement): Promise<PetEngine> {
    const e = new PetEngine()
    await e.init(host)
    return e
  }

  private async init(host: HTMLElement): Promise<void> {
    this.app = new Application()
    await this.app.init({
      width: LAYOUT.windowW,
      height: LAYOUT.windowH,
      backgroundAlpha: 0,
      antialias: false,
      resolution: window.devicePixelRatio,
      autoDensity: true
    })
    host.appendChild(this.app.canvas)
    this.app.stage.eventMode = 'static'

    this.motionContainer = new Container()
    this.motionContainer.position.set(LAYOUT.anchorX, LAYOUT.anchorY)
    this.app.stage.addChild(this.motionContainer)

    let startPack = 'pigeon'
    try {
      startPack = (await window.gugu.petPackGet()) || 'pigeon'
      this.loaded = await loadPack(startPack)
      this.currentPackIdVal = startPack
    } catch {
      this.loaded = await loadPack('pigeon')
      this.currentPackIdVal = 'pigeon'
    }
    this.buildSprite()
    this.particles = new Particles(this.app)
    this.animator = new Animator(this.loaded)

    this.scheduler = new IdleScheduler((a) => this.onIdleAction(a))

    this.setupBounds()
    window.gugu.onScreenChanged(() => void this.setupBounds(false))

    this.setupInteraction()

    // 大脑/托盘指令：dance/hum/fly/sit/sleep/wake/say
    window.gugu.onCommand((raw) => {
      const cmd = raw as { action: string; text?: string }
      switch (cmd.action) {
        case 'dance':
          this.setDance(0.85, 20_000)
          break
        case 'hum':
          this.minorAction = { kind: 'sit', until: performance.now() + 60_000 }
          this.hummingUntil = performance.now() + 60_000
          this.animator.play('hum', true)
          break
        case 'fly':
          this.flyAround()
          break
        case 'sit':
          this.minorAction = { kind: 'sit', until: performance.now() + 45_000 }
          break
        case 'sleep':
          this.sleep()
          break
        case 'wake':
          this.wake()
          break
        case 'corner': {
          // 走到最近的屏幕角落（emo 场景用）
          const ph2 = this.physics
          const leftDist = Math.abs(ph2.x - ph2.leftWall)
          const rightDist = Math.abs(ph2.x - ph2.rightWall)
          const target = leftDist < rightDist ? ph2.leftWall + 24 : ph2.rightWall - 24
          this.walkTo(target)
          window.setTimeout(() => {
            if (!this.physics.airborne) {
              this.minorAction = { kind: 'sit', until: performance.now() + 600_000 }
            }
          }, 3500)
          break
        }
        case 'say':
          bus.emit('bubble', makeBubble({ kind: 'say', text: cmd.text, ttl: 6000 }))
          break
        case 'pack':
          void this.switchPack((raw as { id?: string }).id ?? 'pigeon')
          break
      }
    })

    this.lastTime = performance.now()
    // 调试钩子由 App.tsx 挂载（活实例才挂，避免 StrictMode 双挂载时被僵尸实例覆盖）
    this.loop(this.lastTime)
  }

  private buildSprite(): void {
    const { textures, frameSize } = this.loaded
    if (this.sprite) this.sprite.destroy()
    this.sprite = new Sprite(textures.values().next().value as Texture)
    this.sprite.anchor.set(0.5, 1)
    this.sprite.scale.set(this.loaded.scale)
    this.sprite.eventMode = 'static'
    // hitArea 用的是以 position（脚底中心）为原点的本地空间，与 anchor 无关：
    // anchor(0.5,1) 时画面在 (-w/2,-h)-(w/2,0)，判定框必须对齐这里
    this.sprite.hitArea = new Rectangle(-frameSize[0] / 2, -frameSize[1], frameSize[0], frameSize[1])
    this.sprite.cursor = 'grab'
    this.motionContainer.addChild(this.sprite)
    // 交互挂到新 sprite 上
    this.setupInteraction()
  }

  /** 热切换角色包（切换成功后持久化，下次启动沿用） */
  async switchPack(id: string): Promise<boolean> {
    if (id === this.currentPackId) return true
    try {
      this.loaded = await loadPack(id)
      this.buildSprite()
      this.animator = new Animator(this.loaded)
      this.currentPackIdVal = id
      this.motion.kickSquash(0.7)
      bus.emit('pack', { id })
      try {
        await window.gugu.petPackSet(id)
      } catch {
        /* 持久化失败不影响本次切换 */
      }
      return true
    } catch (err) {
      console.error('switchPack failed:', err)
      return false
    }
  }

  private currentPackIdVal = 'pigeon'

  get currentPackId(): string {
    return this.currentPackIdVal
  }

  // ---- 屏幕边界 ----

  /** M5 节拍驱动入口；指令也可临时设一个舞蹈强度 */
  setDance(energy: number, durationMs: number): void {
    this.danceEnergy = energy
    this.danceUntil = performance.now() + durationMs
    this.minorAction = null
  }

  get isHumming(): boolean {
    return performance.now() < this.hummingUntil
  }

  setAudioSource(src: AudioSource): void {
    this.audioSource = src
    this.beat.onBeat = (strength) => this.motion.beatKick(strength)
  }

  private async setupBounds(clampPos = true): Promise<void> {
    if (this.boundsFetching) return
    this.boundsFetching = true
    try {
      const sx = window.screenX + LAYOUT.anchorX
      const sy = window.screenY + LAYOUT.anchorY
      const si = await window.gugu.screenInfo(clampPos ? sx : this.physics.x, clampPos ? sy : this.physics.y)
      if (clampPos) {
        this.physics.setWorkArea(si.workArea)
        // 出生点：上次的落点（没有则主进程给角落默认值），并夹回工作区
        const spawn = await window.gugu.spawnGet()
        this.physics.x = Math.min(Math.max(spawn.x, this.physics.leftWall), this.physics.rightWall)
        this.physics.y = this.physics.floorY
      } else {
        this.physics.setWorkArea(si.workArea)
      }
    } finally {
      this.boundsFetching = false
    }
  }

  private async refreshBoundsIfCrossed(): Promise<void> {
    // 高速飞行跨屏时刷新工作区
    const ph = this.physics
    const wa = ph.workArea
    const near =
      ph.x > wa.x - 200 && ph.x < wa.x + wa.width + 200 && ph.y > wa.y - 300 && ph.y < wa.y + wa.height + 300
    if (!near) await this.setupBounds(false)
  }

  // ---- 自主调度 ----

  private onIdleAction(a: IdleAction): void {
    switch (a.kind) {
      case 'walk':
        this.walking = { targetX: a.targetX, dir: a.targetX > this.physics.x ? 1 : -1 }
        break
      case 'fly':
        this.physics.startFlyTo(a.targetX, a.targetY)
        break
      case 'peck':
        this.minorAction = { kind: 'peck', until: performance.now() + 3200 }
        break
      case 'stand':
        this.minorAction = { kind: 'stand', until: performance.now() + 5000 }
        break
      case 'sit':
        this.minorAction = { kind: 'sit', until: performance.now() + 6000 }
        break
    }
  }

  // ---- 交互 ----

  private worldPointer(e: PointerEvent): { x: number; y: number } {
    return { x: window.screenX + e.clientX, y: window.screenY + e.clientY }
  }

  private setupInteraction(): void {
    const sprite = this.sprite

    sprite.on('pointerdown', (e) => {
      const w = this.worldPointer(e.nativeEvent as PointerEvent)
      this.pointerDownAt = performance.now()
      this.pointerDownPos = w
      this.pointerMoved = false
      this.grabOffset = { x: this.physics.x - w.x, y: this.physics.y - w.y }
      this.samples = [{ t: this.pointerDownAt, x: w.x, y: w.y }]
      if (this.sleeping) this.wake()
    })

    sprite.on('pointermove', (e) => {
      const ev = e.nativeEvent as PointerEvent
      if (ev.buttons !== 0) return
      const w = this.worldPointer(ev)
      const d = Math.hypot(w.x - this.lastPointer.x, w.y - this.lastPointer.y)
      this.lastPointer = w
      this.strokeAccum += d
      const now = performance.now()
      if (this.strokeAccum > 90 && now - this.lastStrokeAt > 2000) {
        this.lastStrokeAt = now
        this.strokeAccum = 0
        this.particles.hearts(LAYOUT.anchorX + 30, LAYOUT.anchorY - 66, 2)
        this.motion.kickSquash(0.18)
        window.gugu.emitEvent('stroke')
      }
    })

    sprite.on('contextmenu', (e) => {
      e.preventDefault()
      const client = e.client
      bus.emit('menu', { x: client.x, y: client.y })
    })

    if (this.windowListenersBound) return
    this.windowListenersBound = true
    window.addEventListener('pointermove', this.onWindowPointerMove)
    window.addEventListener('pointerup', this.onWindowPointerUp)
  }

  private onWindowPointerMove = (e: PointerEvent): void => {
    {
      if (this.pointerDownAt === 0) return
      const w = this.worldPointer(e)
      if (!this.pointerMoved && Math.hypot(w.x - this.pointerDownPos.x, w.y - this.pointerDownPos.y) > 8) {
        this.pointerMoved = true
        this.dragging = true
        this.physics.mode = 'drag'
        this.walking = null
        this.minorAction = null
        this.sprite.cursor = 'grabbing'
        window.gugu.setDragging(true)
        window.gugu.emitEvent('drag_start')
      }
      if (this.dragging) {
        this.samples.push({ t: performance.now(), x: w.x, y: w.y })
        if (this.samples.length > 40) this.samples.shift()
        const tx = w.x + this.grabOffset.x
        const ty = Math.min(w.y + this.grabOffset.y, this.physics.floorY)
        // 快速跟随（指数趋近）
        const k = 1 - Math.exp(-30 * (1 / 60))
        this.physics.vx = (tx - this.physics.x) * 30
        this.physics.vy = (ty - this.physics.y) * 30
        this.physics.x += (tx - this.physics.x) * k
        this.physics.y += (ty - this.physics.y) * k
      }
    }
  }

  private onWindowPointerUp = (e: PointerEvent): void => {
    {
      if (this.pointerDownAt === 0) return
      const downAt = this.pointerDownAt
      this.pointerDownAt = 0
      const now = performance.now()

      if (this.dragging) {
        this.dragging = false
        this.sprite.cursor = 'grab'
        window.gugu.setDragging(false)
        // 由最近 150ms 采样估计投掷速度
        const recent = this.samples.filter((s) => now - s.t < 160)
        const first = recent[0] ?? this.samples[this.samples.length - 1]
        const last = this.samples[this.samples.length - 1]
        if (first && last && last.t > first.t) {
          const dt = (last.t - first.t) / 1000
          const vx = (last.x - first.x) / dt
          const vy = (last.y - first.y) / dt
          this.physics.startFling(vx, vy)
          window.gugu.emitEvent('fling', { vx: Math.round(vx), vy: Math.round(vy) })
        } else {
          this.physics.mode = 'ballistic'
          this.physics.vy = 0
          this.physics.vx = 0
        }
        return
      }

      if (!this.pointerMoved && now - downAt < 400) {
        const w = this.worldPointer(e)
        if (now - this.lastClickAt < 360 && Math.hypot(w.x - this.pointerDownPos.x, w.y - this.pointerDownPos.y) < 16) {
          this.lastClickAt = 0
          window.gugu.openChat()
          bus.emit('openChat', undefined)
          window.gugu.emitEvent('dblclick')
        } else {
          this.lastClickAt = now
          this.motion.kickSquash(0.85)
          if (!this.sleeping) this.particles.hearts(LAYOUT.anchorX, LAYOUT.anchorY - 60, 2)
          window.gugu.emitEvent('click')
        }
      }
    }
  }

  // ---- 公共指令（右键菜单 / 大脑 M4） ----

  walkTo(targetX?: number): void {
    const ph = this.physics
    if (ph.airborne) return
    const t = targetX ?? ph.x + (Math.random() - 0.5) * 500
    const clamped = Math.min(Math.max(t, ph.leftWall + 20), ph.rightWall - 20)
    this.walking = { targetX: clamped, dir: clamped > ph.x ? 1 : -1 }
    this.minorAction = null
  }

  flyAround(): void {
    const ph = this.physics
    ph.startFlyTo(
      ph.leftWall + 60 + Math.random() * (ph.rightWall - ph.leftWall - 120),
      ph.ceiling + 100 + Math.random() * Math.max(ph.floorY - ph.ceiling - 220, 80)
    )
  }

  sleep(): void {
    this.sleeping = true
    this.walking = null
    this.minorAction = null
  }

  wake(): void {
    this.sleeping = false
    this.motion.kickSquash(0.5)
  }

  get isSleeping(): boolean {
    return this.sleeping
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('pointermove', this.onWindowPointerMove)
    window.removeEventListener('pointerup', this.onWindowPointerUp)
    this.app.destroy(true, { children: true })
  }

  // ---- 主循环 ----

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min((now - this.lastTime) / 1000, 0.05)
    this.lastTime = now
    if (dt <= 0) return

    const ph = this.physics
    // ---- 音律驱动：音乐节拍 + 麦克风电平 → 舞蹈能量 ----
    const src = this.audioSource
    if (src) {
      const mic = src.micLevel()
      const an = src.analyser()
      if (src.playing() && an) {
        if (!this.freqData || this.freqData.length !== an.frequencyBinCount) {
          this.freqData = new Uint8Array(new ArrayBuffer(an.frequencyBinCount))
        }
        an.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>)
        this.beat.update(dt, this.freqData as Uint8Array<ArrayBuffer>, now / 1000)
        const musicEnergy = Math.max(0, Math.min(1, (this.beat.energy - 0.02) * 3))
        const level = Math.min(1, musicEnergy + mic * 1.3)
        if (level > 0.05) {
          this.danceEnergy = Math.max(this.danceEnergy, 0.35 + level * 0.55)
          this.danceUntil = Math.max(this.danceUntil, now + 2600)
        }
      } else if (mic > 0.05) {
        // 只伴唱不放歌：随歌声律动
        this.danceEnergy = Math.max(this.danceEnergy, 0.3 + mic * 0.6)
        this.danceUntil = Math.max(this.danceUntil, now + 2000)
      }
    }
    // 舞蹈能量到期后平滑衰减
    if (performance.now() > this.danceUntil && this.danceEnergy > 0) {
      this.danceEnergy = Math.max(0, this.danceEnergy - dt * 0.5)
    }
    const isIdle =
      !ph.airborne && !this.walking && !this.sleeping && !this.minorAction && this.danceEnergy < 0.01 && !this.isHumming
    this.scheduler.tick(now, isIdle, ph)

    // 小动作到期
    if (this.minorAction && now >= this.minorAction.until) this.minorAction = null

    // 走路推进
    if (this.walking && ph.mode === 'ground') {
      const dir = this.walking.dir
      ph.x += dir * 92 * dt
      ph.vx = dir * 92
      ph.y = ph.floorY
      this.facing = dir
      if ((dir === 1 && ph.x >= this.walking.targetX) || (dir === -1 && ph.x <= this.walking.targetX)) {
        ph.x = this.walking.targetX
        this.walking = null
        ph.vx = 0
      }
    }

    const events = ph.update(dt)
    for (const ev of events) {
      if (ev.type === 'land') {
        this.motion.kickSquash(Math.min(ev.impact / 1600, 1) * 0.7)
        if (ev.impact > 700) this.particles.impactStars(LAYOUT.anchorX, LAYOUT.anchorY - 50)
        window.gugu.emitEvent('land', { impact: Math.round(ev.impact) })
      } else if (ev.type === 'wall') {
        this.motion.kickSquash(0.25)
        window.gugu.emitEvent('wall', { side: ev.side, impact: Math.round(ev.impact) })
      } else if (ev.type === 'rest') {
        window.gugu.emitEvent('rest')
      }
    }

    // 空中朝向
    if (ph.airborne && Math.abs(ph.vx) > 30) this.facing = ph.vx > 0 ? 1 : -1

    // 睡眠 zzz
    if (this.sleeping && now - this.lastZzz > 2800) {
      this.lastZzz = now
      this.particles.zzz(LAYOUT.anchorX - 40, LAYOUT.anchorY - 30)
    }

    // 定期检查是否跨屏 + 保存落点（下次启动还在老地方）
    this.boundsTimer += dt
    if (this.boundsTimer > 4) {
      this.boundsTimer = 0
      if (ph.airborne && Math.hypot(ph.vx, ph.vy) > 500) void this.refreshBoundsIfCrossed()
      if (!ph.airborne) {
        const rx2 = Math.round(ph.x)
        const ry2 = Math.round(ph.y)
        if (Math.abs(rx2 - this.lastSaved.x) > 40 || Math.abs(ry2 - this.lastSaved.y) > 40) {
          this.lastSaved = { x: rx2, y: ry2 }
          window.gugu.spawnSave(rx2, ry2)
        }
      }
    }

    // ---- 动画槽位选择 ----
    let slot: SlotName = 'idle'
    if (this.dragging) slot = this.facing === 1 ? 'fly_right' : 'fly_left'
    else if (ph.airborne) slot = this.facing === 1 ? 'fly_right' : 'fly_left'
    else if (this.sleeping) slot = 'sleep'
    else if (this.isHumming) slot = 'hum'
    else if (this.walking) slot = this.facing === 1 ? 'walk_right' : 'walk_left'
    else if (this.minorAction?.kind === 'peck') slot = 'peck'
    else if (this.minorAction?.kind === 'sit') slot = 'sit'
    else if (this.minorAction?.kind === 'stand') slot = 'stand'
    else if (this.danceEnergy > 0.01) slot = 'dance'
    this.animator.play(slot)
    this.animator.update(dt)

    // 帧贴图 + 脚底锚点 + 镜像翻转
    const frameName = this.animator.currentFrame
    const tex = this.loaded.textures.get(frameName)
    if (tex && this.sprite.texture !== tex) this.sprite.texture = tex
    const info = this.loaded.frameInfo.get(frameName)
    const [, fh] = this.loaded.frameSize
    if (info) this.sprite.anchor.set(0.5, (info.groundRow + 1) / fh)
    this.sprite.scale.set(
      (this.animator.isFlipped ? -1 : 1) * this.loaded.scale,
      this.loaded.scale
    )

    // ---- 变换律动层 ----
    const out = this.motion.update(dt, {
      mode: ph.mode,
      vx: ph.vx,
      vy: ph.vy,
      walking: !!this.walking,
      sleeping: this.sleeping,
      danceEnergy: this.danceEnergy,
      beatPulse: 0,
      beatPhase: this.beat.beatPhase * Math.PI * 2
    })
    this.motionContainer.scale.set(out.scaleX, out.scaleY)
    this.motionContainer.rotation = out.rotation
    this.motionContainer.position.set(LAYOUT.anchorX, LAYOUT.anchorY + out.offsetY)

    // ---- 窗口跟随（宠物脚底点 → 主进程换算窗口位置） ----
    const rx = Math.round(ph.x)
    const ry = Math.round(ph.y)
    if (rx !== this.lastSent.x || ry !== this.lastSent.y) {
      this.lastSent = { x: rx, y: ry }
      window.gugu.move(rx, ry)
    }
  }
}
