# gugu-music-pet 任务交接文档

> 更新时间：2026-09-28 · M1–M7 全部完成（M7 于新机器收尾并实测） · 项目进度：可交付

## 2026-10-07 晚间追加

- **连击手感**：单击即跳（地面弹跳 vy -340~-500 + 随机水平抖动 + 强挤压 + 爱心），悬浮态点击也给冲量跳动；连点连跳。
- **头顶输入框极简**：透明底 + 1px 墨色细线（focus 加深），发送钮同款细线无填充。
- **文案全面 pet 化**：用户可见字符串的 咕咕/gugu 全部换成 pet（personaName 默认 'pet'；窗口/托盘/气泡/提示词）。内部标识（window.gugu、gugu-pack://、productName）未动——productName 改动会换 userData 路径导致用户丢配置。
- **LLM key 永久化**：机制本就安全（safeStorage→钥匙串 llmKeyEnc）；之前丢 key 是 **e2e 用 mock 覆盖了 config.json**——三套 e2e 已加 config 快照/恢复守卫；设置面板对已存 key 显示"留空即沿用"。

## 2026-10-07 大更新速览

- **宠物换代**：预设只剩**大肥鱼**（DeepSeek 鲸鱼娘贴纸，dafeiyu-001 v1.3.0 24 张，yyh-001/dsh-meme-packs，personal 许可，见 characters/dafeiyu/CREDIT.md）。烘焙链 `scripts/bake-image-pack.mjs`（sips 转 png → 纯 Node PNG 解码 lib-png.mjs → **洪水填充抠白**（只抠边连通背景白，2 轮近白蚀刻 + 3x3 羽化）→ **448 原图直出格（零压缩，超格才区域平均重采样）**，显示 ~104px；⚠️ 重采样反预乘必须 `255*cr/ca`——直接 `cr/ca` 会全黑（cr 是 a∈[0,1] 预乘、ca 是 0-255 原值累加））。pack.pixel=false → linear 采样（照片系）。pigeon/chick 已删（托盘图标固定入库不再生成；应用图标改为大肥鱼）。
- **自定义宠物导入**：设置面板「＋导入图片自制宠物」→ 主进程 petpack.ts（dialog 多选 → nativeImage → 抠白组包）→ userData/characters/custom-* → **gugu-pack://<id>/<file> 协议**供渲染层加载（pack-scheme.ts，loadPack 内置路径 404 时回退协议）。CSP 已加 gugu-pack:。
- **前端「奶油玻璃×珊瑚」**：:root tokens（--paper/--ink/--accent 珊瑚）；气泡/播放器/头顶对话/热评卡/设置面板统一换肤；**播放器重构**：封面图+歌名歌手+进度条+话筒+控制（regions 已同步新尺寸）。

## 这是什么项目

把 GitHub 上的老项目 `gugu-desktop-pet`（Python/tkinter/Windows 桌面鸽子）复活改造成 **macOS 音乐桌宠**：会聊天、懂音乐、能随音律舞动。参考旧仓库 `/Users/noven/bisai/music pet/gugu-desktop-pet`（旧项目仍在 GitHub 上， brains 的提示词/驱动力/记忆格式都已移植进本项目）。

核心概念：**交互桌宠 + 音乐 Agent（模仿汽水音乐小精灵）+ 随音律舞动 + 特殊场景（雨天/深夜 pet 自己听 EMO 歌哼歌共鸣）**。

## 新机器快速开始

```bash
# 1. Node >= 22（没有的话用国内镜像装，或 brew install node）
# 2. 克隆 + 安装（.npmrc 已配 npmmirror + electron 国内镜像，无需额外配置）
git clone <本仓库地址>
cd gugu-music-pet
npm install
npm run bake     # 烘焙角色包（characters/*/source.json → 精灵图+pack.json）
npm run dev      # 启动（鸽子会出现在屏幕角落）
```

常用命令：`npm run typecheck` · `npm run build` · `node scripts/testing/mock-llm.mjs`（本地 mock LLM 服务器，端口 8787）

**首次使用配置**：双击宠物 → 聊天窗右上角 ⚙️ 填 LLM（任意 OpenAI 兼容：DeepSeek/GLM/Qwen 的 base_url + key + model）→ 测试连接。网易云登录：托盘菜单「扫码登录网易云」（不登录也能搜歌放非 VIP 曲目）。

## 里程碑状态（M1–M6 已完成并验证）

