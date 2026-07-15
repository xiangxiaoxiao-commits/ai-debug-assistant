# AI Debug Assistant

本地 AI 排障助手：粘贴问题 + 日志 + cURL + SQL，对话式定位 bug，自动维护档案与摘要。

## 前置条件

- Node.js 20+（<https://nodejs.org/> 下载 LTS 版本）
- 一个 LLM API 的 Base URL + API Key（Anthropic 兼容或 OpenAI 兼容都行）

## 启动

**macOS / Linux**：

```bash
./start.sh
```

**Windows**：双击 `start.bat`

启动后浏览器会自动打开 <http://127.0.0.1:8787>（也可以手动打开）。

想换端口：`PORT=9000 ./start.sh`
想让局域网访问：`HOSTNAME=0.0.0.0 ./start.sh`（谨慎，会暴露 Key）

## 首次配置

1. 打开页面后，如果本机有 `~/.claude/settings.json` 或 `ANTHROPIC_AUTH_TOKEN` / `OPENAI_API_KEY` 等环境变量，顶部横幅会自动列出候选
2. 选一份 + 填模型名（如 `claude-opus-4-7` / `deepseek-chat` / `gpt-4o-mini`）→ 点「使用此配置」
3. 找不到候选就点 ⚙ 手动填 Base URL + Key + 模型名

配置和 Case 数据全部保存在本机 `~/.ai-debug-assistant/`，不会外发。

## 使用

- **新建**：主区表单里粘贴问题（现象、日志、cURL、SQL 混着写都行），可选选代码仓库目录，点「开始分析」
- **追问**：分析完继续在底部输入框补充证据、追问细节，⌘/Ctrl+Enter 发送
- **管理**：左侧列表按状态筛选（待分析 / 排查中 / 已解决 / 搁置），摘要卡右上角可手动改状态
- **代码路径选择**：📁 按钮打开目录浏览器，Git 仓库会绿色置顶

## 数据在哪里

`~/.ai-debug-assistant/`
- `config.json` — 模型配置（含 Key）
- `cases/{caseId}/case.json` — 每个 bug 的档案 + 对话历史
- `cases/{caseId}/evidence/*.json` — 拆出来的证据

想清空重来：`rm -rf ~/.ai-debug-assistant/cases`（保留配置）

想搬到另一台机器：拷 `~/.ai-debug-assistant/` 整个目录过去

## 常见问题

**Q：Key 会被上报吗？**
A：不会。工具只对你配置的 Base URL 发外发请求，Key 只存本地 `~/.ai-debug-assistant/config.json`。

**Q：能读到我的代码吗？**
A：只在你**显式**给出 `repoPath` 时才读。硬编码忽略：`.git/objects`、`node_modules`、`dist`、`build`、`.venv`、`.env*`、`*.pem`、`*credentials*`。路径必须在 `$HOME` 下。

**Q：停不掉？**
A：终端里 Ctrl+C；如果关了终端就用 `lsof -ti:8787 | xargs kill`

**Q：想开机自启？**
A：macOS 用 launchd、Linux 用 systemd、Windows 用任务计划。本工具是普通 Node 进程，命令是 `cd <解压目录> && node server.js`
