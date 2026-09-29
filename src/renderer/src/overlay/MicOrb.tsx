import { LAYOUT } from '../pet/types'

/** 话筒圆球按钮：贴宠物右侧的伴唱入口（录音中红色呼吸灯） */
export function MicOrb({ recording, onClick }: { recording: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      className={`mic-orb${recording ? ' recording' : ''}`}
      title={recording ? '结束伴唱' : '开始伴唱（跟唱模式）'}
      style={{ left: LAYOUT.anchorX + 54, top: LAYOUT.anchorY - 30 }}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" />
        <path d="M18 11a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V19H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.09A6 6 0 0 0 18 11z" />
      </svg>
    </button>
  )
}