| 里程碑 | 状态 | 验证方式 |
|---|---|---|
| M1 骨架与身体 | ✅ | electron-vite + 透明置顶窗 + 鸽子帧动画 + 变换律动层 + 物理/拖拽投掷 |
| M2 角色包系统 | ✅ | `npm run bake` 通用烘焙器 + 小鸡「皮蛋」+ mirrorOf 镜像槽位 + 右键菜单热切换 |
| M3 音乐后台 | ✅ | **真实网络验证**：搜索/取链(320k)/热评/歌词/推荐/QR登录全通；`music://` 流代理 200 |
| M4 Agent 大脑 | ✅ | **mock LLM 端到端验证**：tool-calling→搜索→播放→气泡/歌曲卡片全链路跑通 |
| M5 音律与伴唱 | ✅ | **实测 BPM 113/114**（Dynamite），danceEnergy 0.70 宠物随节拍跳舞；伴唱引擎+夸夸池完成 |
| M6 场景与卡片 | ✅ | emo 场景验证：角落+hun 动画+音量 0.35+氛围；CDN 403 已修（resolve 预检+重取）；哼歌/共鸣/邀请/热评卡完成 |
| M7 收尾 | ✅ 2026-09-28 完成 | 设置面板+33 单测+dmg 打包实测+README/GIF，见下文「M7 完成记录」 |

## M7 待办清单（下一台电脑的工作）

> **2026-09-28 已全部完成**，实施记录如下，供后来者对照：

1. **设置面板 ✅**（后升级为**托盘弹出面板**）：左键点击菜单栏托盘图标 → 弹出挂在图标下方的毛玻璃面板（`vibrancy: 'popover'`，失焦自动收起，Keepresso 式），顶部有实时播放状态卡；右键托盘仍是传统菜单（播放控制/登录/退出）。渲染层 `src/renderer/src/settings/SettingsApp.tsx`（四分区：LLM/天气城市/音量/角色包）。主进程 `src/main/settings.ts`（`settings:*` / `pet:pack:*` IPC）；`store.ts` 的 AppConfig 增加 `packId`；engine 启动时读持久化角色包，`pet:command` 新增 `pack` 分支。托盘面板显示/定位逻辑在 `tray.ts`（`toggleSettingsPanel`/`showSettingsPanel`，含 blur 后 300ms 内不重弹的防抖）。e2e：`scripts/testing/settings-e2e.mjs`（9 项全过）。
2. **vitest 单测 ✅**：`tests/{physics,beat,drives}.test.ts` 共 33 用例（`npm test`）。vitest 配置在 `vitest.config.ts`（node 环境，三个目标文件都是纯函数无 electron 依赖）。
3. **electron-builder 打 dmg ✅**：配置 `electron-builder.yml`；麦克风权限双保险——`build/entitlements.mac.plist`（audio-input + Electron 三件套）+ Info.plist `NSMicrophoneUsageDescription`（extendInfo），另加 `LSUIElement`（无 Dock 图标）。角色包走 asar 内 `out/renderer/characters`（vite 自动拷 public，packs.ts 打包路径本来就对，无需改）。图标由 `scripts/make-icon.mjs` 从鸽子 idle 帧生成 `build/icon.png`（1024，纯 Node PNG 编码器）。`npm run dist` = bake + build + electron-builder。**实测**：dmg 138MB，打包版 CDP 冒烟通过（packsList/真实搜索/设置窗/天气持久化）。注意：本机无 Developer ID 证书未签名，Gatekeeper 需右键打开（README 已写）。
4. **README ✅**：评委向 `README.md` + `docs/`（demo.gif 由 `scripts/testing/capture-demo.mjs` 用 CDP Page.startScreencast 录制后 ffmpeg-static 转制，无需屏幕录制权限；settings.png / chat.png 为 Page.captureScreenshot 截图）。

原待办（保留存照）：

