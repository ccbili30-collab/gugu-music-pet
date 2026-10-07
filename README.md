# 🐟 大肥鱼音乐桌宠 · Gugu Music Pet

> 一只会聊天、懂音乐、随音律跳舞的桌宠——把 2021 年的 Windows 桌宠「咕咕」复活成 macOS 上的 DeepSeek 鲸鱼娘「大肥鱼」。

![demo](docs/demo.gif)

Electron + TypeScript + PixiJS · LLM 工具调用 · 汽水音乐（本地解密 sidecar）· 实时节拍编舞

---

## 它会做什么

| | |
|---|---|
| 🐟 **大肥鱼本色出演** | DeepSeek 鲸鱼娘贴纸 24 张（官方 dafeiyu-001 图库），原图直出、洪水填充抠白，待机呼吸微压缩拉伸 |
| 🎨 **自由换宠** | 设置里「导入图片自制宠物」：选几张图（白底/透明底都行）立刻变身；托盘/设置随时切换 |
| 🖱 **全屏自由** | 全屏透明置顶层 + 区域级点击穿透；拖拽投掷物理（弹墙/落地挤压）、悬浮模式可停在屏幕任何位置 |
| 💬 **双击对话** | 双击宠物头顶弹出输入框（注意力阶梯：单条回复向上堆叠、空闲顺序消散、思考禁蒸发）；LLM 点歌 tool-calling 全自动 |
| 🎵 **汽水音乐** | 本地 go-music-api sidecar 完成搜索/加密流解密；免登录可播，粘贴 Cookie 解锁全曲库 |
| 🕺 **8 拍编舞** | 节拍确定性曲线（弹跳/摇摆/点头/扭腰/重音Pop/滑步），能量门槛选动作、大招回基础、帧按动作边界锁定；高音只做一次性 Pop 点缀 |
| 🗨 **碎碎念** | 听歌期间 16-34s 一条：哼当前歌歌词碎片 / LLM 即兴一句话 / 内置吐槽池 |
| 🎤 **伴唱夸夸** | 话筒跟唱，唱完给 AI 夸夸小结（无 LLM 有内置兜底） |
| 🌧 **EMO 场景** | 雨夜/深夜走到角落自听：♪哼歌气泡（实时歌词）、纯共鸣不评歌、氛围变暗；邀请「一起听吗？」恢复 AI 歌评 |
| 🎭 **自主行为** | 随机心情→挑歌单→听歌→哼歌/跳舞（设置里一键演示）；听歌慢摇微形变；启动问候 |
| 🎛 **极简播放栏** | 宠物脚下居中小胶囊：可拖动进度条（点击/拖动 seek）、封面进度、话筒、控制 |
| ⚙️ **透明设置面板** | 托盘左键弹出毛玻璃面板：LLM 服务商预设（DeepSeek/GLM/Qwen/Kimi/Ollama）/天气城市/音量/pet 大小/角色包/自主演示 |

![settings](docs/settings.png)

![chat](docs/chat.png)

## 下载安装（macOS · Apple Silicon）

1. 下载 Release 里的 `gugu-music-pet-<版本>-arm64.dmg`，拖入「应用程序」
2. **首次打开**：未签名公证，双击被拦时**右键 → 打开 → 再点打开**
3. 伴唱需**麦克风权限**（系统弹窗允许）
4. 托盘左键 → 设置：选 LLM 服务商芯片 → 填 API Key → 测试连接（不配也能玩，聊天/歌评走内置兜底）
5. 想解锁汽水完整曲库：托盘 → 登录汽水音乐（官网登录后 F12 复制 Cookie 粘贴）

## 两分钟演示动线

1. 拖起大肥鱼甩出去——弹墙、落地挤压（物理）
2. 双击头顶 → 「来点适合写代码的歌」→ 歌曲卡片 → 点卡片直接播
3. 放一首劲歌——**8 拍编舞**踩点跳舞，安静段慢摇碎碎念
4. 播放栏**拖动进度条**快进，托盘右键换角色/调节大小
5. 设置 → 🎭 自主行为演示——随机心情自己挑歌单听歌哼歌
6. 右键托盘 → 看看热评 / 雨夜 EMO 演示
7. 设置 → 导入图片自制宠物——三张图 10 秒变身

## 技术亮点

- **全屏透明窗 + 区域级点击穿透**：宠物窗覆盖整个工作区（20ms 轮询光标 vs 交互区域），宠物可到任何位置；拖拽带 pointer capture 不丢事件
- **汽水音乐 sidecar**：字节私有协议经本地 go-music-api 子进程解密（端口竞态自愈、崩溃自动复活）；歌曲 id 为 19 位大数全链 string
- **8 拍编舞系统**：动作=节拍相位确定性曲线（起止归位/幅度硬上限），随机只在选动作；纯函数可单测
- **music:// 流代理**：undici 自定义协议解决 CORS 喂 AnalyserNode；失联 4s 判停守卫防幽灵播放态
- **注意力阶梯交互**：peek→唤醒→锁定→顺序消散，全部状态机化（headchat-e2e 13 项回归）
- **测试实例隔离**：`--gugu-test` 独立 userData，自动化永不污染用户 key/历史

## 架构速览

```
主进程 (src/main)
  music/        汽水 sidecar 管理 + provider（解密流/歌词/搜索）+ music:// 代理 + 失联守卫
  agent/        brain（tool-calling 循环）/ scenes（EMO/碎碎念/自主演示）/ prompt / memory / drives
  petpack.ts    自定义宠物导入（nativeImage → 洪水填充抠白 → gugu-pack:// 协议加载）
  settings.ts   设置面板 IPC · tray.ts 全功能原生菜单 · pack-scheme.ts 自定义包协议

渲染层 (src/renderer)
  pet/          Pixi 引擎 · physics（投掷/悬浮）· dance（8拍编舞）· beat（BPM）· motion（呼吸/慢摇）
  overlay/      头顶对话（注意力阶梯）· 播放栏（拖动seek）· 气泡 · 热评卡
  chat/ login/ settings/  各窗口（React，奶油玻璃×珊瑚视觉）

角色包  characters/dafeiyu（24 贴纸，洪水分水抠白+原图直出）→ npm run bake
```

## 开发

```bash
# Node ≥ 22（.npmrc 已配国内镜像）；首次需 Go ≥1.25 编译 sidecar
npm install
./scripts/build-sidecar.sh
npm run bake     # 大肥鱼角色包 + 像素图标
npm run dev      # 开发模式
npm test         # 55 个单测（物理/节拍/驱动力/编舞曲线）
npm run dist     # 烘焙 + 构建 + electron-builder 打 dmg
```

自动化（隔离实例，永不碰用户数据）：

```bash
npx electron-vite dev -- --remote-debugging-port=9222 --gugu-test
node scripts/testing/mock-llm.mjs          # 本地 mock LLM
node scripts/testing/{agent,headchat,settings,drag}-e2e.mjs
node scripts/testing/capture-demo.mjs      # 演示 GIF 素材采集
```

## 致谢

- 大肥鱼贴纸来自 [yyh-001/dsh-meme-packs](https://github.com/yyh-001/dsh-meme-packs) `dafeiyu-001`（v1.3.0，personal 许可，仅演示/个人使用）
- 前世：[gugu-desktop-pet](https://github.com/ccbili30-collab/gugu-desktop-pet)（Python/Windows，2021）——人格提示词与记忆格式源自它

## License

MIT
