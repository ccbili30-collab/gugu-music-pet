import { useEffect, useState } from 'react'

interface PackInfo {
  id: string
  name: string
  version: string
}

/**
 * 正式设置面板：LLM 大脑 / 天气城市 / 音量 / 角色包。
 * LLM 复用聊天窗的 llm:* IPC；音量走 music:command；角色包经主进程转发到宠物窗。
 */
export function SettingsApp(): JSX.Element {
  // LLM
  const [cfg, setCfg] = useState({ baseUrl: '', apiKey: '', model: '', personaName: '咕咕' })
  const [llmSaved, setLlmSaved] = useState('')
  const [testResult, setTestResult] = useState('')
  // 天气
  const [city, setCity] = useState('')
  const [citySaved, setCitySaved] = useState('')
  // 音量
  const [volume, setVolume] = useState(0.8)
  // 角色包
  const [packs, setPacks] = useState<PackInfo[]>([])
  const [currentPack, setCurrentPack] = useState('pigeon')

  useEffect(() => {
    void window.gugu.chat.configGet().then((c) => {
      setCfg({ baseUrl: c.llm.baseUrl, apiKey: c.llm.apiKey, model: c.llm.model, personaName: c.personaName })
    })
    void window.gugu.settings.get().then((s) => setCity(s.city))
    void window.gugu.music.playerState().then((s) => {
      if (typeof s.volume === 'number') setVolume(s.volume)
    })
    void window.gugu.packsList().then(setPacks)
    void window.gugu.petPackGet().then(setCurrentPack)
  }, [])

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
    setTestResult(r.ok ? '连接成功 ✓' : `失败：${r.error?.slice(0, 80) ?? '未知错误'}`)
  }

  const saveCity = async (): Promise<void> => {
    const r = await window.gugu.settings.setCity(city)
    if (r.ok) {
      setCity(r.city ?? city)
      setCitySaved('已保存，天气会按新城市刷新 ✓')
      window.setTimeout(() => setCitySaved(''), 2500)
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

  return (
    <div className="settings-app">
      <div className="settings-scroll">
        <div className="settings-section">
          <div className="cs-title">🧠 LLM 大脑（OpenAI 兼容）</div>
          <input
            className="cs-input"
            placeholder="Base URL，如 https://api.deepseek.com"
            value={cfg.baseUrl}
            onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
          />
          <input
            className="cs-input"
            placeholder="API Key"
            type="password"
            value={cfg.apiKey === '__SET__' ? '' : cfg.apiKey}
            onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
          />
          <input
            className="cs-input"
            placeholder="模型，如 deepseek-chat / glm-4.7"
            value={cfg.model}
            onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
          />
          <input
            className="cs-input"
            placeholder="宠物名字"
            value={cfg.personaName}
            onChange={(e) => setCfg({ ...cfg, personaName: e.target.value })}
          />
          <div className="cs-row">
            <button className="cs-btn" onClick={() => void saveLlm()}>
              保存
            </button>
            <button className="cs-btn cs-btn-ghost" onClick={() => void testLlm()}>
              测试连接
            </button>
            {llmSaved && <span className="cs-result">{llmSaved}</span>}
            {testResult && <span className="cs-result">{testResult}</span>}
          </div>
          <div className="settings-hint">不填也能用：歌评/共鸣/夸夸有内置文案兜底</div>
        </div>

        <div className="settings-section">
          <div className="cs-title">🌤️ 天气城市（场景引擎用）</div>
          <div className="settings-inline">
            <input
              className="cs-input"
              placeholder="城市名，如 上海 / 杭州"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveCity()
              }}
            />
            <button className="cs-btn" onClick={() => void saveCity()}>
              保存
            </button>
          </div>
          {citySaved && <div className="settings-hint">{citySaved}</div>}
          <div className="settings-hint">雨夜 EMO 场景按这里的天气判断是否下雨</div>
        </div>

        <div className="settings-section">
          <div className="cs-title">🔊 音量</div>
          <div className="settings-inline">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => applyVolume(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <span className="settings-volume-num">{Math.round(volume * 100)}%</span>
          </div>
          <div className="settings-hint">拖动实时生效，会记住</div>
        </div>

        <div className="settings-section">
          <div className="cs-title">🐦 角色包</div>
          {packs.length === 0 && <div className="settings-hint">没找到角色包（先跑 npm run bake）</div>}
          {packs.map((p) => (
            <button
              key={p.id}
              className={`settings-pack${p.id === currentPack ? ' settings-pack-active' : ''}`}
              onClick={() => void switchPack(p.id)}
            >
              <span>{p.id === currentPack ? '●' : '○'}</span>
              <span className="settings-pack-name">{p.name}</span>
              <span className="settings-pack-ver">{p.version || p.id}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