1. **设置面板**：目前 LLM 配置藏在聊天窗 ⚙️，需要整合成正式设置窗（LLM/天气城市 `src/main/weather.ts` 的 setCity/音量默认值/角色包选择）。天气城市存 `userData/weather.json`。
2. **vitest 单测**：物理积分器（`src/renderer/src/pet/physics.ts`）、节拍检测（`beat.ts`，可喂合成频谱数据）、驱动力漂移（`src/main/agent/drives.ts`）。
3. **electron-builder 打 dmg**：`out/` 产物 + `build/` 图标已有。**必须**：mac entitlements 声明麦克风权限（`NSMicrophoneUsageDescription`，伴唱功能需要）；打包后角色包路径逻辑见 `src/main/packs.ts`（dev 用 `src/renderer/public/characters`，打包用 `out/renderer/characters`，打包时要把 characters 复制进 asar 或 extraResources 并对齐路径）。
4. **README**：面向比赛评委的介绍 + GIF 演示 + 下载安装。
5. （可选）LLM 流式输出：`src/main/agent/llm.ts` 目前非流式，加 SSE 流式体验更好。
6. （可选）骨骼角色：`pack.json` 的 `type` 字段已预留 `"spine"`，加载器在 `src/renderer/src/pet/pack.ts` 抛错占位。本期决定不做。

## 架构速览

```
主进程 (src/main)
  index.ts          app 生命周期/窗口/托盘/单实例；music:// 协议注册
  windows.ts        宠物窗(透明置顶 560x420,锚点 250,316)/聊天窗/登录窗
  clickthrough.ts   ★macOS 透明窗点击穿透：40ms 轮询光标 vs 渲染层上报的交互区域
  spawn.ts          出生点=屏幕角落+落点记忆(userData/pet-pos.json)
  tray.ts           动态菜单：当前歌/播放控制/登录/退出
  music/provider.ts 汽水 Provider（go-music-api sidecar HTTP 封装；Track.id 为 string）
  music/sidecar.ts   汽水 sidecar 子进程管理（PORT=28080，就绪探测，二进制 sidecar/go-music-api 不入库）
  music/proxy.ts    music:// 流代理(undici fetch，解决 CORS 喂 AnalyserNode)
  music/service.ts  登录态持久化/队列/状态广播；换歌钩子→场景引擎
  agent/brain.ts    会话编排：tool-calling 循环(≤4轮)+记忆提取+驱动力+自主性+反射
  agent/prompt.ts   全部提示词（T 人格移植+音乐伙伴+歌评/共鸣/夸夸池）
  agent/scenes.ts   ★场景引擎：雨天晚间/深夜→emo；哼歌(歌词片段)/纯共鸣/邀请
  agent/memory.ts   Markdown 记忆（兼容旧项目 memory/ 格式，可拷贝迁移）
  agent/drives.ts   四维驱动力（能量/社交/好奇/安逸，节奏调慢）
  weather.ts        Open-Meteo 免 key（城市可在 userData/weather.json 改）
  store.ts          config/chat-history/memory 目录管理

渲染层 (src/renderer, pet.html 是主入口)
  pet/engine.ts     ★引擎：Pixi 舞台+物理循环+槽位动画+交互+指令通道；调试钩子 window.__guguEngine
  pet/audio.ts      ★唯一 <audio>：取链播放+队列+Web Audio 图；setMuted() 静音不影响分析；钩子 window.__guguAudio
  pet/beat.ts       ★节拍检测：低频 flux+onset+BPM（实测准）
  pet/motion.ts     变换律动层：呼吸/squash&stretch/空中拉伸/走路颠簸/节拍弹跳摇摆
  pet/mic.ts        伴唱：getUserMedia+电平事件+夸夸池（LLM 或内置兜底）
  pet/regions.ts    交互区域计算（喂给主进程做点击穿透）
  overlay/*         气泡(右)/迷你播放器(头顶)/话筒圆球(右侧)/热评卡(左)/右键菜单
  chat/ChatApp.tsx  聊天窗：消息流/歌曲卡片点播/快捷chips/LLM设置
  login/LoginApp.tsx QR 扫码登录

角色包 (characters/*/source.json → npm run bake → src/renderer/public/characters/<id>/)
  pigeon 咕咕(15帧) · chick 皮蛋(8帧, walk_left/fly_left 用 mirrorOf 镜像)
  槽位词汇表：idle/stand/walk_*/fly_*/sit/sleep/peck/hum + fallbacks(dance→idle 等)
```

数据流：托盘/场景引擎 → 主进程 `music:command`/`pet:command` → 宠物窗引擎执行；引擎/音频 → `music:report`/`pet:event` → 主进程（大脑驱动力、场景钩子）→ 需要时回推 `pet:bubble`/`chat:reply`。所有跨窗口广播走 `music:state`。

## 关键决策记录（别推翻，有原因的）

