# AI Debug Assistant · 架构文档

> 版本：Phase 3（对话式 + Bug 管理）
> 日期：2026-07-15
> 状态：**当前实现**（老 spec 在 `docs/superpowers/specs/` 里作为历史参考）

## 1. 定位

本地 CLI/Web 双形态（当前只做 Web）的 **AI 排障工作台**。跟通用 AI Chat 的核心区别：

- **一个 bug 一个 Case**：Case 有生命周期（`open/investigating/resolved/wont-fix`）、摘要（headline / 根因 / 修复方案）、对话历史、证据集合
- **证据结构化**：粘贴的文本按启发式拆成 `curl` / `har` / `log` / `schema-sql` / `ticket-text` / `page-url` / `api-response` / `repo-path` / `screenshot-note` / `free-text` 十种，每类分块送 LLM
- **累计上下文**：多轮对话共享同一份证据集合和代码上下文，AI 每轮回复后自动抽取结构化摘要
- **本地优先**：Case、对话、模型 Key 全部在 `~/.ai-debug-assistant/`，无云端依赖

## 2. 技术栈

| 层 | 选型 | 备注 |
|---|---|---|
| 全栈框架 | Next.js 15 App Router | 单端口 8787，前后端类型共享 |
| 前端 | React 18 + TypeScript 5 + Tailwind CSS 3 | 无 UI 库，手写组件 |
| 后端 | Node.js 20+，Route Handlers | `fs/promises` 落盘、`fetch` 调 LLM |
| Schema | Zod 3 | 前后端共用同一份 schema |
| 测试 | Vitest 1 + Testing Library | 161 个测试（domain/server/api） |

**关键选择**：
- 无 openai/anthropic SDK 依赖，直接 `fetch` 读 SSE 流，避免版本锁定
- 无数据库依赖，所有状态用 JSON 落盘 + 原子写入 (`.tmp` 文件 + `rename`)
- 无 markdown 库依赖，自己写的极简渲染器（`src/lib/markdown.tsx`）

## 3. 分层结构

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Bug List     │  │ Summary Card │  │  Composer    │  │
│  │ (侧栏)       │  │ + Timeline   │  │  (输入)      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│         └─────────────────┴─────────────────┘           │
│                    src/client/api.ts                    │
└────────────────────────────┬────────────────────────────┘
                             │ HTTP + SSE
