// 设置面板端到端测试：设置窗打开 → 城市保存 → 音量下发 → 角色包切换（真实 app + CDP）
// 自定义包夹具：复制 dafeiyu 为 userData/characters/custom-e2e（模拟导入产物，测 gugu-pack 协议链路）
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync as _rf, existsSync as _ex } from 'node:fs'
// 测试实例（--gugu-test）的 userData 路径；否则用户真实目录
const UD_ROOT = (() => {
  try {
    if (_ex('/tmp/gugu-test-ud')) return _rf('/tmp/gugu-test-ud', 'utf8').trim()
  } catch {}
  return join(homedir(), 'Library/Application Support/Gugu Music Pet')
})()
{
  const ud = join(UD_ROOT, 'characters/custom-e2e')
  mkdirSync(ud, { recursive: true })
  copyFileSync('src/renderer/public/characters/dafeiyu/sheet.png', join(ud, 'sheet.png'))
  const pk = JSON.parse(readFileSync('src/renderer/public/characters/dafeiyu/pack.json', 'utf8'))
  pk.id = 'custom-e2e'
  pk.name = '自定义测试鱼'
  writeFileSync(join(ud, 'pack.json'), JSON.stringify(pk))
}

// ⚠️ 测试隔离：快照并最终恢复用户 config.json（LLM key 不被 mock 覆盖）
const CFG = join(UD_ROOT, 'config.json')
const BAK = '/tmp/gugu-config-bak.json'
const HIST = join(UD_ROOT, 'chat-history.json')
const HBAK = '/tmp/gugu-hist-bak.json'
const hadCfg = existsSync(CFG)
const hadHist = existsSync(HIST)
if (hadCfg) copyFileSync(CFG, BAK)
if (hadHist) copyFileSync(HIST, HBAK)
// 测试前清空聊天历史：e2e 的 mock 对话会污染 brain 上下文（真实 LLM 看到假历史就不调工具）
if (hadHist) unlinkSync(HIST)
process.on('exit', () => {
  if (hadCfg) copyFileSync(BAK, CFG)
  else if (existsSync(CFG)) unlinkSync(CFG)
  if (hadHist) copyFileSync(HBAK, HIST)
  else if (existsSync(HIST)) unlinkSync(HIST)
})

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

// 角色包：唯一预设 dafeiyu + 自定义包（gugu-pack 协议）热切换
const packs = await s.ev(`window.gugu.packsList().then(r=>r.map(x=>x.id).join(','))`)
check('预设角色=大肥鱼', String(packs).includes('dafeiyu'), String(packs))
if (String(packs).includes('custom-e2e')) {
  await s.ev(`window.gugu.settings.switchPack('custom-e2e').then(r=>JSON.stringify(r))`)
  await sleep(1800)
  const enginePack = await p.ev(`window.__guguEngine.currentPackId`)
  const savedPack = await s.ev(`window.gugu.petPackGet()`)
  check('自定义包热切换(gugu-pack)', enginePack === 'custom-e2e', `engine=${enginePack}`)
  check('自定义包持久化', savedPack === 'custom-e2e', `saved=${savedPack}`)
  await s.ev(`window.gugu.settings.switchPack('dafeiyu').then(r=>JSON.stringify(r))`)
  await sleep(1500)
  check('切回大肥鱼', await p.ev(`window.__guguEngine.currentPackId`) === 'dafeiyu')
}

// LLM 配置读写（复用 llm:*）
await s.ev(`window.gugu.chat.configSet({llm:{baseUrl:'http://127.0.0.1:8787', apiKey:'k', model:'m'}}).then(r=>JSON.stringify(r))`)
const llmCfg = await s.ev(`window.gugu.chat.configGet().then(r=>JSON.stringify(r.llm))`)
check('LLM 配置保存', String(llmCfg).includes('8787'), String(llmCfg).slice(0, 80))

console.log(failed === 0 ? '\nsettings-e2e: ALL PASS' : `\nsettings-e2e: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