- **两层动效模型（v1 定稿）**：帧动画 + 精灵整体变换（拉伸/挤压/摇摆），不做骨骼不做局部变形。变换层与帧层正交，任何角色包直接吃律动。
- **点击穿透**：macOS Electron 透明窗默认吞整窗事件，靠主进程轮询光标+区域上报切换 `setIgnoreMouseEvents`；拖拽中强制不穿透。
- **音频必须走 `music://` 代理**：直接喂网易云 CDN 会有 CORS，AnalyserNode 会拿到静音。代理用 undici 的 global fetch（net.fetch 会 ERR_BLOCKED_BY_CLIENT）。
- **消灭无效动态**：只留一个大脑调度器（自主动作 2–5 分钟一次）；旧项目 1–2 秒随机走路、canned 台词、"social bother" 全部没移植。闲时活力=呼吸/眨眼变换层。
- **emo 自听不评歌**：场景引擎 mode==='emo' 时 onTrackChange 直接 return，只发哼歌（歌词 API 取当前句）和纯共鸣（"呜呜呜"式）；接受邀请后 mode='listening' 恢复 40% 概率 AI 歌评。
- **LLM 没配置也要能跑**：歌评/共鸣/夸夸池都有内置兜底文案；agent 工具链不依赖 LLM 可用性。
- **安静自主性**：autonomy 冷却 120–300s，能量 <0.12 自动睡觉、>0.6 醒。

## 已知坑（新机器排查优先看这里）

