import { Container, Sprite, Texture, type Application } from 'pixi.js'

interface Particle {
  obj: Sprite
  vx: number
  vy: number
  life: number
  maxLife: number
  spin: number
}

/** 粒子贴图 id（/icons/<id>.png，由 npm run bake 烘焙） */
export type ParticleIcon = 'heart' | 'note' | 'zzz' | 'spark'

/** 心心 / 音符 / zzz 粒子层（像素图标 Sprite，与角色包同一画风） */
export class Particles {
  private layer = new Container()
  private items: Particle[] = []
  private textures = new Map<ParticleIcon, Texture>()

  constructor(app: Application) {
    app.stage.addChild(this.layer)
    app.ticker.add(() => this.update())
  }

  /** 引擎启动时预载（Asset 缓存后 Texture.from 同步可用） */
  static async preload(): Promise<void> {
    const { Assets } = await import('pixi.js')
    await Promise.all((['heart', 'note', 'zzz', 'spark'] as const).map((id) => Assets.load(`icons/${id}.png`)))
  }

  private spawn(icon: ParticleIcon, x: number, y: number, size: number): void {
    let tex = this.textures.get(icon)
    if (!tex) {
      tex = Texture.from(`icons/${icon}.png`)
      this.textures.set(icon, tex)
    }
    const obj = new Sprite(tex)
    obj.anchor.set(0.5)
    obj.position.set(x, y)
    const s = size / tex.width
    obj.scale.set(s)
    this.layer.addChild(obj)
    this.items.push({
      obj,
      vx: (Math.random() - 0.5) * 50,
      vy: -55 - Math.random() * 45,
      life: 0,
      maxLife: 1.1 + Math.random() * 0.5,
      spin: (Math.random() - 0.5) * 2.4
    })
  }

  hearts(x: number, y: number, n = 3): void {
    for (let i = 0; i < n; i++) {
      setTimeout(() => this.spawn('heart', x + (Math.random() - 0.5) * 44, y + (Math.random() - 0.5) * 16, 18 + Math.random() * 8), i * 130)
    }
  }

  notes(x: number, y: number, n = 1): void {
    for (let i = 0; i < n; i++) {
      setTimeout(() => this.spawn('note', x + (Math.random() - 0.5) * 30, y, 16), i * 220)
    }
  }

  zzz(x: number, y: number): void {
    this.spawn('zzz', x + 26, y - 20, 16)
  }

  impactStars(x: number, y: number): void {
    this.spawn('spark', x, y, 18)
  }

  update(): void {
    const dt = 1 / 60
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i]
      p.life += dt
      p.obj.x += p.vx * dt
      p.obj.y += p.vy * dt
      p.vy += -12 * dt // 微微上飘
      p.obj.rotation += p.spin * dt
      p.obj.alpha = Math.max(0, 1 - p.life / p.maxLife)
      if (p.life >= p.maxLife) {
        p.obj.destroy()
        this.items.splice(i, 1)
      }
    }
  }
}
