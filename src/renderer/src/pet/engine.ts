import { Application, Container, Rectangle, Sprite, Texture } from 'pixi.js'
import { loadPack, type LoadedPack } from './pack'
import { Animator } from './animator'
import { Motion } from './motion'
import { Physics } from './physics'
import { Particles } from './particles'
import { IdleScheduler, type IdleAction } from './scheduler'
import { LAYOUT, type SlotName } from './types'
import { bus } from './bus'

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
  private lastZzz = 0
  private boundsTimer = 0
  private boundsFetching = false
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

    this.loaded = await loadPack('pigeon')
    const { textures, frameSize } = this.loaded

    this.motionContainer = new Container()
    this.motionContainer.position.set(LAYOUT.anchorX, LAYOUT.anchorY)
    this.app.stage.addChild(this.motionContainer)

    this.sprite = new Sprite(textures.values().next().value as Texture)
    this.sprite.anchor.set(0.5, 1)
    this.sprite.scale.set(this.loaded.scale)
    this.sprite.eventMode = 'static'
    this.sprite.hitArea = new Rectangle(0, 0, frameSize[0], frameSize[1])
    this.sprite.cursor = 'grab'
    this.motionContainer.addChild(this.sprite)

    this.particles = new Particles(this.app)
    this.animator = new Animator(this.loaded)

    this.scheduler = new IdleScheduler((a) => this.onIdleAction(a))

    this.setupBounds()
    window.gugu.onScreenChanged(() => void this.setupBounds(false))

    this.setupInteraction()

    this.lastTime = performance.now()
    this.loop(this.lastTime)
  }

  // ---- 屏幕边界 ----

  private async setupBounds(clampPos = true): Promise<void> {
    if (this.boundsFetching) return
    this.boundsFetching = true
    try {
      const sx = window.screenX + LAYOUT.anchorX
      const sy = window.screenY + LAYOUT.anchorY
      const si = await window.gugu.screenInfo(clampPos ? sx : this.physics.x, clampPos ? sy : this.physics.y)
      if (clampPos) {
        this.physics.setWorkArea(si.workArea)
        this.physics.x = si.workArea.x + si.workArea.width * 0.5
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

    window.addEventListener('pointermove', (e) => {
      if (this.pointerDownAt === 0) return
      const w = this.worldPointer(e)
      if (!this.pointerMoved && Math.hypot(w.x - this.pointerDownPos.x, w.y - this.pointerDownPos.y) > 8) {
        this.pointerMoved = true
        this.dragging = true
        this.physics.mode = 'drag'
        this.walking = null
        this.minorAction = null
        sprite.cursor = 'grabbing'
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
    })

    window.addEventListener('pointerup', (e) => {
      if (this.pointerDownAt === 0) return
      const downAt = this.pointerDownAt
      this.pointerDownAt = 0
      const now = performance.now()

      if (this.dragging) {
        this.dragging = false
        sprite.cursor = 'grab'
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
    })
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
    this.app.destroy(true, { children: true })
  }

  // ---- 主循环 ----

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min((now - this.lastTime) / 1000, 0.05)
    this.lastTime = now
    if (dt <= 0) return

    const ph = this.physics
    const isIdle =
      !ph.airborne && !this.walking && !this.sleeping && !this.minorAction && this.danceEnergy < 0.01
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

    // 定期检查是否跨屏
    this.boundsTimer += dt
    if (this.boundsTimer > 1.5) {
      this.boundsTimer = 0
      if (ph.airborne && Math.hypot(ph.vx, ph.vy) > 500) void this.refreshBoundsIfCrossed()
    }

    // ---- 动画槽位选择 ----
    let slot: SlotName = 'idle'
    if (this.dragging) slot = this.facing === 1 ? 'fly_right' : 'fly_left'
    else if (ph.airborne) slot = this.facing === 1 ? 'fly_right' : 'fly_left'
    else if (this.sleeping) slot = 'sleep'
    else if (this.walking) slot = this.facing === 1 ? 'walk_right' : 'walk_left'
    else if (this.minorAction?.kind === 'peck') slot = 'peck'
    else if (this.minorAction?.kind === 'sit') slot = 'sit'
    else if (this.minorAction?.kind === 'stand') slot = 'stand'
    else if (this.danceEnergy > 0.01) slot = 'dance'
    this.animator.play(slot)
    this.animator.update(dt)

    // 帧贴图 + 脚底锚点
    const frameName = this.animator.currentFrame
    const tex = this.loaded.textures.get(frameName)
    if (tex && this.sprite.texture !== tex) this.sprite.texture = tex
    const info = this.loaded.frameInfo.get(frameName)
    const [, fh] = this.loaded.frameSize
    if (info) this.sprite.anchor.set(0.5, (info.groundRow + 1) / fh)

    // ---- 变换律动层 ----
    const out = this.motion.update(dt, {
      mode: ph.mode,
      vx: ph.vx,
      vy: ph.vy,
      walking: !!this.walking,
      sleeping: this.sleeping,
      danceEnergy: this.danceEnergy,
      beatPulse: 0,
      beatPhase: now / 1000 * Math.PI * 2
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
