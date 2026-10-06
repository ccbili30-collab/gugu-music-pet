// 头顶对话气泡「注意力阶梯」端到端验证（轮询式，容忍 mock/网络波动）
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
  const ev = async (e) =>
    (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value
  return { ready, send, ev, ws }
}
const poll = async (fn, ms, step = 300) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await fn()) return true
    await sleep(step)
  }
  return await fn()
}

const IDLE_FADE_POLL = 12000
const pet = (await list()).find((t) => t.title === 'Gugu Pet')
const p = connect(pet.webSocketDebuggerUrl)
await p.ready
let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failed++
}

await p.ev(`window.__guguAudio.setMuted(true); localStorage.removeItem("gugu-hc-onboarded"); "m"`)
await p.ev(`window.gugu.chat.configSet({llm:{baseUrl:"http://127.0.0.1:8787", apiKey:"k", model:"mock-1"}}).then(r=>"cfg")`)
await p.ev(`location.reload()`)
await sleep(6000)
await p.ev(`(() => { const e = window.__guguEngine; e.walking = null; e.minorAction = { kind: "sit", until: performance.now() + 300000 }; return "sit" })()`)

const phase = () => p.ev(`(() => { const h = document.querySelector(".head-chat"); if (!h) return "none"; return h.classList.contains("hc-peek") ? "peek" : h.classList.contains("hc-open") ? "open" : h.classList.contains("hc-fading") ? "fading" : "other" })()`)

// 1. 引导
check('首次引导提示', (await p.ev(`!!document.querySelector(".hc-onboard")`)) === true)

// 2. 双击唤醒（立刻弹出）
const PC = JSON.parse(await p.ev(`JSON.stringify(window.__guguEngine.petLocal)`))
const cx = Math.round(PC.x), cy = Math.round(PC.y - 30)
for (const _ of [1, 2]) {
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1, pointerType: 'mouse' })
  await sleep(60)
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1, pointerType: 'mouse' })
  await sleep(140)
}
check('双击立刻 open', (await poll(async () => (await phase()) === 'open', 1500)) === true)
check('唤醒即单对话框(无历史回复)', (await p.ev(`document.querySelectorAll(".hc-reply").length`)) === 0)
check('自动聚焦', (await poll(async () => (await p.ev(`document.activeElement?.classList.contains("hc-input")`)) === true, 1500)) === true)
check('引导已消失', (await p.ev(`!document.querySelector(".hc-onboard")`)) === true)

// 4. 输入 + 回复（轮询 20s 容忍工具链波动）
await p.send('Input.insertText', { text: '来一首晴天' })
await sleep(300)
let val = await p.ev(`document.querySelector(".hc-input")?.value ?? ""`)
if (!val) {
  await p.ev(`(() => { const inp = document.querySelector(".hc-input"); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; set.call(inp, "来一首晴天"); inp.dispatchEvent(new Event("input", { bubbles: true })); inp.focus(); return "fb" })()`)
  await sleep(150)
}
await p.ev(`document.querySelector(".hc-send")?.click(); "s"`)
check('回复入堆', (await poll(async () => (await p.ev(`document.querySelectorAll(".hc-reply:not(.hc-thinking)").length`)) >= 1, 20000, 500)) === true)

// 5. engaged 锁定（回复到达后 3s 内确认，避开 6s 空闲蒸发）
await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 60, y: 60, button: 'none', pointerType: 'mouse' })
check('engaged 鼠标离开不收', (await phase()) === 'open', `phase=${await phase()}`)

// 6. 顺序消散：轮询等 hidden，并验证输入框也走了消散类
let sawBarEvap = false
const fadingSeen = await poll(async () => {
  if (await p.ev(`!!document.querySelector(".hc-bar-evap")`)) sawBarEvap = true
  return (await phase()) === 'none'
}, 15000, 300)
check('顺序消散 → hidden', fadingSeen === true)
check('输入框参与顺序消散', sawBarEvap === true)

// 6.5 不交互也会自己消散（新用例：唤醒后不输入，等消散）
for (const _ of [1, 2]) {
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1, pointerType: 'mouse' })
  await sleep(60)
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1, pointerType: 'mouse' })
  await sleep(140)
}
check('不交互唤醒', (await poll(async () => (await phase()) === 'open', 1500)) === true)
check('不点不输入→自己从上到下消散', (await poll(async () => (await phase()) === 'none', IDLE_FADE_POLL, 500)) === true)

// 7. 再双击 → 唤醒且不带历史
for (const _ of [1, 2]) {
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1, pointerType: 'mouse' })
  await sleep(60)
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1, pointerType: 'mouse' })
  await sleep(140)
}
check('再双击唤醒', (await poll(async () => (await phase()) === 'open', 3000)) === true)
check('不带历史(单对话框)', (await p.ev(`document.querySelectorAll(".hc-reply").length`)) === 0)

console.log(failed === 0 ? '\nheadchat-e2e: ALL PASS' : `\nheadchat-e2e: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
