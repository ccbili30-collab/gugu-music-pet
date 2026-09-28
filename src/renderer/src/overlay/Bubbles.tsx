import { useEffect, useRef, useState } from 'react'
import type { BubbleData } from '../pet/bus'

/** AI 气泡（固定在宠物右侧，尾巴朝左指向宠物） */
export function Bubbles({ items }: { items: BubbleData[] }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [, force] = useState(0)

  // 重新触发淡入动画
  useEffect(() => force((n) => n + 1), [items])

  return (
    <div ref={ref} className="bubbles">
      {items.slice(-2).map((b) => (
        <div key={b.id} className={`bubble bubble-${b.kind}`}>
          {b.text && <div className="bubble-text">{b.text}</div>}
          {b.kaomoji && <div className="bubble-kaomoji">{b.kaomoji}</div>}
        </div>
      ))}
    </div>
  )
}
