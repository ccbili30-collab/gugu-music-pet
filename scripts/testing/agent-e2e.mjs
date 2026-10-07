// Agent 端到端测试：mock LLM → 工具调用 → 真实播放 → 状态回报

// ⚠️ 测试隔离：快照并最终恢复用户 config.json（LLM key 不被 mock 覆盖）
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'node:fs'
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

const get = async (path) => (await fetch('http://127.0.0.1:9222/json/list')).then().then(async (r) => (await r.json()).filter((t) => t.title.includes(path)))
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const pet = list.find((t) => t.title === 'Gugu Pet')
if (!pet) { console.error('no pet page'); process.exit(1) }

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value
  return { ws, ready, send, ev }
}

const p = connect(pet.webSocketDebuggerUrl)
await p.ready

// 打开聊天窗
await p.ev(`window.gugu.openChat(); 'ok'`)
await new Promise((r) => setTimeout(r, 3000))
const list2 = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const chat = list2.find((t) => t.title.includes('聊天'))
if (!chat) { console.error('no chat page', list2.map((t) => t.title)); process.exit(1) }
console.log('chat window open:', chat.title)

const c = connect(chat.webSocketDebuggerUrl)
await c.ready
// 配置 mock LLM + 调低音量
console.log('configSet:', await c.ev(`window.gugu.chat.configSet({llm:{baseUrl:'http://127.0.0.1:8787', apiKey:'test-key', model:'mock-1'}}).then(r=>JSON.stringify(r))`))
await c.ev(`window.gugu.music.report({volume:0.12}); 'vol'`)
// 发消息
console.log('send:', await c.ev(`(window.gugu.chat.send('来一首晴天'), 'sent')`))
await new Promise((r) => setTimeout(r, 9000))

// 校验：聊天回复 / 播放状态 / 气泡
const replySeen = await c.ev(`!!document.querySelector('.bubble-pet') ? document.querySelectorAll('.bubble-pet')[document.querySelectorAll('.bubble-pet').length-1]?.textContent : 'none'`)
console.log('last pet bubble in chat:', JSON.stringify(String(replySeen).slice(0, 50)))
const cardSeen = await c.ev(`!!document.querySelector('.song-card')`)
console.log('song card rendered:', cardSeen)
const player = await p.ev(`window.gugu.music.playerState().then(s=>({track:s.track? s.track.name+' / '+s.track.artists : null, playing:s.playing, vol:s.volume, trial:s.trial}))`)
console.log('player state:', JSON.stringify(player))
process.exit(0)