- **CSP**：三个 html 都有 CSP meta。pixi 需要 `import 'pixi.js/unsafe-eval'`（已加）+ `worker-src 'self' blob:`（已加）。改 CSP 前先跑起来看 console。
- **CDN 403**：网易 CDN 签名链接偶尔 403，`provider.songUrl` 已做 Range 预检+重取一次；音频 error 事件自动跳下一首（每首限一次）。
- **网络**：国内直连 npm/github 会超时，.npmrc 已配镜像；gh push 若超时多重试。
- **测试时别外放音乐**：所有自动化验证先执行 `window.__guguAudio.setMuted(true)`（静音但节拍分析照常）。CDP 调试：`npx electron-vite dev -- --remote-debugging-port=9222`，然后跑 `scripts/testing/*.mjs`（先起 `mock-llm.mjs`）。
- **内存里的会话上下文**：重启后聊天历史从 userData/chat-history.json 恢复可见消息（工具调用细节不恢复）。
- **★ 音乐源已从网易云迁到汽水（2026-09-29）**：汽水是字节私有接口，走本地 sidecar（github.com/guohuiyuan/go-music-api，`scripts/build-sidecar.sh` 编译，gitignore）。**三大坑**：① 歌曲 id 是 19 位大数，全链 Track.id 必须 string（过 Number 精度丢失，mock-llm 踩过）；② 汽水扫码登录（护照接口 get_qrcode/check_qrconnect，协议同 PopDownloader）已实现但**官方确认页 bff-pc.qishui.com/ucenter_web/app/sdk-next 已 404 下线**——抖音扫码后 App 内显示 404，两种参数变体均如此，等官方恢复；当前登录走 Cookie 粘贴兜底（登录窗底部折叠），且**免登录已可搜索播放（实测 VIP 标记曲目也能取流）**，登录态只是可选增强；③ 汽水无热评接口，热评卡显示兜底文案。上游接口是逆向的，失效风险自担，demo 前务必跑一遍 music 链路。
- **★ 注意力阶梯（2026-10-06，头顶对话终版交互）**：HeadChat 为状态机 hidden→open(**双击宠物立刻弹出**,单对话框不带历史,自动聚焦)→engaged(打字锁定,鼠标离开不收)→fading(空闲6s顺序消散:回复旧→新逐条溶解150ms/条[模糊+上飘],输入框最后消散,然后hidden;移开/Esc走70ms快闪版;全部可打断)→hidden。关键护栏：**thinking 期间禁止蒸发**（慢 LLM 回复到家时若已蒸发会丢——已修：hidden 态收到挂起回复自动恢复会话）；悬停仅用于：消散打断恢复、未输入时移开 1.5s 快闪收起；消散后历史清空（每次唤醒都是干净的单对话框）；**空闲消散不再要求 engaged**——唤醒后不点不输入也会到点从上到下自己消散（open() 即记 lastActivity）。引擎 onPetHover 悬停回调（Pixi pointerover/out，拖拽抑制）；脚边按钮已删（悬停即入口）；首次引导气泡 localStorage gugu-hc-onboarded。e2e: scripts/testing/headchat-e2e.mjs（12 项）。
- **★ 头顶对话气泡（2026-09-30）**：行内聊天 overlay/HeadChat——脚边圆钮点开（不再开聊天窗），头顶输入框自动聚焦，Enter/↑ 发送，AI 回复向上堆叠（最多3条渐淡，新回复贴输入框），Esc 关闭；思考中三点动画。前提：brain.sendToChat 现在**同时广播聊天窗+宠物窗**（chat:reply）。聊天窗仍可从托盘「陪我聊聊」打开，历史共享。CDP 验证时注意：改 brain.ts（主进程）后必须整重启，HMR 只刷渲染层。
- **★ UI 分区定版（2026-09-30）**：跟随层内三区互斥——①播放条宠物**左上**(-258,-136)；②**语言区**（气泡）宠物**右侧专属槽**(54, 底40)，**单条气泡**（新气泡直接替换旧的，杜绝叠罗汉），超 3 行截断；③**聊天入口**像素圆钮脚边(56,-30)常驻，点击直达聊天窗。穿透区域三者全覆盖（regions.ts 同步）。深夜 EMO 自动播放已关（只哼歌）。
- **★ 交互收敛到 mac 托盘（2026-09-30 终版）**：自绘右键菜单整体移除（用户决策：没必要、全塞顶栏），功能全部进托盘原生菜单（右键托盘）：播放控制/随机来一首/热评/EMO 演示/聊天/走两步/飞一圈/悬浮开关/变大变小/角色包子菜单（从 store 读当前勾选）/设置/登录/退出。引擎 pet:command 新增 walk/hover/scale-up/scale-down/hotcomments 分支；热评卡经 bus 'hotComments' 事件打开。recommend() 优先非 VIP（VIP 流常取不到，避免随机播放连跳）。窗口内 contextmenu 只 preventDefault 不弹菜单。
- **★ Pixi v8 不路由 contextmenu（右键菜单失灵根因）**：`sprite.on('contextmenu')` 编译能过但永远不会被真实 DOM 事件触发（v8 只派发 pointer 系）。正确做法：App.tsx 的 useEffect 里 window 级 `addEventListener('contextmenu')`（React 生命周期托管，StrictMode 下挂载/清理有保证）+ 引擎 `contextMenuHit(x,y)` 命中测试（getBounds 有换帧竞态要 try/catch 退化估算）。教训：别在引擎里命令式绑 canvas 监听（StrictMode 双挂载时序下会神秘丢失），也别用无断言的 str.replace 编辑（锚点不存在会静默 no-op，App.tsx 那次就是这样漏掉的）。`sprite.on('contextmenu')` 编译能过但永远不会被真实 DOM 事件触发（v8 EventSystem 只派发 pointer 系/rightdown 系）。右键菜单必须自己在 canvas 上 `addEventListener('contextmenu')` + getBounds 命中测试（engine.onContextMenu），空白处不 preventDefault。CDP 合成右键不产生 contextmenu（Chromium 默认行为），自动化要用 DOM dispatchEvent 验证。
- **★ 宠物窗全屏化（2026-09-30，替代 560x420 跟随窗）**：原架构宠物装在 560x420 隐形窗里、窗口每帧跟宠物挪（pet:move）——快速拖拽时光标冲出隐形窗边界事件就断、宠物跟丢，这就是"隐藏窗口/没法全屏移动"的根源。现改为**宠物窗覆盖整个工作区**（windows.ts 用 primaryDisplay().workArea 创建 + `pet:fit` IPC 贴屏/跨屏），渲染层以工作区本地坐标画宠物（engine.petLocal / motionContainer 每帧取整定位），overlay 全部挂 `.follow-layer`（transform 跟随，DOM 直改不触发 React），穿透区域（regions.ts）改为宠物相对坐标并由 onPetMoved 节流上报（120ms）。**拖拽可靠性**：sprite pointerdown 时 setPointerCapture，光标跑出任何边界都不丢事件。Pixi 画布随窗口 resize 自适应。
- **★ 2026-09-30 评审修复与体验升级**：① tools schema 的歌曲 id 全部 string（LLM 返回 number 会精度丢失）；② 音量变化即落盘；③ brain 上下文截断从最近 user 边界切（防孤儿 tool 序列 400）、LLM 失败回滚本轮；④ sidecar 启动前 pkill 同路径遗留（孤儿清理）；⑤ music:// 代理 host 白名单（qishui/douyinvod/douyinpic/localhost）；⑥ LLM key 与汽水 cookie 用 safeStorage 加密落盘（兼容旧明文）；⑦ 窗口路由改引用（getChatWindow/getPetWindow）；⑧ sandbox: true；⑨ 深夜 EMO 不自动放歌只哼歌（雨夜保留）；⑩ 新增：悬浮模式（physics hover，右键开关，可拖到任意位置）、缩放（右键 ±，localStorage）、话筒进迷你播放条（独立话筒球已删）、像素渲染取整、点击穿透 40→20ms、UI 毛玻璃透明化、设置面板 LLM 服务商预设、songDetail 并行、engines 字段。
- **★ 播放误报"失败"与睡死（2026-09-29 修）**：① sidecar 对部分曲目解密会 502，但 inspect 探不出来——resolve 必须对真流做 Range 探测（provider.songUrl），死流直接跳下一首；② StrictMode 会挂两份引擎实例，destroy() 必须清干净 IPC 监听（audio/engine 的 onMusicCommand/onCommand 均已保存 off 引用），否则僵尸实例双份弹气泡；③ brain.tickLoops 每秒把 drives.mode 覆盖成 idle——sleeping 必须显式保护，否则能量恢复漂移失效、wake 永不触发（睡死根因）；引擎手动 sleep()/wake() 要 emit pet:event 让 brain 同步模式（并保证 ≥90s 最短睡眠，防高能量秒醒）。
- **dev 与打包版不能同时跑**：Electron 按 productName 取 userData（都叫 "Gugu Music Pet"），单实例锁会直接踢掉后启动的那个。测打包版前先退掉 `npm run dev` 的实例（打包版二进制可加 `--remote-debugging-port=9223` 挂 CDP）。
- **新机器环境**：这台机器 Node 装在 `~/.local/node`（symlink 到 `~/.local/bin`，已写入 zsh/bash profile）。非交互 shell 可能读不到 PATH，脚本里用绝对路径或先 `export PATH="$HOME/.local/bin:$PATH"`。
- **★ Pixi hitArea 与 anchor 无关（拖不动的元凶）**：Sprite 的 hitArea 坐标系以 position 为原点，anchor 只影响纹理绘制偏移。本宠 sprite anchor=(0.5,1)（脚底中心），hitArea 曾写成 `Rectangle(0,0,w,h)`，判定框整体错位到画面右下方 → 点击鸽子永远不命中、拖拽/右键/摸头全部失效（穿透层正常放行了事件，但渲染层 hitTest 落空）。正确写法 `Rectangle(-w/2, -h, w, h)`，已在 engine.ts buildSprite 修正。验证拖拽别只调 physics 方法，跑 `scripts/testing/drag-e2e.mjs`（CDP 走真实事件管线）。
- **StrictMode 双挂载与调试钩子**：dev 下 React StrictMode 会挂载两次引擎，`window.__guguEngine` 若在 engine init 里赋值会被后完成的僵尸实例覆盖（app=null）。现在由 App.tsx 在确认活实例后挂载；engine.destroy() 会移除 window 级 pointer 监听（匿名监听无法移除，曾泄漏）。

