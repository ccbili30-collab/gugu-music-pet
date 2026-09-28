import { useEffect, useRef, useState } from 'react'

type Phase = 'loading' | 'show-qr' | 'scanned' | 'success' | 'expired' | 'logged-in' | 'error'

export function LoginApp(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading')
  const [qrimg, setQrimg] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    let key = ''
    let stopped = false

    const start = async (): Promise<void> => {
      setPhase('loading')
      try {
        const { key: k, qrimg: img } = await window.gugu.music.qrCreate()
        key = k
        setQrimg(img)
        setPhase('show-qr')
        poll()
      } catch (e) {
        setError(String(e))
        setPhase('error')
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
            window.setTimeout(() => window.close(), 1600)
          } else if (r.status === 'expired') {
            stopPoll()
            setPhase('expired')
          }
        } catch {
          /* 网络抖动继续轮询 */
        }
      }, 2000)
    }

    const stopPoll = (): void => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    void start()
    return () => {
      stopped = true
      stopPoll()
    }
  }, [])

  return (
    <div className="login-app">
      <div className="login-title">🎵 网易云音乐登录</div>
      <div className="login-sub">登录后咕咕才能帮你点歌、看每日推荐</div>
      <div className="login-qr-box">
        {phase === 'loading' && <div className="login-hint">正在获取二维码…</div>}
        {(phase === 'show-qr' || phase === 'scanned') && qrimg && (
          <>
            <img className={`login-qr ${phase === 'scanned' ? 'qr-dim' : ''}`} src={qrimg} alt="登录二维码" />
            <div className="login-hint">{phase === 'scanned' ? '已扫码，请在手机上确认 ✓' : '打开网易云音乐 App 扫码'}</div>
          </>
        )}
        {phase === 'success' && (
          <div className="login-success">
            <div className="login-bird">🕊️</div>
            欢迎回来{nickname ? `，${nickname}` : ''}！
          </div>
        )}
        {phase === 'expired' && (
          <>
            <div className="login-bird">😵</div>
            <div className="login-hint">二维码过期了</div>
            <button className="login-retry" onClick={() => location.reload()}>
              刷新二维码
            </button>
          </>
        )}
        {phase === 'error' && <div className="login-hint">出错了：{error}</div>}
      </div>
    </div>
  )
}
