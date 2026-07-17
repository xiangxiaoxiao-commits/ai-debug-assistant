# AI Debug Assistant

本地优先的 AI 排障助手。粘贴问题 + 日志 + cURL + SQL + **截图**，多轮对话式定位 bug，自动维护「一个 bug 一份档案」和「一个项目一份记忆」。

**版本**：0.6.1
**GitHub**：<https://github.com/xiangxiaoxiao-commits/ai-debug-assistant>

## 特性

- **对话式排障**：不是一次性提问，可以持续补充证据、修正描述、追问细节
- **Bug 档案管理**：每个 bug 一个 Case，AI 自动生成状态（待分析/排查中/已解决/搁置）+ 一句话结论 + 根因 + 修复方案
- **多模态输入**：粘贴 / 拖拽 / 上传截图，AI 直接看图分析（自动匹配 vision-capable 模型：Claude Opus/Sonnet/Haiku、GPT-4o、Qwen-VL、GLM-4V…）
- **代码上下文**：给出仓库路径，AI 会 grep 关键文件片段
- **右侧独立流程图面板**：AI 每次分析输出的 ASCII 代码执行链路（含 `[Class.method:行号]` 高亮）单独展示在右侧，可拖拽调整宽度（240px–900px，位置持久化）
- **实时进度反馈**：等 LLM 回复期间，实时显示每一步 trace 完成情况（快速录入 / 读代码 / 加载知识 / 构建 prompt / LLM 调用 …），不会让人怀疑是否卡住
- **可视化 AI 执行链路**：每次分析 8-9 步 trace timeline，含耗时条形图
- **可编辑 Playbook**：AI 自动生成排障流程模板，用户可增/删/改/重排步骤
- **项目记忆自动进化**：Bug 解决时自动提炼教训沉淀到项目记忆；下次同项目新 bug 自动召回历史经验
- **Feature 自动分类**：Bug 按业务模块归类，同模块共享知识库
- **相似历史检索**：新 Bug 自动查找同项目已解决的相似 Case
- **纯本地**：所有数据在 `~/.ai-debug-assistant/`，不上云
- **自动检测模型配置**：读 `~/.claude/settings.json`、环境变量、`.env.local`
- **可脱离主工具的独立记忆服务**：`memory-service/` 子目录 + MCP server，可挂 Claude Desktop / Cursor 单独使用

## 快速开始

要求：Node.js 20+（用 `nvm use` 会自动读 `.nvmrc`）

**macOS / Linux**：

```bash
git clone https://github.com/xiangxiaoxiao-commits/ai-debug-assistant.git
cd ai-debug-assistant
npm install
npm run dev
open http://localhost:8787
```

**Windows**（PowerShell / CMD）：

```powershell
git clone https://github.com/xiangxiaoxiao-commits/ai-debug-assistant.git
cd ai-debug-assistant
npm install
npm run dev
start http://localhost:8787
```