## 比赛演示动线（可直接照着演）

1. 鸽子在角落待着 → 拖起来扔出去，弹墙、落地挤压（物理+动效）
2. 右键 → 「随机来一首」→ 头顶出现迷你播放器，**鸽子随节拍跳舞**（BPM 检测）
3. 双击 → 聊天窗：「来点适合写代码的歌」→ 歌曲卡片 → 点卡片直接播（LLM 需先配好）
4. 右侧话筒圆球 → 跟唱，AI 夸夸弹幕；点击宠物摸头出爱心+颜文字
5. 右键 → 「演示：雨夜EMO」→ 宠物走到角落自听 EMO 歌单、♪哼歌气泡、纯共鸣不评歌、音量变小+氛围变暗 → 点它 → 「一起听吗？」→ 点【一起听♪】切回点评模式
6. 右键 → 「看看热评」→ 左侧热评卡轮播；托盘菜单有播放控制
7. 右键 → 换成「皮蛋」（小鸡）——角色包热切换

## 旧项目可挖的剩余资产

`gugu-desktop-pet`（GitHub: ccbili30-collab/gugu-desktop-pet）里还没移植的：飞行拼字彩蛋（PIL 字模→飞行路径拼写文字，pet_window.py:2581）、心形/8字飞行路径生成器、旧 memory/ 目录可以直接拷到 userData/memory/ 让鸽子"记得旧主人"。
