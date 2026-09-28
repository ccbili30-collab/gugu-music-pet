import type { ScreenInfo } from '../../preload/index'

declare global {
  interface Window {
    gugu: {
      move(x: number, y: number): void
      emitEvent(name: string, payload?: unknown): void
      screenInfo(x: number, y: number): Promise<ScreenInfo>
      onScreenChanged(cb: () => void): void
      onCommand(cb: (cmd: unknown) => void): void
      packsList(): Promise<{ id: string; name: string; version: string }[]>
      openChat(): void
      quit(): void
    }
  }
}

export {}
