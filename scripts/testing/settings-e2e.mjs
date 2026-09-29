// 设置面板端到端测试：设置窗打开 → 城市保存 → 音量下发 → 角色包切换（真实 app + CDP）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const list = async () => (await (await fetch('http://127.0.0.1:9222/json/list')).json()).filter((t) => t.type === 'page')

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  }
  const ready = new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })
  const ev = async (expression) =>
    (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value
  return { ws, ready, send, ev }
}

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failed++
}

// ---- pet 页：静音 + 打开设置窗 ----
const pages = await list()
const pet = pages.find((t) => t.title === 'Gugu Pet')
if (!pet) {
  console.error('no pet page', pages.map((t) => t.title))
  process.exit(1)
}
const p = connect(pet.webSocketDebuggerUrl)
await p.ready
await p.ev(`window.__guguAudio.setMuted(true); 'muted'`)
await p.ev(`window.gugu.openSettings(); 'ok'`)
await sleep(2500)

// ---- 设置窗校验 ----
const pages2 = await list()
const settings = pages2.find((t) => t.title.includes('设置'))
if (!settings) {
  console.error('no settings page', pages2.map((t) => t.title))
  process.exit(1)
}
console.log('settings window open:', settings.title)
const s = connect(settings.webSocketDebuggerUrl)
await s.ready

// 界面渲染（托盘弹出面板）
const hasPanel = await s.ev(`!!document.querySelector('.panel')`)
const rowCount = await s.ev(`document.querySelectorAll('.panel-row').length`)
const hasStatus = await s.ev(`!!document.querySelector('.panel-status')`)
check('面板容器渲染', hasPanel === true)
check('面板含实时状态卡', hasStatus === true)
check('面板分区行 ≥ 4', rowCount >= 4, `got ${rowCount}`)

// 城市保存
const cityBefore = await s.ev(`window.gugu.settings.get().then(r=>r.city)`)
await s.ev(`window.gugu.settings.setCity('北京').then(r=>JSON.stringify(r))`)
const cityAfter = await s.ev(`window.gugu.settings.get().then(r=>r.city)`)
check(`城市保存（${cityBefore} → ${cityAfter}）`, cityAfter === '北京')

// 音量下发（pet 窗 <audio> 应跟随）
await s.ev(`window.gugu.settings.setVolume(0.3).then(r=>JSON.stringify(r))`)
await sleep(500)
const vol = await p.ev(`window.__guguAudio.state.volume`)
check('音量下发到宠物窗 audio', Math.abs(vol - 0.3) < 0.01, `volume=${vol}`)

// 角色包切换（应有 chick；切换后引擎 currentPackId 变化 + 持久化）
const packs = await s.ev(`window.gugu.packsList().then(r=>r.map(x=>x.id).join(','))`)
check('角色包列表', String(packs).includes('chick'), String(packs))
if (String(packs).includes('chick')) {
  await s.ev(`window.gugu.settings.switchPack('chick').then(r=>JSON.stringify(r))`)
  await sleep(1500)
  const enginePack = await p.ev(`window.__guguEngine.currentPackId`)
  const savedPack = await s.ev(`window.gugu.petPackGet()`)
  check('切换角色包 → 引擎热切换', enginePack === 'chick', `engine=${enginePack}`)
  check('切换角色包 → 持久化', savedPack === 'chick', `saved=${savedPack}`)
  // 切回 pigeon
  await s.ev(`window.gugu.settings.switchPack('pigeon').then(r=>JSON.stringify(r))`)
  await sleep(1200)
}

// LLM 配置读写（复用 llm:*）
await s.ev(`window.gugu.chat.configSet({llm:{baseUrl:'http://127.0.0.1:8787', apiKey:'k', model:'m'}}).then(r=>JSON.stringify(r))`)
const llmCfg = await s.ev(`window.gugu.chat.configGet().then(r=>JSON.stringify(r.llm))`)
check('LLM 配置保存', String(llmCfg).includes('8787'), String(llmCfg).slice(0, 80))

console.log(failed === 0 ? '\nsettings-e2e: ALL PASS' : `\nsettings-e2e: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
