# AI Debug Assistant

本地优先的 AI 排障助手。粘贴问题 + 日志 + cURL + SQL，多轮对话式定位 bug，自动维护「一个 bug 一份档案」。

## 特性

- 📝 **对话式排障**：不是一次性提问，可以持续补充证据、修正描述、追问细节
- 📋 **Bug 档案管理**：每个 bug 一个 Case，自动生成状态（待分析/排查中/已解决/搁置）+ 一句话结论 + 根因 + 修复方案
- 🔍 **代码上下文**：给出仓库路径，AI 会读关键文件片段
- 🔒 **纯本地**：Case / 对话 / 配置全部落盘到 `~/.ai-debug-assistant/`，不上云
- ⚙ **自动检测模型配置**：读 `~/.claude/settings.json`、环境变量、`.env.local`
- 📁 **图形化选目录**：无需手打路径

## 快速开始

要求：Node.js ≥ 20（用 `nvm use` 会自动读 `.nvmrc`）

```bash
git clone <repo>
cd ai-debug-assistant
npm install
npm run dev
open http://localhost:8787
```

首次打开后：

1. 左上方蓝色横幅会自动列出检测到的本地模型配置（Claude Code / 环境变量 / .env.local）
2. 选一份 + 填模型名（如 `claude-opus-4-7` / `deepseek-chat` / `gpt-4o-mini`）→ 点「使用此配置」
3. 主区出现新建表单 → 粘贴问题描述 → 可选选代码目录 → 点「开始分析」
4. AI 流式回复后可继续追问，摘要卡片自动更新

## 使用指南

### 场景 1：新建 bug 排查

主区看到「新建 Bug 排查」表单：

- **问题描述**（必填）：把现象、期望、日志片段、cURL、SQL 混着写都行，AI 会自动拆
- **代码仓库路径**（可选）：点 `📁 选择…` 弹出目录浏览器，Git 仓库会绿色置顶
- 「更多字段」可展开填工单号 / 环境 / 模块

点「开始分析」→ AI 流式给出诊断，摘要卡片出现在顶部。

### 场景 2：追问和补证据

对话继续进行——底部输入框粘贴新信息，⌘/Ctrl+Enter 发送：

- 新的日志 / 堆栈 / SQL 报错
- "补充：接口返回体是 `{status: 3}`"
- "换个思路，会不会是缓存问题？"

AI 会基于**累计的所有证据**回答，如果推翻前一轮结论会明确说「修正：…」。

对话轮数多了以后（> 4 轮或 prompt > 30k 字符），后端会自动把最早几轮压缩成一段「背景摘要」，避免上下文爆掉。

### 场景 3：切换 bug / 归档

左侧列表按状态筛选：**待分析 / 排查中 / 已解决 / 搁置**。

- 点 bug 加载对话历史
- 摘要卡片右上角「改状态 ▾」可以手动改状态（比如 fix 上线后改成「已解决」）
- 状态改动会同步到左侧列表

### 场景 4：调整模型配置

右上角 `⚙` 按钮打开设置弹窗：
- 检测到的候选列表
- 已保存配置的展示
- 手动填写表单

Key 保存在 `~/.ai-debug-assistant/config.json`，permissions 是当前 umask 默认。

## 数据在哪里

```
~/.ai-debug-assistant/
├── config.json                  # 模型配置（含 API Key）
└── cases/
    ├── index.json               # bug 列表索引
    └── {caseId}/
        ├── case.json            # 主体（含 messages 数组、summary 摘要）
        └── evidence/
            └── {evidenceId}.json # 拆分出来的证据（cURL/日志/SQL 等）
```

想换目录：`AI_DEBUG_HOME=/path npm run dev`

想清空重来：`rm -rf ~/.ai-debug-assistant/cases`（会保留 config）

## 键盘快捷键

- `⌘/Ctrl + Enter`（对话输入框）：发送消息

## 常见问题

**Q：Key 会不会泄露？**
A：`~/.ai-debug-assistant/config.json` 是普通文件，仅本机可读。后端只对你配置的 `baseUrl` 发外发请求，不打日志。

**Q：代码仓库能被读到什么？**
A：只在你给出 `repoPath` 时才读。有硬编码的忽略：`.git/objects`、`node_modules`、`target`、`dist`、`build`、`.venv`、`__pycache__`、任何 `.env*`、`*.pem`、`*credentials*`。路径必须在 `$HOME` 下，`/etc` `/private` 等会被拒。

**Q：模型上下文会不会爆？**
A：单次请求预算 ~50k 字符（约 12k tokens）。超出时按优先级丢证据；对话轮数多了会把早期消息压缩成一段背景摘要。

**Q：能同时开多个 bug 吗？**
A：能。UI 一次只显示一个，但左侧列表能随时切换。数据完全隔离。

**Q：怎么分享给同事？**
A：把仓库推到 Git，同事 `git clone && npm install && npm run dev` 就能用。每人一份自己的数据在本机 `~/.ai-debug-assistant/`。不需要共享服务器（工具本身要读同事自己的代码仓库）。

## 开发

```bash
npm run test        # 一次跑完（161 个测试）
npm run test:watch  # 监听模式
npm run typecheck
npm run build       # 生产构建
```

架构与代码组织：见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

## 历史参考

- 原始设计 v1（Phase 1 前）：[DESIGN.md](./DESIGN.md) — 已过时，仅供历史参考
- 详细规格 v2（Phase 1 后重构）：[docs/superpowers/specs/2026-07-14-ai-debug-assistant-design.md](./docs/superpowers/specs/2026-07-14-ai-debug-assistant-design.md) — 部分已由实际实现替代
- Phase 1 实施计划：[docs/superpowers/plans/2026-07-14-phase-1-static-workbench.md](./docs/superpowers/plans/2026-07-14-phase-1-static-workbench.md)

## 下一步（未实现）

- **规则引擎**：spec 里设计过一套 YAML 规则匹配（字段显示 / 重复键 / 缺列 / 超时四类），Phase 3 简化为纯 LLM，规则库未落地
- **codegraph 集成**：现在的代码读取靠简单 ripgrep-style 关键词匹配，可换成 codegraph MCP 拿调用链
- **mcp-chrome**：现在的 cURL/HAR 靠粘贴，可直连当前浏览器抓包
- **导出**：目前只有单 Case JSON 导出，可以做整体 zip / 按状态导出
