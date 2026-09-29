import { useEffect, useRef, useState } from 'react'

type Phase = 'loading' | 'show-qr' | 'scanned' | 'success' | 'expired' | 'logged-in' | 'error'

export function LoginApp(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading')
  const [qrimg, setQrimg] = useState('')
  const [nickname, setNickname] = useState('')
  const [msg, setMsg] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [cookie, setCookie] = useState('')
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    let stopped = false
    let key = ''

    const stopPoll = (): void => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    const poll = (): void => {
      timerRef.current = window.setInterval(async () => {
        if (stopped || !key) return
        try {
          const r = await window.gugu.music.qrPoll(key)
          if (r.status === 'scanned') setPhase('scanned')
          else if (r.status === 'confirmed') {
            stopPoll()
            setNickname(r.nickname ?? '')
            setPhase('success')
            window.setTimeout(() => window.close(), 1500)
          } else if (r.status === 'expired') {
            stopPoll()
            setPhase('expired')
          }
        } catch {
          /* 网络抖动继续轮询 */
        }
      }, 2200)
    }

    const start = async (): Promise<void> => {
      setPhase('loading')
      try {
        const { key: k, qrimg: img } = await window.gugu.music.qrCreate()
        key = k
        setQrimg(img)
        setPhase('show-qr')
        poll()
      } catch (e) {
        setMsg(String(e).slice(0, 80))
        setPhase('expired')
      }
    }

    void window.gugu.music.loginState().then((s) => {
      if (s.loggedIn) {
        setNickname(s.nickname ?? '')
        setPhase('logged-in')
      } else {
        void start()
      }
    })

    return () => {
      stopped = true
      stopPoll()
    }
  }, [])

  const saveManual = async (): Promise<void> => {
    if (!cookie.trim()) {
      setMsg('先粘贴 Cookie')
      return
    }
    setMsg('保存中…')
    const r = await window.gugu.music.cookieSet(cookie)
    if (r.ok) {
      setNickname('汽水听众')
      setPhase('success')
      window.setTimeout(() => window.close(), 1200)
    } else {
      setMsg('保存失败，检查内容后重试')
    }
  }

  return (
    <div className="login-app">
      <div className="login-title">🎵 汽水音乐</div>
      <div className="login-sub">免登录即可搜歌播放；登录仅为解锁完整曲库（可选）</div>

      <div className="login-qr-box">
        {phase === 'loading' && <div className="login-hint">正在获取二维码…</div>}
        {(phase === 'show-qr' || phase === 'scanned') && qrimg && (
          <>
            <img className={`login-qr ${phase === 'scanned' ? 'qr-dim' : ''}`} src={qrimg} alt="登录二维码" />
            <div className="login-hint">
              {phase === 'scanned'
                ? '已扫码，请在抖音上确认 ✓'
                : '打开抖音 App 扫一扫（若扫码后提示 404，是汽水官方确认页暂不可用，请改用下方 Cookie 登录）'}
            </div>
          </>
        )}
        {phase === 'success' && (
          <div className="login-success">
            <div className="login-bird">🥤</div>
            欢迎回来{nickname ? `，${nickname}` : ''}！
          </div>
        )}
        {phase === 'expired' && (
          <>
            <div className="login-bird">😵</div>
            <div className="login-hint">二维码过期了{msg ? `（${msg}）` : ''}</div>
            <button className="login-retry" onClick={() => location.reload()}>
              刷新二维码
            </button>
          </>
        )}
        {phase === 'logged-in' && (
          <>
            <div className="login-success">
              <div className="login-bird">🥤</div>
              已登录{nickname ? `：${nickname}` : ''}
            </div>
            <button
              className="login-retry"
              onClick={async () => {
                await window.gugu.music.logout()
                location.reload()
              }}
            >
              退出登录
            </button>
          </>
        )}
      </div>

      <button className="login-link" onClick={() => setShowManual((v) => !v)}>
        {showManual ? '收起 Cookie 登录' : '改用 Cookie 登录'}
      </button>
      {showManual && (
        <div className="login-manual">
          <textarea
            className="login-cookie-input"
            placeholder={'粘贴汽水 Cookie，如：\nsessionid=xxxxxxxx;'}
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            rows={3}
          />
          <button className="login-retry" onClick={() => void saveManual()}>
            保存
          </button>
        </div>
      )}
    </div>
  )
}
