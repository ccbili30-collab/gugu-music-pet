import type { BubbleData } from '../pet/bus'

/** AI 气泡（固定在宠物右侧，尾巴朝左指向宠物）；邀请类带按钮 */
export function Bubbles({ items, onInvite }: { items: BubbleData[]; onInvite: (accept: boolean) => void }): JSX.Element {
  return (
    <div className="bubbles">
      {items.slice(-2).map((b) => (
        <div key={b.id} className={`bubble bubble-${b.kind}`}>
          {b.text && <div className="bubble-text">{b.text}</div>}
          {b.kaomoji && <div className="bubble-kaomoji">{b.kaomoji}</div>}
          {b.kind === 'invite' && (
            <div className="invite-actions">
              <button className="invite-btn accept" onClick={() => onInvite(true)}>
                一起听 ♪
              </button>
              <button className="invite-btn decline" onClick={() => onInvite(false)}>
                不了
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
