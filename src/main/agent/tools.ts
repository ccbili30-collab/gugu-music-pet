// Agent 工具集：音乐（搜索/播放/控制/推荐/热评）+ 桌宠动作
import type { ToolDef } from './llm'
import type { Track, Comment } from '../music/provider'
import type { MusicService } from '../music/service'

export interface ToolContext {
  music: MusicService
  petAction: (action: string, params?: Record<string, unknown>) => void
  onSongsCard: (tracks: Track[]) => void
}

export interface ToolResult {
  output: string
  tracks?: Track[]
}

function fmtTracks(ts: Track[]): string {
  return ts.map((t, i) => `${i + 1}. ${t.name} - ${t.artists}${t.album ? `（${t.album}）` : ''} [id:${t.id}]`).join('\n')
}

export function toolDefinitions(): ToolDef[] {
  return [
    {
      type: 'function',
      function: {
        name: 'music_search',
        description: '搜索汽水音乐歌曲。用于"放首歌""来点周杰伦"等任何找歌需求',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '搜索词：歌名/歌手/氛围关键词' },
            limit: { type: 'number', description: '返回条数，默认 8' }
          },
          required: ['keyword']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'music_play',
        description: '播放歌曲（可传一组歌 id 组成队列，从第一首开始放）',
        parameters: {
          type: 'object',
          properties: {
            ids: { type: 'array', items: { type: 'string' }, description: '歌曲 id 列表（19 位大数字符串，勿转数字）' },
            name: { type: 'string', description: '想放的歌名（用于兜底搜索）' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'music_control',
        description: '播放控制：暂停/继续/上一首/下一首/停止/音量',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['pause', 'resume', 'toggle', 'prev', 'next', 'stop', 'volume'] },
            value: { type: 'number', description: 'action=volume 时 0~1 的音量' }
          },
          required: ['action']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'music_now_playing',
        description: '查询当前播放状态',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'music_recommend',
        description: '拿每日推荐/个性化推荐歌曲列表（不需要关键词时用这个）',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'music_comments',
        description: '拿当前歌曲（或指定 id）的热门评论，用于聊歌、共鸣（汽水源可能返回空）',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: '歌曲 id 字符串，缺省用当前播放的歌' }, limit: { type: 'number' } }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'pet_action',
        description: '做出桌宠动作：跳舞/坐下/睡觉/飞一圈/说话气泡',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['dance', 'hum', 'fly', 'sit', 'sleep', 'wake', 'say'] },
            text: { type: 'string', description: 'action=say 时气泡内容（≤14字）' }
          },
          required: ['action']
        }
      }
    }
  ]
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const { music } = ctx
  try {
    switch (name) {
      case 'music_search': {
        const keyword = String(args.keyword ?? '')
        const limit = Number(args.limit ?? 8)
        const tracks = await music.api.search(keyword, limit)
        if (tracks.length) ctx.onSongsCard(tracks)
        return { output: tracks.length ? `找到 ${tracks.length} 首：\n${fmtTracks(tracks)}` : '没搜到，换个关键词试试', tracks }
      }
      case 'music_play': {
        let ids = (args.ids as string[] | undefined) ?? []
        let tracks: Track[] = []
        if (ids.length) {
          tracks = await music.api.detail(ids)
        } else if (args.name) {
          tracks = (await music.api.search(String(args.name), 1)).slice(0, 1)
        }
        if (!tracks.length) return { output: '没有可播放的歌曲（可能需要先搜索）' }
        await playToRenderer(tracks, 0)
        return { output: `已开始播放队列（${tracks.length} 首）：\n${fmtTracks(tracks.slice(0, 5))}`, tracks }
      }
      case 'music_control': {
        const action = String(args.action)
        const map: Record<string, string> = { pause: 'toggle', resume: 'toggle', toggle: 'toggle', prev: 'prev', next: 'next', stop: 'stop' }
        if (action === 'volume') {
          music.command('volume', Number(args.value ?? 0.8))
          return { output: `音量已设为 ${Math.round(Number(args.value ?? 0.8) * 100)}%` }
        }
        music.command(map[action] ?? action)
        return { output: `已执行 ${action}` }
      }
      case 'music_now_playing': {
        const s = music.api.currentState()
        return {
          output: s.track
            ? `${s.playing ? '播放中' : '暂停中'}：《${s.track.name}》- ${s.track.artists}，队列 ${s.queueCount} 首，进度 ${Math.round(s.positionSec)}/${Math.round(s.durationSec)}s${s.trial ? '（试听）' : ''}`
            : '当前没放歌'
        }
      }
      case 'music_recommend': {
        const tracks = await music.api.recommend()
        if (tracks.length) ctx.onSongsCard(tracks)
        return { output: `推荐 ${tracks.length} 首：\n${fmtTracks(tracks)}`, tracks }
      }
      case 'music_comments': {
        const id = String(args.id ?? music.api.currentState().track?.id ?? '')
        if (!id) return { output: '没有正在播放的歌，也没指定 id' }
        const comments: Comment[] = await music.api.comments(id, Number(args.limit ?? 4))
        return {
          output: comments.length
            ? comments.map((c) => `「${c.content.replace(/\n/g, ' ').slice(0, 60)}」—— ${c.userName}（${c.likedCount}赞）`).join('\n')
            : '这首歌还没有热评'
        }
      }
      case 'pet_action': {
        const action = String(args.action)
        ctx.petAction(action, { text: args.text ? String(args.text) : undefined })
        return { output: `已执行动作 ${action}` }
      }
      default:
        return { output: `未知工具 ${name}` }
    }
  } catch (e) {
    return { output: `工具 ${name} 出错：${e instanceof Error ? e.message : String(e)}` }
  }
}

/** 播放队列推给宠物窗口的 audio 引擎执行 */
async function playToRenderer(tracks: Track[], startIndex: number): Promise<void> {
  const { musicService } = await import('../music/service')
  musicService.playInRenderer(tracks, startIndex)
}
