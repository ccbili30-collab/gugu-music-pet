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
      <img src="icons/mic.png" alt="" draggable={false} />
    </button>
  )
}
