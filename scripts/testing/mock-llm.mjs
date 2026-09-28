// Mock OpenAI 兼容服务器：脚本化 tool-calling 会话，用于无真实 key 的端到端测试
import http from 'node:http'

const port = 8787
let n = 0

const server = http.createServer((req, res) => {
  if (!req.url?.includes('/chat/completions')) {
    res.writeHead(404).end()
    return
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const data = JSON.parse(body)
    const msgs = data.messages ?? []
    n++
    const isMemory = msgs[0]?.content?.includes?.('memory manager')
    const isAutonomy = msgs[1]?.content?.includes?.('想自己做一件小事')

    let out
    if (isMemory) {
      out = { store: false }
    } else if (isAutonomy) {
      out = { intent: 'none', bubble: '', kaomoji: '( ˘ω˘ )' }
    } else if (msgs.some((m) => m.role === 'tool' && String(m.content).includes('开始播放'))) {
      out = { content: '放好啦，这句前奏一响我就会飞♪kaomoji♪(๑>◡<๑)', done: true }
    } else if (msgs.some((m) => m.role === 'tool' && String(m.content).includes('找到'))) {
      // 第二轮：从搜索结果里挑第一首播放
      const toolMsg = msgs.find((m) => m.role === 'tool' && String(m.content).includes('找到'))
      const idMatch = /\[id:(\d+)\]/.exec(String(toolMsg.content))
      const id = idMatch ? Number(idMatch[1]) : 3440441479
      out = {
        content: null,
        tool_calls: [
          { id: `call_${n}`, type: 'function', function: { name: 'music_play', arguments: JSON.stringify({ ids: [id] }) } }
        ]
      }
    } else {
      out = {
        content: null,
        tool_calls: [
          { id: `call_${n}`, type: 'function', function: { name: 'music_search', arguments: JSON.stringify({ keyword: '晴天', limit: 3 }) } }
        ]
      }
    }

    const isFinal = typeof out.content === 'string'
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: isFinal ? out.content : out.content ?? null,
              ...(out.tool_calls ? { tool_calls: out.tool_calls } : {})
            }
          }
        ],
        usage: { total_tokens: 100 }
      })
    )
    console.log(`[mock] req#${n} memory=${!!isMemory} autonomy=${!!isAutonomy} final=${isFinal}`)
  })
})
server.listen(port, () => console.log(`mock llm on :${port}`))
