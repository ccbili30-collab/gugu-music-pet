// 拖拽全链路验证：hitTest → 真实事件链（canvas pointerdown → window move/up）→ fling
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
  return { ready, send, ev, ws }
}

await sleep(4000) // 等 StrictMode 双挂载稳定
const pet = (await list()).find((t) => t.title === 'Gugu Pet')
const p = connect(pet.webSocketDebuggerUrl)
await p.ready

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failed++
}

console.log('hook alive:', await p.ev(`(() => { const e = window.__guguEngine; return e ? (e.app ? 'alive' : 'zombie') : 'none' })()`))
// 确保非悬浮（拖拽松手走重力弹道才是本测试的目标场景）
await p.ev(`(() => { const e = window.__guguEngine; if (e.isHovering || e.hoverRequested) e.toggleHover(); return 'reset' })()`)
await sleep(1200)
// 全屏窗模式：宠物本地坐标动态获取
const PET0 = JSON.parse(await p.ev(`JSON.stringify(window.__guguEngine.petLocal)`))
console.log('pet local:', PET0)

// 1. 精灵命中：bounds 覆盖点击点（rootBoundary.hitTest 是内部 API 不稳定，不用于断言）
const bounds = JSON.parse(await p.ev(`(() => { const b = window.__guguEngine.sprite.getBounds(); return JSON.stringify([b.x, b.y, b.width, b.height]) })()`))
const hitByBounds =
  bounds[0] <= PET0.x && PET0.x <= bounds[0] + bounds[2] && bounds[1] <= PET0.y - 30 && PET0.y - 30 <= bounds[1] + bounds[3]
check(`精灵 bounds 覆盖点击点(${PET0.x},${PET0.y - 30})`, hitByBounds, JSON.stringify(bounds))

// 2. CDP 系统事件链（走 Chromium 管线，等价真人点击路径的渲染层部分）
await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: PET0.x, y: PET0.y - 30, button: 'left', clickCount: 1, pointerType: 'mouse' })
await sleep(100)
const downOk = await p.ev(`window.__guguEngine.pointerDownAt > 0`)
check('canvas pointerdown 命中精灵', downOk === true)

// 快速长距离拖拽（朝屏幕中心方向，跨越旧 560x420 窗口边界——全屏窗+指针捕获应稳稳跟住）
const dirX = PET0.x > 735 ? -1 : 1
for (let i = 1; i <= 10; i++) {
  await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: PET0.x + dirX * i * 90, y: PET0.y - 30 - i * 45, button: 'left', pointerType: 'mouse', buttons: 1 })
  await sleep(30)
}
const mid = JSON.parse(await p.ev(`JSON.stringify({ mode: window.__guguEngine.physics.mode, dragging: window.__guguEngine.dragging })`))
check('拖拽中进入 drag 模式', mid.mode === 'drag' && mid.dragging === true, JSON.stringify(mid))

const endX = PET0.x + dirX * 900
const endY = Math.max(60, PET0.y - 30 - 450)
await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: endX, y: endY, button: 'left', clickCount: 1, pointerType: 'mouse' })
await sleep(600)
const after = JSON.parse(await p.ev(`JSON.stringify({ x: window.__guguEngine.physics.x | 0, y: window.__guguEngine.physics.y | 0, mode: window.__guguEngine.physics.mode })`))
check('松手后 fling 弹道', after.mode === 'ballistic' || after.mode === 'ground' || after.mode === 'hover', JSON.stringify(after))
const before = { x: 0 }
check('长距拖拽位移 >600px', Math.abs(after.x - PET0.x) > 600, `from ${PET0.x} to ${after.x}`)

// 3. 点击（非拖动）也要正常：摸头爱心
await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: PET0.x, y: PET0.y - 30, button: 'left', clickCount: 1, pointerType: 'mouse' })
await sleep(80)
await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 250, y: 300, button: 'left', clickCount: 1, pointerType: 'mouse' })
await sleep(300)
const clickFired = await p.ev(`window.__guguEngine.lastClickAt > 0`)
check('单击事件（摸头/kick）', clickFired === true)

// 恢复地面
await p.ev(`(() => { const ph = window.__guguEngine.physics; ph.startFling(0, 0); 'ok' })()`)
console.log(failed === 0 ? '\ndrag-e2e: ALL PASS' : `\ndrag-e2e: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
