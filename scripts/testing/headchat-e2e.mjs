// 头顶对话气泡「注意力阶梯」端到端验证
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

const phase = () => p.ev(`(() => { const h = document.querySelector(".head-chat"); if (!h) return "none"; return h.classList.contains("hc-peek") ? "peek" : h.classList.contains("hc-open") ? "open" : h.classList.contains("hc-fading") ? "fading" : "other" })()`)

// 等落地
for (let i = 0; i < 40; i++) {
  if ((await p.ev(`window.__guguEngine.physics.mode`)) === 'ground') break
  await sleep(300)
}
await sleep(500)

// 冻结走动（idle walk 会把宠物带走导致 out）
await p.ev(`(() => { const e = window.__guguEngine; e.walking = null; e.minorAction = { kind: "sit", until: performance.now() + 120000 }; return "sit" })()`)
// 1. 引导提示（首次）
check('首次引导提示', (await p.ev(`!!document.querySelector(".hc-onboard")`)) === true)

// 2. 悬停 → peek（虚影，无输入框）
const PC = JSON.parse(await p.ev(`JSON.stringify(window.__guguEngine.petLocal)`))
await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(PC.x), y: Math.round(PC.y - 40), button: 'none', pointerType: 'mouse' })
await sleep(150)
check('悬停即 peek 虚影', (await phase()) === 'peek', `phase=${await phase()}`)
check('peek 无输入框', (await p.ev(`!document.querySelector(".hc-input")`)) === true)

// 3. 停留 300ms → open + 聚焦 + 引导消失
await sleep(400)
check('停留唤醒 open', (await phase()) === 'open')
await sleep(300)
check('自动聚焦', (await p.ev(`document.activeElement?.classList.contains("hc-input")`)) === true)
check('引导已消失', (await p.ev(`!document.querySelector(".hc-onboard")`)) === true)

// 4. 输入 + mock 回复堆叠（insertText 失焦兜底：原生 setter + input 事件）
await p.send('Input.insertText', { text: '来一首晴天' })
await sleep(250)
let val = await p.ev(`document.querySelector(".hc-input")?.value ?? ""`)
if (!val) {
  await p.ev(`(() => {
    const inp = document.querySelector(".hc-input")
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
    setter.call(inp, "来一首晴天")
    inp.dispatchEvent(new Event("input", { bubbles: true }))
    inp.focus()
    return "fallback"
  })()`)
  await sleep(150)
  val = await p.ev(`document.querySelector(".hc-input")?.value ?? ""`)
}
await p.ev(`document.querySelector(".hc-send")?.click(); "s"`)
await sleep(800)
for (let i = 0; i < 12; i++) {
  await sleep(1000)
  if (await p.ev(`window.__rawReply`)) { console.log(`DBG rawReply at +${(i + 1)}s:`, await p.ev(`window.__rawReply`)); break }
}
console.log("DBG replies in DOM:", await p.ev(`document.querySelectorAll(".hc-reply").length`), " phase:", await p.ev(`document.querySelector(".head-chat")?.className ?? "none"`))
await sleep(1000)
check('回复入堆', (await p.ev(`document.querySelectorAll(".hc-reply:not(.hc-thinking)").length`)) >= 1, await p.ev(`document.querySelector(".hc-reply .hc-text")?.textContent?.slice(0, 20)`))

// 5. 移开不收（engaged 锁定）
await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 60, y: 60, button: 'none', pointerType: 'mouse' })
await sleep(2200)
check('engaged 鼠标离开不收', (await phase()) === 'open')

// 6. 空闲 6s → 级联蒸发 → hidden（加速：等 8s）
await sleep(8500)
const ph6 = await phase()
check('空闲蒸发 → hidden', ph6 === 'none' || ph6 === 'fading', `phase=${ph6}`)
await sleep(3000)
check('蒸发完成', (await phase()) === 'none')

// 7. 再悬停 → 唤醒 + 旧回复淡显回溯（轮询等 dwell 完成）
await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(PC.x), y: Math.round(PC.y - 40), button: 'none', pointerType: 'mouse' })
let rewoke = false
for (let i = 0; i < 8; i++) {
  await sleep(300)
  if ((await phase()) === 'open') { rewoke = true; break }
}
check('再悬停唤醒', rewoke, `phase=${await phase()}`)
check('历史回溯(最近回复淡显)', (await p.ev(`document.querySelectorAll(".hc-reply").length`)) >= 1)

console.log(failed === 0 ? '\nheadchat-e2e: ALL PASS' : `\nheadchat-e2e: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
