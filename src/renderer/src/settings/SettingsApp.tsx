import { useEffect, useState } from 'react'

interface PackInfo {
  id: string
  name: string
  version: string
}

const PRESETS = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7' },
  { name: '通义 Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: '本地 Ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b' }
]

interface PlayerLite {
  track: { name: string; artists: string } | null
  playing: boolean
  volume: number
}

/**
 * 托盘弹出设置面板（Keepresso 式）：挂在菜单栏图标下方的毛玻璃层。
 * 顶部实时状态 + LLM / 天气城市 / 音量 / 角色包 / 快捷入口。
 */
export function SettingsApp(): JSX.Element {
  // LLM
  const [cfg, setCfg] = useState({ baseUrl: '', apiKey: '', model: '', personaName: '大肥鱼' })
  const [llmSaved, setLlmSaved] = useState('')
  const [testResult, setTestResult] = useState('')
  // 天气
  const [city, setCity] = useState('')
  const [citySaved, setCitySaved] = useState('')
  // 音量
  const [volume, setVolume] = useState(0.8)
  // pet 缩放
  const [petScale, setPetScale] = useState(1)
  // 角色包
  const [packs, setPacks] = useState<PackInfo[]>([])
  const [currentPack, setCurrentPack] = useState('dafeiyu')
  const [importMsg, setImportMsg] = useState('')
  const [demoMsg, setDemoMsg] = useState('')
  // 顶部实时状态
  const [player, setPlayer] = useState<PlayerLite | null>(null)

  useEffect(() => {
    void window.gugu.chat.configGet().then((c) => {
      setCfg({ baseUrl: c.llm.baseUrl, apiKey: c.llm.apiKey, model: c.llm.model, personaName: c.personaName })
    })
    void window.gugu.settings.get().then((s) => setCity(s.city))
    void window.gugu.music.playerState().then((s) => {
      setPlayer({ track: s.track, playing: s.playing, volume: s.volume })
      if (typeof s.volume === 'number') setVolume(s.volume)
    })
    void window.gugu.packsList().then(setPacks)
    void window.gugu.petPackGet().then(setCurrentPack)
    const saved = Number(localStorage.getItem('gugu-scale') || '1')
    if (saved > 0) setPetScale(saved)
    const off = window.gugu.onMusicState(({ player: p }) => {
      setPlayer({ track: p.track, playing: p.playing, volume: p.volume })
    })
    return off
  }, [])

  const llmConfigured = !!(cfg.baseUrl && cfg.model && (cfg.apiKey === '__SET__' || cfg.apiKey))

  const saveLlm = async (): Promise<void> => {
    await window.gugu.chat.configSet({
      llm: { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model },
      personaName: cfg.personaName
    })
    setLlmSaved('已保存 ✓')
    window.setTimeout(() => setLlmSaved(''), 2000)
  }

  const testLlm = async (): Promise<void> => {
    await window.gugu.chat.configSet({
      llm: { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model },
      personaName: cfg.personaName
    })
    setTestResult('测试中…')
    const r = await window.gugu.chat.test()
    setTestResult(r.ok ? '连接成功 ✓' : `失败：${r.error?.slice(0, 60) ?? '未知'}`)
  }

  const saveCity = async (): Promise<void> => {
    const r = await window.gugu.settings.setCity(city)
    if (r.ok) {
      setCity(r.city ?? city)
      setCitySaved('已保存 ✓')
      window.setTimeout(() => setCitySaved(''), 2000)
    }
  }

  const applyVolume = (v: number): void => {
    setVolume(v)
    void window.gugu.settings.setVolume(v)
  }

  const switchPack = async (id: string): Promise<void> => {
    if (id === currentPack) return
    const r = await window.gugu.settings.switchPack(id)
    if (r.ok) setCurrentPack(id)
  }

  const importPet = async (): Promise<void> => {
    setImportMsg('选择图片中…')
    const r = await window.gugu.petImport()
    if (r.ok && r.id) {
      setImportMsg(`已导入 ${r.count} 帧`)
      const list = await window.gugu.packsList()
      setPacks(list)
      const sr = await window.gugu.settings.switchPack(r.id)
      if (sr.ok) setCurrentPack(r.id)
    } else {
      setImportMsg(r.error === 'canceled' ? '' : `导入失败：${r.error ?? '未知'}`)
    }
  }

  const statusTitle = player?.playing ? '播放中' : player?.track ? '已暂停' : '待命中'
  const statusSub = player?.track
    ? `♪ ${player.track.name} - ${player.track.artists}`
    : '桌宠待命 · 双击它聊聊想听什么'

  return (
    <div className="panel">
      <div className="panel-status">
        <div className="panel-status-icon">🕊️</div>
        <div className="panel-status-text">
          <div className="panel-status-title">{statusTitle}</div>
          <div className="panel-status-sub">{statusSub}</div>
        </div>
      </div>

      <div className="panel-sep" />

      <div className="panel-row">
        <span className="panel-label">🧠 LLM 大脑</span>
        <span className={`panel-badge ${llmConfigured ? 'panel-badge-ok' : 'panel-badge-warn'}`}>
          {llmConfigured ? '已配置' : '未配置'}
        </span>
      </div>
      <div className="panel-chips">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className={`panel-chip${cfg.baseUrl === p.baseUrl ? ' panel-chip-active' : ''}`}
            onClick={() => setCfg({ ...cfg, baseUrl: p.baseUrl, model: p.model })}
          >
            {p.name}
          </button>
        ))}
      </div>
      <input
        className="panel-input"
        placeholder="Base URL，如 https://api.deepseek.com"
        value={cfg.baseUrl}
        onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
      />
      <input
        className="panel-input"
        placeholder="API Key"
        type="password"
        value={cfg.apiKey === '__SET__' ? '' : cfg.apiKey}
        onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
      />
      <div className="panel-inline">
        <input
          className="panel-input"
          placeholder="模型，如 deepseek-chat"
          value={cfg.model}
          onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
        />
        <input
          className="panel-input panel-input-narrow"
          placeholder="名字"
          value={cfg.personaName}
          onChange={(e) => setCfg({ ...cfg, personaName: e.target.value })}
        />
      </div>
      <div className="panel-inline">
        <button className="panel-btn" onClick={() => void saveLlm()}>
          保存
        </button>
        <button className="panel-btn panel-btn-ghost" onClick={() => void testLlm()}>
          测试连接
        </button>
        {(llmSaved || testResult) && <span className="panel-hint">{llmSaved || testResult}</span>}
        {cfg.apiKey === '__SET__' && <span className="panel-hint">Key 已安全保存，留空即沿用</span>}
      </div>

      <div className="panel-sep" />

      <div className="panel-row">
        <span className="panel-label">🌤️ 天气城市</span>
        <div className="panel-inline panel-inline-right">
          {citySaved && <span className="panel-hint">{citySaved}</span>}
          <input
            className="panel-input panel-input-city"
            placeholder="城市"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveCity()
            }}
          />
          <button className="panel-btn" onClick={() => void saveCity()}>
            保存
          </button>
        </div>
      </div>
      <div className="panel-sub">雨夜 EMO 场景按这里判断是否下雨</div>

      <div className="panel-sep" />

      <div className="panel-row">
        <span className="panel-label">🔊 音量</span>
        <div className="panel-inline panel-inline-right">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => applyVolume(Number(e.target.value))}
            className="panel-range"
          />
          <span className="panel-volume-num">{Math.round(volume * 100)}%</span>
        </div>
      </div>

      <div className="panel-sep" />

      <div className="panel-row">
        <span className="panel-label">🐦 角色包</span>
        <div className="panel-inline panel-inline-right">
          {packs.map((p) => (
            <button
              key={p.id}
              className={`panel-chip${p.id === currentPack ? ' panel-chip-active' : ''}`}
              onClick={() => void switchPack(p.id)}
            >
              {p.name}
            </button>
          ))}
          {packs.length === 0 && <span className="panel-hint">先跑 npm run bake</span>}
        </div>
      </div>
      <div className="panel-inline">
        <button className="panel-btn" onClick={() => void importPet()}>
          ＋ 导入图片自制宠物
        </button>
        {importMsg && <span className="panel-hint">{importMsg}</span>}
      </div>
      <div className="panel-sub">选择若干图片（白底/透明底均可），即刻变身</div>

      <div className="panel-row">
        <span className="panel-label">🔍 pet 大小</span>
        <div className="panel-inline panel-inline-right">
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={petScale}
            onChange={(e) => {
              const v = Number(e.target.value)
              setPetScale(v)
              void window.gugu.petScale(v)
            }}
            className="panel-range"
          />
          <span className="panel-volume-num">{Math.round(petScale * 100)}%</span>
        </div>
      </div>

      <div className="panel-sep" />

      <button
        className="panel-link"
        onClick={() => {
          setDemoMsg('表演开始…')
          void window.gugu.petAutonomyDemo().then(() => setDemoMsg(''))
          window.setTimeout(() => setDemoMsg(''), 4000)
        }}
      >
        <span>🎭 自主行为演示（随机心情选歌单听歌哼歌）</span>
        <span className="panel-link-arrow">›</span>
      </button>
      {demoMsg && <div className="panel-hint">{demoMsg}</div>}

      <div className="panel-sep" />

      <button className="panel-link" onClick={() => window.gugu.openChat()}>
        <span>💬 打开聊天</span>
        <span className="panel-link-arrow">›</span>
      </button>
      <button className="panel-link" onClick={() => window.gugu.openLogin()}>
        <span>🎵 登录汽水音乐</span>
        <span className="panel-link-arrow">›</span>
      </button>

      <div className="panel-sep" />

      <button className="panel-link panel-link-danger" onClick={() => window.gugu.quit()}>
        <span>🚪 退出 pet</span>
      </button>
    </div>
  )
}