┌────────────────────────────▼────────────────────────────┐
│  Next.js Route Handlers (src/app/api/**)                │
│  ┌────────────────┐  ┌────────────────┐                 │
│  │ cases CRUD     │  │ config         │                 │
│  │ messages (SSE) │  │ (discover/save)│                 │
│  │ status         │  │ fs/browse      │                 │
│  │ evidence       │  │ analyze (旧)   │                 │
│  │ export         │  └────────────────┘                 │
│  └────────┬───────┘                                     │
└───────────┼─────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────┐
│  Server 层 (src/server/**)                              │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────┐  │
│  │ case-store     │  │ evidence-store │  │index-store│  │
│  │ (CRUD +        │  │ (CRUD)         │  │(sidebar   │  │
│  │  messages +    │  │                │  │ 索引维护) │  │
│  │  summary)      │  │                │  │           │  │
│  └────────┬───────┘  └────────┬───────┘  └─────┬─────┘  │
│           │                   │                │        │
│  ┌────────▼───────────────────▼────────────────▼─────┐  │
│  │  fs-atomic.ts (writeJsonAtomic / readJson)        │  │
│  │  paths.ts (~/.ai-debug-assistant/*)               │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌────────────────┐  ┌────────────────┐                 │
│  │ llm-client     │  │ prompt-builder │                 │
│  │ (SSE fetch)    │  │ (对话 + 摘要   │                 │
│  │                │  │  抽取 prompt)  │                 │
│  └────────┬───────┘  └────────────────┘                 │
│           │                                             │
│  ┌────────▼──────────┐  ┌──────────────────┐            │
│  │ summary-extractor │  │ code-reader      │            │
│  │ (LLM → JSON)      │  │ (repoPath grep)  │            │
│  └───────────────────┘  └──────────────────┘            │
│                                                         │
│  ┌────────────────┐  ┌────────────────┐                 │
│  │ quick-ingest   │  │ config-*       │                 │
│  │ (拆多类证据)   │  │ (discover/save)│                 │
│  └────────────────┘  └────────────────┘                 │
│                                                         │
│  ┌────────────────┐                                     │
│  │ fs-browse      │  ← 供目录选择器用                   │
│  └────────────────┘                                     │
└─────────────────────────────────────────────────────────┘
```

## 4. 数据模型

全部类型在 `src/domain/types.ts`，schema 校验在 `src/domain/schemas.ts`。

### 4.1 Case（一个 bug 的所有状态）

```ts
interface Case {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'running' | 'blocked' | 'done' | 'error';   // 内部状态
  problem: { actual, expected, entry, environment };
  meta?: { module?, repoPath?, priority?, ... };
  evidenceLevel: 'L0' | 'L1' | 'L2' | 'L3';                    // 保留但 Phase 3 未强用
  pipeline: PipelineState;                                       // 保留（未激活）
  messages?: Message[];                                          // Phase 3 新增：对话历史
  summary?: BugSummary;                                          // Phase 3 新增：AI 抽取的档案
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system-summary';                // system-summary = 压缩后的背景
  createdAt: string;
  content: string;
  ingested?: { evidenceIds: string[] };                         // user 消息触发的 quick-ingest
  meta?: { inputTokens?, outputTokens?, durationMs? };
}

interface BugSummary {
  status: 'open' | 'investigating' | 'resolved' | 'wont-fix';
  headline?: string;              // 一句话结论，20 字以内
  rootCause?: string;
  fixApproach?: string;
  verified?: boolean;
  verificationNotes?: string;
  updatedAt: string;
  updatedBy: 'llm' | 'user';
}
```

### 4.2 Evidence（证据）

```ts
interface Evidence {
  id: string;
  caseId: string;
  type: EvidenceType;              // 10 种（见上文定位）
  createdAt: string;
  source: 'user-paste' | 'user-upload' | 'provider' | 'llm-generated';
  raw: { content: string; filename?; sizeBytes: number };
  parsed?: unknown;                // Phase 3 未填，留给未来
  summary: { oneLine, keywords: string[], tokensEstimate: number };
  sanitized?: { content, redactedKeys };  // Phase 3 未填
}
```

### 4.3 索引条目（左侧列表用）

```ts
interface CaseIndexEntry {
  id, title, createdAt, updatedAt, repoPath?, status;
  bugStatus?: BugStatus;           // Phase 3
  headline?: string;               // Phase 3
}
```

**向后兼容**：老 case.json 没有 `messages` / `summary` 也能加载。`getCase` 内部会补上默认值（`messages: []`、`summary: { status: 'open', ... }`），调用方无感。

## 5. 落盘布局

```
~/.ai-debug-assistant/
├── config.json                       # 模型配置（含 apiKey）
└── cases/
    ├── index.json                    # CaseIndexEntry[]，衍生文件
    └── {caseId}/
        ├── case.json                 # 完整 Case（含 messages 和 summary）
        └── evidence/
            └── {evidenceId}.json     # 单条证据
```

**原子写入**：所有 JSON 写盘走 `writeJsonAtomic(file, data)` — 先写 `.tmp`，再 `fs.rename`，保证进程崩溃不留半文件。

**索引重建**：`index.json` 是从 `cases/*/case.json` 扫出的衍生文件，缺失时后端可通过 `rebuildIndex()` 重建。

## 6. 关键流程

### 6.1 首次分析（新建 Case）

```
UI                        Server
─────────────────────────────────────────────
QuickForm.submit
  POST /api/cases        ──►  createCase（写 case.json，写 index.json）
  ◄──                    ←──  { case }
  POST /api/cases/:id/messages
      (SSE)              ──►  1. appendMessage(role:user)
                              2. quickIngest → 拆证据 → updateMessage.ingested
                              3. code-reader.readCodeContext(repoPath, keywords)
                              4. buildConversationPrompt(problem+evidence+code+messages+summary)
                              5. streamLlm → SSE 转发 { type:'text' } 每 chunk
                              6. done: appendMessage(role:assistant)
                              7. extractSummary(LLM 二次调用)
                              8. updateSummary → SSE 发 { type:'summary' }
                              9. upsertIndexEntry（bugStatus + headline 同步）
                              10. done
Conversation 渲染流式
SummaryCard 更新
BugList 更新（下一次 listCases 拿到新 headline/status）
```

### 6.2 后续追问

跟 6.1 一样，但 `messages` 已有历史 → buildConversationPrompt 会把历史全部塞进去。超 30k 字符时把最早 N 轮压缩成 `## 早期对话摘要` 段落。

### 6.3 手动改状态

```
SummaryCard.onStatusChange('resolved')
  PATCH /api/cases/:id/status
    body: { status:'resolved' }
  ◄── updateCaseStatus → updateCase → upsertIndexEntry
  返回 { summary }
UI 更新
```

## 7. LLM 交互

### 7.1 Provider 抽象（`src/server/llm-client.ts`）

支持两种 provider shape，靠 `saved.provider` 分流：

- `openai-compatible`：POST `{baseUrl}/chat/completions`，`Authorization: Bearer <key>`
- `anthropic-compatible`：POST `{baseUrl}/v1/messages`，header 是 `x-api-key` + `anthropic-version: 2023-06-01`

统一输出：

```ts
type LlmChunk =
  | { type: 'text', text }
  | { type: 'error', message }
  | { type: 'done', inputTokens?, outputTokens? };

async function* streamLlm(cfg, opts): AsyncGenerator<LlmChunk>
```

超时 60s（AbortController），API Key 从错误消息里脱敏。

### 7.2 Prompt 结构（`src/server/prompt-builder.ts`）

对话 prompt 分 6 段：

```
## 当前 Bug 摘要
（如已有 summary，渲染 status + headline + rootCause + fixApproach）

## 问题描述
actual / expected / entry / environment / module / repoPath

## 已收集证据（N 条）
每条：### 证据 n: {type} + oneLine + parsed/raw（按 token 预算截断）

## 代码上下文
命中文件路径 + 代码片段（每 file ≤ 8000 bytes）

## 对话历史
（如果压缩了：先 ## 早期对话摘要，再最近 K 轮完整对话）

## 当前任务
基于以上回答用户最新消息，保持结构化输出（一句话结论 / 事实 / 假设 / 验证 / 修复 / 缺什么）
```

System prompt 是中文的，明确要求"如果新信息推翻前一轮结论，明确说出「修正：…」"。

### 7.3 摘要抽取（`src/server/summary-extractor.ts`）

对话主流结束后 fire-and-forget 一次二次 LLM 调用，非流式，收全内容后解析。

Prompt：

```
你是 bug tracker 摘要器。给定问题描述和最新一轮 AI 诊断回复，输出 JSON：
{ status, headline (≤20字), rootCause, fixApproach, verified, verificationNotes }

status 判定：
- open: 只有描述、无诊断
- investigating: 有初步诊断，需更多信息
- resolved: 给出可执行修复方案且有证据
- wont-fix: 用户明确不修
```

JSON 解析用 `{` 起始 + 括号平衡查找，parse 失败就保留旧 summary，不影响主流。

### 7.4 Token 预算

- 单次 prompt 上限 ~50k 字符（约 12k tokens）
- 证据打包按优先级：`parsed` > `sanitized` > 全文截断
- HAR 只留 URL filter 命中项；log 保留异常栈 + 前后 20 行
- 溢出以「已省略：N 条」占位

## 8. 代码上下文（`src/server/code-reader.ts`）

给定 `repoPath` 和从 case + evidence 抽出的关键词：

1. 路径安全：必须在 `$HOME` 下，拒绝 `/etc /var /System /usr /private`
2. 忽略目录：`.git/objects, node_modules, target, dist, build, .next, out, coverage, .venv, __pycache__, .idea, .vscode`
3. 忽略文件：`.env*, *.pem, *.key, *credentials*`，非 utf-8 首 512 字节
4. 遍历，多关键词命中的文件优先
5. 每文件截断至 8000 bytes（head + tail + `... [truncated N bytes] ...`）
6. 从 `.git/HEAD` + `.git/refs/heads/*` 读 branch + commit（纯 fs，无 shell）

返回 `{ repoRoot, branch?, commit?, snippets[], skipped, warnings[] }`。

## 9. 配置发现（`src/server/config-discover.ts`）

三源扫描，返回脱敏候选：

1. `~/.claude/settings.json` 的 `env.ANTHROPIC_AUTH_TOKEN` + `env.ANTHROPIC_BASE_URL`
2. 环境变量：`ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY / OPENAI_API_KEY / DEEPSEEK_API_KEY / DASHSCOPE_API_KEY / MOONSHOT_API_KEY / SILICONFLOW_API_KEY / ZHIPU_API_KEY / GEMINI_API_KEY`
3. 项目根 `.env.local`

**安全承诺**：`GET /api/config/discover` 永远不返回完整 Key（只 `sk-9****191e` 掩码）；完整 Key 只在 `POST /api/config/reveal` 且传具体 `candidateId` 时返回。保存到 `~/.ai-debug-assistant/config.json` 走 `PUT /api/config/model`。

## 10. API 一览

| Method | Path | 作用 |
|---|---|---|
| GET  | `/api/health` | 健康检查 |
| GET  | `/api/config/discover` | 扫描本地配置候选（脱敏） |
| POST | `/api/config/reveal` | 拉取指定候选的完整 Key |
| GET  | `/api/config/model` | 读已保存配置 |
| PUT  | `/api/config/model` | 保存配置 |
| GET  | `/api/cases` | Bug 列表（走 index.json） |
| POST | `/api/cases` | 新建 Case |
| GET  | `/api/cases/:id` | 单个 Case + 证据 |
| PATCH | `/api/cases/:id` | 更新 meta / status |
| DELETE | `/api/cases/:id` | 删除 |
| GET  | `/api/cases/:id/messages` | 对话历史 + summary |
| POST | `/api/cases/:id/messages` | **主要入口**：发消息 + SSE 流式回复 + 自动摘要 |
| PATCH | `/api/cases/:id/status` | 手动改 bug 状态 |
| POST | `/api/cases/:id/quick-ingest` | 拆多类证据（供 messages 内部用，也可独立调） |
| GET  | `/api/cases/:id/evidence` | 证据列表 |
| POST | `/api/cases/:id/evidence` | 手动添加单条证据 |
| DELETE | `/api/cases/:id/evidence/:evidenceId` | 删除证据 |
| GET  | `/api/cases/:id/export` | 导出 Case JSON |
| POST | `/api/analyze` | **旧接口**（一次性分析），已被 messages 取代但保留 |
| GET  | `/api/fs/browse?path=` | 目录浏览（$HOME 内） |

## 11. 前端组件

```
src/components/
├── layout/
│   ├── header.tsx                  # 顶栏：标题 + 模型状态 + ⚙ + 新分析
│   └── three-column.tsx            # Phase 1 遗留，Phase 3 未用
├── bug/                            # Phase 3 新加
│   ├── bug-list.tsx                # 左栏：状态筛选 + 列表
│   ├── summary-card.tsx            # 顶部可折叠摘要卡（含状态改动菜单）
│   ├── conversation.tsx            # 中部对话时间线（气泡）
│   └── composer.tsx                # 底部输入 + 代码路径 + ⌘Enter
├── analyze/
│   ├── quick-form.tsx              # 新 Case 表单（首次输入）
│   ├── config-banner.tsx           # 顶部模型未配置横幅
│   └── folder-picker.tsx           # 目录选择弹窗
├── case/
│   ├── model-config-form.tsx       # 手动配置表单
│   └── model-config-picker.tsx     # 候选选择（老组件，被 settings-modal 替代）
├── settings/
│   └── settings-modal.tsx          # ⚙ 弹窗（picker + form）
├── evidence/                       # Phase 1 遗留，Phase 3 未在主页面渲染
├── pipeline/                       # 同上
```

主页在 `src/app/page.tsx`，串起 header + bug-list + summary-card + conversation + composer + settings。

## 12. Phase 演进

| Phase | 交付 | 关键决策 |
|---|---|---|
| 1 | 静态工作台 (case 表单 + evidence 面板 + pipeline 骨架) | 数据模型 + 落盘定型 |
| 2 | LLM 接入 + 流式 + 简化 UI | 单文本框 + auto-config |
| 2.5 | 目录选择器 | 服务端 fs-browse |
| **3** | 对话 + Bug 管理 + 自动摘要 | **当前** |
| 4（未实施） | 规则引擎、codegraph、mcp-chrome | 见 README「下一步」 |

## 13. 测试策略

- **domain 层**：纯函数，走 Vitest 单测（schemas.test, evidence-level.test）
- **server 层**：文件系统 IO 用 `beforeEach` 建 `mkdtemp` + `AI_DEBUG_HOME` 隔离
- **api 层**：直接调 route handler 函数（`POST(req, {params})`），Next.js 15 params 是 Promise
- **LLM 相关**：`vi.mock('@/server/llm-client')` 打桩，返回可控的 async generator

161 个测试覆盖：schemas / evidence-level / fs-atomic / case-store / evidence-store / index-store / pipeline-init / prompt-builder / summary-extractor / quick-ingest / code-reader / cases-api / messages-api / status-api / config-api / evidence-api / analyze-api（老）。

## 14. 与老 spec 的差异

老 spec（`docs/superpowers/specs/2026-07-14-*.md`）设计了很多现在没做的东西，简要对照：

| 老 spec | 实际实现 |
|---|---|
| 规则引擎（YAML 规则库） | 未做，纯 LLM |
| 8 步 Pipeline 状态机 | 数据结构保留，Runner 未激活 |
| L0-L3 证据分级强约束 | 保留计算逻辑，未在 UI 上强用 |
| 严格 JSON Report Schema | 简化为 Markdown 流式 + 结构化 summary JSON |
| Provider 抽象（Code/DB/Browser/Ticket） | 简化为一个 code-reader + quick-ingest |
| Repair 重试 / Fallback report | 未做，LLM 失败直接展示错误 |

**核心转变**：从"结构化诊断报告生成器"变成"对话式 bug tracker"。原因：Phase 1 后 UX 反馈说步骤太多、太重，用户想要的是"粘贴就答、答完能继续问"。

## 15. 已知限制

1. 单进程内存无锁，多 tab 并发写同一 Case 会最后写者胜（原子写入避免半文件，但会覆盖）
2. LLM 请求不支持外部 cancel（内部 60s 超时）
3. Markdown 渲染极简，不支持表格 / 图片 / 数学公式
4. `.env.local` 扫描不解析引号转义
5. code-reader 只搜关键词，不理解代码结构（Phase 4 可换 codegraph）