或者不想 clone 源码：从 [releases](https://github.com/xiangxiaoxiao-commits/ai-debug-assistant/releases) 下载 zip → 解压 → 双击 `start.bat`（Windows）或 `./start.sh`（Mac/Linux）。

首次打开后：

1. 左上方蓝色横幅会自动列出检测到的本地模型配置（Claude Code / 环境变量 / .env.local）
2. 选一份 + 填模型名（如 `claude-opus-4-7` / `gpt-4o` / `deepseek-chat`）→ 点「使用此配置」
3. 主区出现新建表单 → 粘贴问题描述 → 可选选代码目录 → 点「开始分析」
4. AI 流式回复后可继续追问，摘要卡片自动更新

## 主要能力

### 对话与追问

底部输入框粘贴新信息，`⌘/Ctrl+Enter` 发送：

- 新的日志 / 堆栈 / SQL 报错
- "补充：接口返回体是 `{status: 3}`"
- "换个思路，会不会是缓存问题？"

AI 基于**累计所有证据**回答；如果推翻前一轮结论会明确说「修正：…」。超过 30k 字符时早期消息自动压缩成"背景摘要"。

### 截图 / 图片

三种方式：
- **粘贴**：截屏后在输入框 `⌘/Ctrl+V`
- **拖拽**：图片文件拖到输入框区域
- **点击**：🖼️ 图片按钮选文件

单次最多 6 张，单张 ≤8MB。发送后：图片存到 `attachments/`，AI 通过多模态 API 直接"看"到（前提：模型支持 vision）。Trace 里 build-prompt 步会显示"构建提示词 N 字符 · M 张图"。

### 可视化执行链路

每条 AI 回复下方「查看执行链路 ▾」展开：

```
✓ quick-ingest       快速录入用户消息        2ms   [▓]
✓ read-code          读取代码上下文          187ms [▓▓▓]
✓ load-knowledge     加载功能知识库 5 条     4ms   [▓]
○ find-similar       相似案例已从关联列表加载 0ms
✓ load-knowledge     加载项目记忆            2ms   [▓]
✓ build-prompt       构建提示词 18234 字符 · 2 张图  0ms
✓ llm-call           调用 LLM (claude-opus-4-7)  5423ms [▓▓▓▓▓▓▓▓▓▓]
✓ extract-summary    提取 Bug 摘要           891ms [▓▓]
✓ update-playbook    更新 Playbook 进度      312ms [▓]
```

耗时条形图直观显示每步耗时占比，一眼看到 LLM 调用是主要开销。

### Bug 生命周期与项目记忆

- 建 Case → 按 `repoPath` 自动挂到 Project（记忆容器）
- 对话中每次发消息，自动 recall 该项目的已知模式（BM25 + strength 加权）
- 用户改状态为 `已解决` → 后台 LLM 自动提炼教训 → 存为 semantic/procedural 记忆
- 同项目下一个新 Bug → AI 一开始就能引用之前的根因/修复方案

**这是"进化"能力的核心**：用户什么都不用做，AI 越用越懂你的项目。

### Playbook 编辑

摘要卡下方的排障 Playbook 卡片：
- AI 自动生成 3-6 步初始流程
- 每步可改状态（todo/doing/done/skipped）、编辑标题、加备注、删除
- 支持增加新步骤、上下调整顺序
- 每轮对话后 AI 自动推进对应步骤状态

### 项目记忆浏览器

左栏顶部切到「项目档案」tab：
- 项目列表 + 每个项目的 identity（技术栈、约定、目录布局）
- 按 kind（core / semantic / procedural / resource / episodic）分组的记忆列表
- 手动编辑 / 删除任何一条

### 状态管理

左栏 Bug 列表按状态筛选：**待分析 / 排查中 / 已解决 / 搁置**
- 点 bug 加载对话历史
- 摘要卡右上角「改状态 ▾」手动改
- AI 每轮回复也会自动重新抽取状态

## 数据落盘

- **macOS / Linux**：`~/.ai-debug-assistant/`
- **Windows**：`%USERPROFILE%\.ai-debug-assistant\`（即 `C:\Users\你的用户名\.ai-debug-assistant\`）

```
~/.ai-debug-assistant/
├── config.json                       # 模型配置（含 API Key）
├── cases/
│   ├── index.json                    # bug 列表索引
│   └── {caseId}/
│       ├── case.json                 # 主体（messages、summary、playbook、traceIds、projectId）
│       ├── evidence/{id}.json        # 拆分的证据
│       ├── attachments/{id}.{ext}    # 图片二进制
│       └── traces/{id}.json          # 执行链路记录
├── features/
│   └── {featureId}.json              # 业务模块知识库
└── memory/projects/
    └── {projectId}/
        ├── project.json              # 项目 identity
        └── memories/{id}.json        # 单条记忆
```

想换目录：`AI_DEBUG_HOME=/path npm run dev`
想清空重来：`rm -rf ~/.ai-debug-assistant/cases`（保留 config）

## 分发

### 打独立可运行包（给同事/朋友）

```bash
./scripts/package.sh
```

产出 `dist/ai-debug-assistant-*.zip`（含 standalone Node.js + node_modules + 启动脚本，同事只要装 Node 20+ 就能跑）。

### 独立记忆服务

`memory-service/` 是一个独立的 Next.js 项目，只含记忆能力，可脱离主工具使用：

```bash
cd memory-service
npm install
npm run dev            # 起在 8788
npm run build:mcp      # 编译 MCP server
```

挂到 Claude Desktop 的 config：

```json
{
  "mcpServers": {
    "ai-memory": {
      "command": "node",
      "args": ["/绝对路径/memory-service/dist/mcp/memory-server.js"]
    }
  }
}
```

详见 [`docs/MEMORY.md`](./docs/MEMORY.md)。

## 常见问题

**Q：Key 会不会泄露？**
A：`~/.ai-debug-assistant/config.json` 仅本机可读。后端只对你配置的 `baseUrl` 发外发请求。所有日志都会打码 API Key。

**Q：代码仓库能被读到什么？**
A：只在给出 `repoPath` 时才读。忽略 `.git/objects`、`node_modules`、`target`、`dist`、`build`、`.venv`、`__pycache__`、任何 `.env*`、`*.pem`、`*credentials*`。路径必须在 `$HOME` 下。

**Q：模型不支持 vision 但我贴了图？**
A：图片会被自动忽略（backend 检测 model 名字包含 opus/sonnet/haiku/gpt-4o/vision/vl 等关键词），不报错，AI 只处理文字。

**Q：模型上下文会不会爆？**
A：对话 30k 字符预算，超出时压缩早期消息为"背景摘要"。证据按类型分层截断。图片累计 12MB 上限、6 张封顶。

**Q：能同时开多个 bug 吗？**
A：能。UI 一次只显示一个，左栏列表能随时切换。数据完全隔离。

**Q：怎么分享给同事？**
A：三种方式
- 让同事 `git clone` 本仓库（推荐，能更新）
- 发桌面上打好的 zip 包（`AI排障助手-分享包/`）
- 发独立 memory-service zip（只要记忆能力时）

## 开发

```bash
npm run test        # 一次跑完（283 个测试）
npm run test:watch  # 监听
npm run typecheck
npm run build       # 生产构建
```

架构：[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
执行链路详解：[`docs/CALL-GRAPH.md`](./docs/CALL-GRAPH.md) + [`docs/CALL-GRAPH-CREATE-CASE.md`](./docs/CALL-GRAPH-CREATE-CASE.md)
记忆系统详解：[`docs/MEMORY.md`](./docs/MEMORY.md)

## 版本

- **0.6.1** — Windows 兼容（跨平台路径分隔符、大小写不敏感对比、跨平台打包脚本 `npm run package`、UI 路径 placeholder 双系统提示）
- **0.6.0** — 右侧独立流程图面板（可拖拽宽度）+ 实时 trace 进度反馈 + AI 输出分卡（智能识别 ## 标题）
- **0.5.0** — Vision 端到端（截图上传 + 多模态 LLM）
- **0.4.0** — UI 全套（Trace timeline + Playbook 编辑 + 项目记忆浏览器）
- **0.3.0** — 独立 memory service（HTTP + MCP + SDK）+ 内部自吃
- **0.2.0** — Feature 分类 + 相似检索 + Trace + Playbook backend
- **0.1.0** — 静态工作台 → 对话式流程 → 目录选择器

## 未实现（待做）

- **规则引擎**：spec 里设计过 YAML 规则匹配，Phase 3 简化为纯 LLM，规则库未落地
- **codegraph 集成**：现在的代码读取靠 grep，可换成 codegraph MCP 拿调用链
- **mcp-chrome**：cURL/HAR 靠粘贴，可直连当前浏览器抓包
- **多 Case 批量导出**
