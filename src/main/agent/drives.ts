// 四维驱动力：能量/社交/好奇/安逸（移植旧 brain/drives.py，节奏调慢）
export interface Drives {
  energy: number
  social: number
  curiosity: number
  comfort: number
}

export const DEFAULT_DRIVES: Drives = { energy: 0.72, social: 0.56, curiosity: 0.68, comfort: 0.74 }

/** 每秒自然漂移（比旧项目慢一档） */
const DRIFT_PER_SEC: Record<string, Drives> = {
  idle: { energy: -0.002, social: -0.0015, curiosity: 0.003, comfort: 0.0005 },
  walking: { energy: -0.006, social: 0, curiosity: 0.002, comfort: 0 },
  dancing: { energy: -0.01, social: 0.004, curiosity: 0, comfort: 0.002 },
  sleeping: { energy: 0.02, social: -0.002, curiosity: -0.001, comfort: 0.004 },
  chatting: { energy: -0.002, social: 0.02, curiosity: 0.002, comfort: 0.004 }
}

/** 宠物事件对驱动力的冲击（词汇表与渲染层 pet:event 对齐） */
const EVENT_IMPACT: Record<string, Partial<Drives>> = {
  click: { social: 0.05, comfort: 0.02 },
  dblclick: { social: 0.08 },
  stroke: { social: 0.12, comfort: 0.06 },
  chat_message: { social: 0.18, comfort: 0.03 },
  fling: { comfort: -0.06 },
  wall: { comfort: -0.05 },
  land: { comfort: -0.01 }
}

export class DriveSystem {
  drives: Drives = { ...DEFAULT_DRIVES }
  mode: keyof typeof DRIFT_PER_SEC = 'idle'

  tick(dtSec: number): void {
    const d = DRIFT_PER_SEC[this.mode] ?? DRIFT_PER_SEC.idle
    for (const k of Object.keys(this.drives) as (keyof Drives)[]) {
      this.drives[k] = Math.min(1, Math.max(0, this.drives[k] + d[k] * dtSec))
    }
  }

  impact(event: string): void {
    const imp = EVENT_IMPACT[event]
    if (!imp) return
    for (const k of Object.keys(imp) as (keyof Drives)[]) {
      this.drives[k] = Math.min(1, Math.max(0, this.drives[k] + (imp[k] ?? 0)))
    }
  }

  get dominant(): 'rest' | 'social' | 'explore' | 'comfort' {
    const d = this.drives
    if (d.energy < 0.2) return 'rest'
    if (d.social < 0.25) return 'social'
    if (d.comfort < 0.3) return 'comfort'
    if (d.curiosity > 0.75) return 'explore'
    return 'social'
  }

  describe(): string {
    const d = this.drives
    return `能量${pct(d.energy)}、社交欲${pct(d.social)}、好奇心${pct(d.curiosity)}、安心度${pct(d.comfort)}`
  }
}

function pct(v: number): string {
  return v > 0.7 ? '高' : v > 0.4 ? '中' : '低'
}
