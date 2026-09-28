// 演示素材采集：CDP Page.startScreencast 录宠物窗（跳舞→雨夜EMO）+ 设置/聊天窗静态截图
// 用法：先启动 app（--remote-debugging-port=9223）和 mock-llm.mjs，然后 node capture-demo.mjs <outdir>
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve(process.argv[2] ?? '/tmp/gugu-capture')
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const pages = async () =>
  (await (await fetch('http://127.0.0.1:9223/json/list')).json()).filter((t) => t.type === 'page')

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let seq = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    } else if (m.method) {
      for (const l of listeners) l(m)
    }
  }
  const ready = new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  const send = (method, params = {}) =>
    new Promise((r) => {
      const id = ++seq
      pending.set(id, r)
      ws.send(JSON.stringify({ id, method, params }))
    })
  const ev = async (expression) =>
    (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value
  return { ws, ready, send, ev, onEvent: (l) => listeners.push(l) }
}

// ---- 宠物窗：screencast 帧 ----
const pet = (await pages()).find((t) => t.title === 'Gugu Pet')
if (!pet) throw new Error('no pet page')
const p = connect(pet.webSocketDebuggerUrl)
await p.ready

// 静音（分析照常，跳舞不受影响）
await p.ev(`window.__guguAudio.setMuted(true); 'ok'`)

const frames = []
let lastFrameAt = 0
p.onEvent(async (m) => {
  if (m.method !== 'Page.screencastFrame') return
  void p.send('Page.screencastFrameAck', { sessionId: m.params.sessionId })
  const now = Date.now()
  if (now - lastFrameAt < 100) return // ~10fps
  lastFrameAt = now
  frames.push({ t: now, data: m.params.data })
})
await p.send('Page.enable')
await p.send('Page.startScreencast', { format: 'png', maxWidth: 560, maxHeight: 420, everyNthFrame: 1 })
console.log('screencast started')

// ---- 演出时间线 ----
// 1. 随机来一首：真实搜索 → 播放 → BPM 检测 → 随节拍跳舞 + 头顶迷你播放器
const track = await p.ev(
  `window.gugu.music.search('Dynamite BTS', 5).then(r => JSON.stringify(r.map(t=>({id:t.id,name:t.name,artists:t.artists,durationMs:t.durationMs}))))`
)
console.log('searched:', track?.slice(0, 80))
await p.ev(`window.gugu.music.playCard(JSON.parse(${JSON.stringify(track)}), 0); 'playing'`)
console.log('t=0 playing + dancing')
await sleep(9000)

// 2. 雨夜 EMO：走到角落自听、哼歌气泡、氛围变暗
await p.ev(`window.gugu.sceneForceEmo().then(()=>'emo')`)
console.log('t=9s emo scene')
await sleep(9000)

// 3. 收尾：再跳一会儿
await p.ev(`window.__guguEngine.setDance(0.8, 5000); 'dance'`)
await sleep(5000)

await p.send('Page.stopScreencast')
console.log('frames captured:', frames.length)

for (let i = 0; i < frames.length; i++) {
  writeFileSync(resolve(OUT, `frame_${String(i).padStart(4, '0')}.png`), Buffer.from(frames[i].data, 'base64'))
}

// ---- 静态截图：设置窗 + 聊天窗（mock LLM 点歌卡片） ----
await p.ev(`window.gugu.openSettings(); 'ok'`)
await sleep(1800)
const settings = (await pages()).find((t) => t.title.includes('设置'))
if (settings) {
  const s = connect(settings.webSocketDebuggerUrl)
  await s.ready
  await s.send('Page.enable')
  const shot = await s.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(resolve(OUT, 'settings.png'), Buffer.from(shot.result.data, 'base64'))
  console.log('settings.png saved')
}

await p.ev(
  `window.gugu.chat.configSet({llm:{baseUrl:'http://127.0.0.1:8787', apiKey:'demo', model:'mock-1'}}).then(r=>JSON.stringify(r))`
)
await p.ev(`window.gugu.openChat(); 'ok'`)
await sleep(1800)
const chat = (await pages()).find((t) => t.title.includes('聊天'))
if (chat) {
  const c = connect(chat.webSocketDebuggerUrl)
  await c.ready
  await c.send('Page.enable')
  await c.ev(`window.gugu.chat.send('来点适合写代码的歌'); 'sent'`)
  await sleep(9000)
  const shot = await c.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(resolve(OUT, 'chat.png'), Buffer.from(shot.result.data, 'base64'))
  console.log('chat.png saved')
}

// 恢复音量状态（不静音、停歌）
await p.ev(`window.__guguAudio.setMuted(false); window.__guguAudio.stop(); 'cleaned'`)
console.log('done →', OUT)
process.exit(0)
