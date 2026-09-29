import { useEffect, useState } from 'react'

type Phase = 'loading' | 'logged-out' | 'logged-in'

export function LoginApp(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading')
  const [cookie, setCookie] = useState('')
  const [nickname, setNickname] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void (async () => {
      const state = await window.gugu.music.loginState()
      if (state.loggedIn) {
        setNickname(state.nickname ?? '')
        setPhase('logged-in')
      } else {
        setPhase('logged-out')
      }
    })()
  }, [])

  const save = async (): Promise<void> => {
    if (!cookie.trim()) {
      setMsg('先粘贴 Cookie')
      return
    }
    setMsg('保存中…')
    const r = await window.gugu.music.cookieSet(cookie)
    if (r.ok) {
      setMsg('已保存 ✓')
      setPhase('logged-in')
      setNickname('汽水听众')
      window.setTimeout(() => window.close(), 1200)
    } else {
      setMsg('保存失败，检查内容后重试')
    }
  }

  return (
    <div className="login-app">
      <div className="login-title">🎵 汽水音乐</div>
      <div className="login-sub">粘贴 Cookie 解锁完整曲库（不登录也能搜大部分歌）</div>

      {phase === 'logged-in' && (
        <div className="login-qr-box">
          <div className="login-success">
            <div className="login-bird">🥤</div>
            已登录{nickname ? `：${nickname}` : ''}
          </div>
          <button
            className="login-retry"
            onClick={async () => {
              await window.gugu.music.logout()
              setPhase('logged-out')
              setCookie('')
              setMsg('')
            }}
          >
            退出登录
          </button>
        </div>
      )}

      {phase === 'logged-out' && (
        <div className="login-qr-box">
          <textarea
            className="login-cookie-input"
            placeholder={'粘贴汽水 Cookie，如：\nsessionid=xxxxxxxx;'}
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            rows={4}
          />
          <div className="login-hint" style={{ textAlign: 'left' }}>
            获取方式：浏览器打开 www.qishui.com 并登录 → F12 → Application → Cookies → 复制整行
          </div>
          <button className="login-retry" onClick={() => void save()}>
            保存并登录
          </button>
          {msg && <div className="login-hint">{msg}</div>}
        </div>
      )}
    </div>
  )
}
