import { Container, Text, type Application } from 'pixi.js'

interface Particle {
  obj: Text
  vx: number
  vy: number
  life: number
  maxLife: number
  spin: number
}

/** 心心 / 音符 / zzz 粒子层（Pixi Text 渲染 emoji） */
export class Particles {
  private layer = new Container()
  private items: Particle[] = []

  constructor(app: Application) {
    app.stage.addChild(this.layer)
    app.ticker.add(() => this.update())
  }

  private spawn(char: string, x: number, y: number, size: number, color?: number): void {
    const obj = new Text({
      text: char,
      style: { fontSize: size, fontFamily: 'Apple Color Emoji, PingFang SC', fill: color ?? 0xffffff }
    })
    obj.anchor.set(0.5)
    obj.position.set(x, y)
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
    const chars = ['💖', '💗', '❤️', '💕']
    for (let i = 0; i < n; i++) {
      setTimeout(() => this.spawn(chars[i % chars.length], x + (Math.random() - 0.5) * 44, y + (Math.random() - 0.5) * 16, 15 + Math.random() * 7), i * 130)
    }
  }

  notes(x: number, y: number, n = 1): void {
    for (let i = 0; i < n; i++) {
      setTimeout(() => this.spawn('🎵', x + (Math.random() - 0.5) * 30, y, 14), i * 220)
    }
  }

  zzz(x: number, y: number): void {
    this.spawn('💤', x + 26, y - 20, 15)
  }

  impactStars(x: number, y: number): void {
    this.spawn('💫', x, y, 16)
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
