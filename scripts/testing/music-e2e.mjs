// CDP 端到端验证：在宠物页面里真实执行音乐链路 + 检查渲染初始化
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = list.find((t) => t.title === 'Gugu Pet')
if (!page) {
  console.error('NO PET PAGE', list.map((t) => t.title))
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.text }
  return r.result?.result?.value
}

// 0. 强制整页刷新，确保拿到最新代码
await send('Page.enable')
await send('Page.reload')
await new Promise((r) => setTimeout(r, 6000))

console.log('canvas ok:', await evalJs(`!!document.querySelector('canvas')`))
console.log('pack loaded:', await evalJs(`fetch('characters/pigeon/pack.json').then(r=>r.ok)`))

const search = await evalJs(`window.gugu.music.search('晴天 周杰伦', 2).then(r=>r.map(t=>t.id+':'+t.name+'/'+t.artists))`)
console.log('search:', JSON.stringify(search))
if (Array.isArray(search) && search.length) {
  const id = Number(String(search[0]).split(':')[0])
  const resolved = await evalJs(`window.gugu.music.resolve(${id}).then(r=>({url:r.url, trial:r.trial, err:r.error}))`)
  console.log('resolve:', JSON.stringify(resolved))
  if (resolved?.url) {
    const status = await evalJs(`fetch(${JSON.stringify(resolved.url)}).then(r=>r.status+' ct='+(r.headers.get('content-type')||'?')+' len='+(r.headers.get('content-length')||'?'))`)
    console.log('proxy fetch:', JSON.stringify(status))
  }
  const comments = await evalJs(`window.gugu.music.comments(${id}, 2).then(r=>r.map(c=>c.userName+':'+c.content.slice(0,20)))`)
  console.log('comments:', JSON.stringify(comments))
}
const rec = await evalJs(`window.gugu.music.recommend().then(r=>r.length+' 首: '+r.slice(0,3).map(t=>t.name).join('|'))`)
console.log('recommend:', JSON.stringify(rec))
const qr = await evalJs(`window.gugu.music.qrCreate().then(r=>({key:!!r.key, img:r.qrimg.slice(0,22)}))`)
console.log('qr:', JSON.stringify(qr))
process.exit(0)
