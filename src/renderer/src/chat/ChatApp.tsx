import { useState } from 'react'

/** M1 占位聊天窗：M4 接入大脑（LLM + 音乐工具） */
export function ChatApp(): JSX.Element {
  const [text, setText] = useState('')

  return (
    <div className="chat-app">
      <div className="chat-header">🐦 咕咕 · 音乐伙伴</div>
      <div className="chat-body">
        <div className="chat-empty">
          <span className="bird">🕊️</span>
          大脑正在孵化中（M4 接入）
          <br />
          到时候可以直接说「来点适合写代码的歌」
        </div>
      </div>
      <div className="chat-input-bar">
        <input
          className="chat-input"
          placeholder="先熟悉一下咕咕，很快就能聊天啦…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled
        />
        <button className="chat-send" disabled>
          发送
        </button>
      </div>
    </div>
  )
}
