import { LAYOUT } from '../pet/types'

/**
 * 话筒圆球按钮：贴宠物右侧的伴唱入口。
 * M1 为占位展示（M5 接入录音 + 夸夸池点评）。
 */
export function MicOrb(): JSX.Element {
  return (
    <button
      className="mic-orb"
      title="伴唱（即将上线）"
      style={{ left: LAYOUT.anchorX + 56, top: LAYOUT.anchorY - 150 }}
      disabled
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" />
        <path d="M18 11a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V19H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.09A6 6 0 0 0 18 11z" />
      </svg>
    </button>
  )
}
