# AI Debug Assistant · 设计规格（v2）

> 版本：2.0（重构版）
> 日期：2026-07-14
> 前身：`../../../DESIGN.md`

## 1. 目标与非目标

### 1.1 目标

- 本地优先的可视化排障工作台，网页形态。
- 通过结构化输入 + 证据收集，把「问题上下文」组装到最小可诊断集。
- 用可配置的 OpenAI 兼容模型，产出结构化诊断报告（可交互、可导出）。
- 让 AI 的推理路径可审计（Pipeline 可视化 + 证据溯源）。
- 提供可扩展的 Provider 层，为后续接 codegraph / mcp-chrome / 云效 / CI / K8s 留位。

### 1.2 非目标

- 不做团队协作、账号、云端存储。
- 不做自动改代码、自动执行修复命令。
- 不做通用 AI Chat。
- 不做完整 SQL parser / 完整浏览器自动化 / 完整 codegraph 集成（都作为可选扩展点）。
- 不做多语言国际化（先中文优先）。
- 不做付费 / 计费 / 用量统计。

### 1.3 成功的一句话定义

> 用户能在本地打开一个网页，粘贴问题描述和 cURL/HAR/schema/日志，看到工具明确告诉他缺什么证据、当前证据能推出什么结论，最终产出一份带假设排序、验证步骤、修复建议、回归清单的结构化报告。

## 2. 设计演进

| # | 迭代主题 | 决定 | 关键动作 | 决定性理由 |
|---|---|---|---|---|
| 1 | Generic Chat | 否 | — | 与 Claude/ChatGPT 无差异，不解决收集成本 |
| 2 | Structured Form | 留 | 强制 Actual / Expected / Entry / Environment 四要素 | 结构化才可分类，防止过早推理 |
| 3 | Evidence Workspace | 留 | 引入证据面板与「最小缺口」提示 | 排障靠证据不靠描述 |
| 4 | Visual Pipeline | 留 | 8 步流水线状态机 | AI 过程可审计 |
| 5 | Local-First Web MVP | 定 | 本地网页、Key 不落盘、无云无 CLI | 匹配目标体验、启动最快、留足扩展点 |

## 3. 核心概念

- **Case**：一次排障会话。持有问题描述、证据集合、Pipeline 状态、报告。生命周期以本地 JSON 文件为单位。
- **Evidence**：一条可被机器解析或引用的证据单元。含类型、原始内容、解析后结构化字段、摘要、来源。
- **Evidence Level（L0–L3）**：当前 Case 的证据完备度分级。L0 只能给分类；L3 才允许输出「高置信度根因 + 修复建议」。
- **Pipeline**：从归一化输入到产出报告的 8 步流程。每步是显式状态机节点，UI 可视化。
- **Provider**：外部上下文的抽象接入层。四类：Code / DB / Browser / Ticket。每类有一个统一契约、多个实现、可降级。
- **Rule**：规则引擎中的一条声明式规则。输入是「问题分类 + 证据快照」，输出是「下一步动作 + 骨架结论」。
- **Report**：Pipeline 终态产物。严格符合 §5.3 的 JSON Schema。
- **Diagnosis Confidence**：`low` / `medium` / `high`，由证据 Level + 规则命中 + LLM 自评三者共同决定。

## 4. 系统架构

### 4.1 组件图

```
┌──────────────────────────────────────────────┐
│                   Web UI                     │
│  (Case Form · Evidence Panel · Pipeline ·   │
│   Report View · Model Config)                │
└──────────────┬───────────────────────────────┘
               │ HTTP/JSON (REST + SSE)
┌──────────────▼───────────────────────────────┐
│                Backend API                   │
│                                              │
│  ┌────────────┐  ┌──────────────┐            │
│  │  Case Mgr  │  │ Evidence Mgr │            │
│  └─────┬──────┘  └──────┬───────┘            │
│        │                │                    │
│  ┌─────▼────────────────▼──────┐             │
│  │      Pipeline Runner        │◄── SSE ────┤
│  │  (状态机 · 幂等 · 可重放)   │             │
│  └─┬────┬────┬────┬────┬───────┘             │
│    │    │    │    │    │                     │
│  ┌─▼──┐┌▼───┐┌▼──┐┌▼──┐┌▼──────────┐         │
│  │Rule││Prov││LLM││Rpt││Persistence│         │
│  │Eng.││ers ││Cli││Gen││(JSON File)│         │
│  └────┘└─┬──┘└───┘└───┘└───────────┘         │
│         │                                    │
│    ┌────┼────┬─────┬─────┐                   │
│    ▼    ▼    ▼     ▼     ▼                   │
│  Code  DB  Browser Ticket …                  │
│  Prov. Prov. Prov.  Prov.                    │
└──────────────────────────────────────────────┘
```

### 4.2 数据流（单次分析）

```
1. UI 提交 Case + Evidence → Backend
2. Case Mgr 落盘 (JSON) → 返回 caseId
3. UI 触发 /cases/{id}/run，Backend 建立 SSE 通道
4. Pipeline Runner 按 §8 状态机推进 8 步
5. 每步状态变更 → SSE 推 UI
6. 完成后 Report 落盘、UI 拉取渲染
```

### 4.3 边界与不变量

- Backend 是唯一状态持有者；UI 无状态渲染层，刷新页面全量拉一次。
- Provider 之间无相互依赖；Pipeline Runner 编排顺序和并发。
- LLM Client 不直接被 UI 调用；所有 LLM 请求经 Pipeline，携带规则骨架 + 证据摘要 + 输出 schema。
- 规则引擎不写 LLM Prompt；只输出结构化判断，Prompt 组装是 LLM Client 的职责。
- 持久化位置：`~/.ai-debug-assistant/cases/{caseId}/`。
- SSE 通道：浏览器原生 EventSource，单向推送。

## 5. 数据模型

### 5.1 Case Schema

```ts
type CaseStatus = 'draft' | 'running' | 'blocked' | 'done' | 'error';

interface Case {
  id: string;                    // uuid v4
  createdAt: string;             // ISO 8601
  updatedAt: string;
  status: CaseStatus;

  problem: {
    actual: string;
    expected: string;
    entry: string;
    environment: string;
  };

  meta?: {
    occurredAt?: string;
    affectedUser?: string;
    module?: string;
    priority?: 'P0' | 'P1' | 'P2' | 'P3';
    branch?: string;
    commit?: string;
    repoPath?: string;
  };

  classification?: {
    category: string;
    subCategory?: string;
    confidence: 'low' | 'medium' | 'high';
    matchedRuleIds: string[];
  };

  evidenceLevel: 'L0' | 'L1' | 'L2' | 'L3';

  pipeline: PipelineState;                    // 见 §5.4

  reportId?: string;

  modelSnapshot?: {
    provider: string;
    baseUrl: string;
    model: string;
  };
}
```

### 5.2 Evidence Schema

```ts
type EvidenceType =
  | 'curl' | 'har' | 'log' | 'schema-sql'
  | 'ticket-text' | 'page-url' | 'api-response'
  | 'repo-path' | 'screenshot-note' | 'free-text';

interface Evidence {
  id: string;
  caseId: string;
  type: EvidenceType;
  createdAt: string;

  source: 'user-paste' | 'user-upload' | 'provider' | 'llm-generated';

  raw: {
    content: string;
    filename?: string;
    sizeBytes: number;
  };

  parsed?: CurlParsed | HarParsed | LogParsed | SchemaParsed | TicketParsed;

  summary: {
    oneLine: string;
    keywords: string[];
    tokensEstimate: number;
  };

  sanitized?: {
    content: string;
    redactedKeys: string[];
  };
}
```

### 5.3 Report Schema（严格 JSON 契约）

```ts
type Confidence = 'low' | 'medium' | 'high';

interface Report {
  id: string;
  caseId: string;
  generatedAt: string;

  problemSummary: string;                   // 100 字内

  confirmedFacts: Fact[];

  evidenceChain: EvidenceLink[];

  hypotheses: Hypothesis[];                 // 至少 1 条，按 confidence 降序

  primaryDiagnosis: {
    hypothesisId: string;
    rationale: string;
    confidence: Confidence;
  };

  verificationSteps: VerificationStep[];

  suggestedFix: {
    approach: string;
    codeHints?: CodeHint[];
    dbHints?: DbHint[];
    risk: 'low' | 'medium' | 'high';
    riskNotes?: string;
  };

  impactScope: {
    modules: string[];
    apis: string[];
    tables: string[];
    users: string;
  };

  regressionChecklist: ChecklistItem[];

  missingInformation: MissingInfo[];

  meta: {
    evidenceLevel: 'L0' | 'L1' | 'L2' | 'L3';
    ruleEngineOutput: RuleOutcome[];
    llmModel: string;
    llmTokensIn: number;
    llmTokensOut: number;
    generationDurationMs: number;
    schemaVersion: string;                  // '1.0'
    partial?: boolean;                      // true 表示走了 fallback 路径（见 §10.4）
    fallbackReason?: string;                // partial=true 时说明原因
  };
}

interface Fact { id: string; statement: string; evidenceIds: string[]; }
interface Hypothesis {
  id: string; statement: string; confidence: Confidence;
  supportingFactIds: string[]; contradictingFactIds: string[]; ruleIds: string[];
}
interface EvidenceLink { evidenceId: string; supportsFactIds: string[]; }
interface VerificationStep { id: string; description: string; command?: string; expectedResult: string; }
interface CodeHint { path: string; symbol?: string; reason: string; }
interface DbHint { table: string; column?: string; suggestedChange: string; }
interface ChecklistItem { id: string; description: string; howToVerify: string; }
interface MissingInfo { what: string; why: string; howToProvide: string; }
interface RuleOutcome { ruleId: string; matched: boolean; conclusion?: string; }
```

### 5.4 PipelineState

```ts
type StepName =
  | 'Normalize' | 'Classify' | 'CollectEvidence' | 'InspectAPI'
  | 'AnalyzeCode' | 'AnalyzeSchema' | 'Diagnose' | 'ProposeFix';

type StepStatus = 'waiting' | 'ready' | 'running' | 'blocked' | 'done' | 'skipped';

interface PipelineStep {
  step: StepName;
  status: StepStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  inputHash?: string;
  outputRef?: string;                         // 存储路径，如 'runs/{runId}.json#/steps/2'
  blockedReason?: {
    kind: 'need-evidence' | 'provider-error';
    detail: string;
    suggestedActions: string[];
  };
  error?: { code: string; message: string };
}

interface PipelineState {
  currentStep: StepName;
  steps: PipelineStep[];                      // 长度固定为 8，与 StepName 一一对应
  runIds: string[];                           // 历次运行的 runId，最新在末尾
}
```

### 5.5 关键设计取舍

| 决策 | 理由 |
|---|---|
| Report 与 Case 分离存储 | Report 会重复生成多次，Case 是主体 |
| 所有事实/假设/步骤都有 id | 支持前端交互（勾选、筛选、跳转） |
| `evidenceIds` 强关联 | 强制 LLM 每条论断都要有证据出处，抑制幻觉 |
| `ruleEngineOutput` 独立字段 | 报告可溯源，区分「规则给的」vs「LLM 给的」 |
| `schemaVersion` 独立字段 | 后续 schema 演进时前端可做兼容判断 |
| `sanitized` 与 `raw` 分离 | 打码后的内容送 LLM，UI 展示原文 |

## 6. 证据模型

### 6.1 证据类型清单

| 类型 | 解析目标 | 送 LLM 的形式 |
|---|---|---|
| `curl` | method / url / headers / body / query | 结构化 JSON |
| `har` | 首个匹配请求的完整 request/response 对 | 结构化 JSON（多条时按 URL 关键词过滤） |
| `log` | 时间戳、级别、异常栈、traceId | 分段摘要 + 完整异常栈 |
| `schema-sql` | 表名、字段、索引、外键、字典表识别 | 结构化列表 |
| `api-response` | 直接 JSON | 原文 + 字段路径清单 |
| `ticket-text` | 标题、描述、评论区关键片段 | 摘要 + 关键字段 |
| `page-url` | domain / route / query params | 单行摘要 |
| `repo-path` | 存在性校验，交给 Code Provider | 不直接送 LLM |
| `screenshot-note` | 用户文字描述 | 原文 |
| `free-text` | 兜底类型 | 原文（截断至 token 上限） |

### 6.2 证据分级 L0–L3

```
L0: 有 problem 四要素
L1: L0 + (ticket-text ∪ page-url ∪ screenshot-note) 至少 1 条
L2: L1 + (curl ∪ har ∪ api-response) 至少 1 条
L3: L2 + (repo-path ∨ Code Provider 已返回 CodeHit[]) ∧ (schema-sql ∨ DB Provider 已返回 TableSchema[])
```

| Level | 允许 | 禁止 |
|---|---|---|
| L0 | 分类、诊断路径提示、缺口清单 | primaryDiagnosis / suggestedFix |
| L1 | + UI 模块猜测 | primaryDiagnosis 的 confidence 不得 high |
| L2 | + medium 置信度诊断、frontend/backend/data 分层判断 | suggestedFix 的 codeHints |
| L3 | + high 置信度、codeHints、dbHints、完整 regressionChecklist | — |

Level 约束由 Pipeline Runner 在 Diagnose 步骤强制执行，不是靠 LLM 自觉。

### 6.3 证据缺口检测算法

```
输入: Case(problem, classification, evidences)
输出: MissingInfo[]

1. 根据 classification.category 查规则库，得到「必需证据集」和「加分证据集」
2. 与当前 evidences 求差集
3. 按「优先级 = 期望置信度提升 / 用户获取成本」排序
4. 取 top-1 作为「下一步」，其余作为 optional
5. 每条 MissingInfo 必须给出 howToProvide
```

规则库为每个 category 预定义证据需求；未分类走通用规则（要 cURL + repoPath）。

## 7. 规则引擎

### 7.1 规则定义格式（YAML）

规则位于 `~/.ai-debug-assistant/rules/`（内置 + 用户可覆盖）：

```yaml
id: field-display-code-only
category: field-display
subCategory: api-returns-code-only
version: 1

when:
  evidenceHas:
    - type: api-response
  evidencePattern:
    - path: "$.data[*]"
      condition: "hasNumericField AND !hasLabelField"

then:
  classification:
    category: field-display
    confidence: high
  conclusion:
    statement: "API 只返回原始 code，未做字典转换"
    confidence: high
    hypothesisSeed: "后端 DTO 未做 dictionary enrichment"
  nextEvidence:
    - what: "后端 detail 接口的 controller/service 代码"
      why: "定位是否遗漏字典转换步骤"
      howToProvide: "提供 repo-path，或粘贴对应 service 方法源码"
  requiredForConfidence:
    high: [repo-path]

llmDirectives:
  focus:
    - "字典表在 schema 里如何定义"
    - "backend DTO 是否有 code -> label 转换"
  avoid:
    - "不要建议改前端渲染"
```

### 7.2 规则匹配流程

```
1. Rule Loader 启动时加载所有 .yaml，做 schema 校验
2. 每次 Pipeline 到 Classify / Diagnose 步骤：
   a. 按 category 索引筛出候选规则
   b. 对每条候选执行 when 匹配
   c. 命中规则的 then 分块合并（多条则按 confidence 加权）
3. 合并结果 = RuleOutcome[]，作为骨架传给 LLM Client
```

### 7.3 规则与 LLM 的职责边界

| 职责 | 归属 | 理由 |
|---|---|---|
| 问题分类 | 规则 | 确定性 |
| 证据缺口清单 | 规则 | 可预测、可测试 |
| 假设 seed | 规则 | 防止 LLM 遗漏经典模式 |
| 假设排序与置信度调整 | LLM | 需要综合上下文 |
| 报告正文（叙述、rationale） | LLM | 自然语言表达 |
| verificationSteps 生成 | LLM，规则可 seed | 需具体化 |
| suggestedFix.codeHints | LLM（基于 Code Provider 结果） | 需读代码 |
| Schema 合规校验 | 规则 | 兜底 |

**核心原则**：规则决定「必须提到什么」，LLM 决定「怎么说」。

### 7.4 内置规则集（MVP）

- **field-display**：字段显示异常（4 条子规则）
- **duplicate-key**：主键/唯一索引冲突（3 条）
- **missing-column**：缺列 / schema drift（2 条）
- **timeout**：慢查询/超时（3 条）
- **unknown**：兜底（要 cURL + repoPath + 完整错误栈）

每条规则文件都必须带 `version` 字段，允许灰度更新。

**SQL 示例约束**：规则中的 `verificationSteps` 或 `suggestedFix` 涉及查询语句时，一律用 `SELECT *` 而非枚举字段名，避免字段名与实际表结构不符。

## 8. Pipeline 状态机

### 8.1 8 步定义

```
Normalize → Classify → CollectEvidence → InspectAPI
   → AnalyzeCode → AnalyzeSchema → Diagnose → ProposeFix
```

节点状态：`waiting` / `ready` / `running` / `blocked` / `done` / `skipped`。

| 步骤 | 输入 | 输出 | 主要动作 | 失败/降级 |
|---|---|---|---|---|
| Normalize | Case.problem + Evidence[] | 归一化的 Case | 去空白 / URL 归一 / 编码修正 | 无 |
| Classify | Case + Evidence[] | classification | 调 Rule Engine 分类 | 无匹配 → `unknown` |
| CollectEvidence | classification | MissingInfo[] | 计算证据缺口 | 缺关键证据 → blocked=`need-evidence` |
| InspectAPI | curl/har/api-response | ParsedRequest/Response | Browser Provider 解析 | 无 API 证据 → skipped |
| AnalyzeCode | repoPath / 关键词 | CodeHint[] | Code Provider 搜索 | 无 repoPath → skipped；报错 → blocked=`provider-error` |
| AnalyzeSchema | schema-sql / DB 连接 | 表/字段/索引 | DB Provider 解析 | 无 schema 证据 → skipped |
| Diagnose | 全部前序输出 | Report 主体（除 fix 外） | Rule Engine 骨架 + LLM 填肉 | LLM 失败 → §10.4 |
| ProposeFix | Diagnose 结果 | suggestedFix + regressionChecklist | LLM 二次调用 | 同上 |

**为什么 Diagnose / ProposeFix 分两次 LLM 调用**：
- 前者受证据 Level 强约束，后者只在 L2/L3 才允许出 codeHints
- 分开可缓存 Diagnose 结果，用户补证据后只重跑 ProposeFix
- Token 预算更好控制

### 8.2 Blocked 的两种子类型

| 子类型 | 触发条件 | UI 表现 | 用户操作 |
|---|---|---|---|
| `need-evidence` | 证据缺口不满足当前 Level 要求 | 显示 MissingInfo[]，附「补充证据」按钮 | 补证据后 `POST /cases/{id}/resume` |
| `provider-error` | Provider 报错（如 repoPath 不存在、LLM 超时） | 显示错误详情 + 「重试 / 跳过 / 更换 Provider」 | 选择动作后 `POST /cases/{id}/resume?action=` |

`blocked` 状态**必须**带 `blockedReason: { kind, detail, suggestedActions[] }`，不允许空。

### 8.3 幂等与重放

- 每步执行前记录 `stepInput hash`；相同 hash 直接复用上次 output。
- 用户补证据 → Pipeline 从「输入变化的最早步骤」重新开始，之后的步骤 output 作废。
- 每次执行产生 `PipelineRun` 记录，写入 `runs/{runId}.json`。
- UI 可查看「历史运行」，对比不同证据下的诊断差异。

### 8.4 状态迁移

```
waiting → ready → running → { done | skipped | blocked }
                                      │
                       blocked → 用户 resume → running
                       done    → 用户 rerun (补证据) → 从最早变化步骤重新 ready
```

### 8.5 UI 契约（SSE 事件）

```
event: step.status
data: { caseId, step, status, startedAt?, endedAt?, blockedReason? }

event: report.updated
data: { caseId, reportId }

event: pipeline.done
data: { caseId, finalStatus, reportId? }
```

## 9. Provider 契约

### 9.0 通用契约

```ts
interface Provider<Req, Res> {
  id: string;
  kind: 'code' | 'db' | 'browser' | 'ticket';
  priority: number;
  isAvailable(ctx: RunContext): Promise<boolean>;
  execute(req: Req, ctx: RunContext): Promise<Res>;
  cost: { tokenEstimate?: number; latencyMsEstimate?: number };
}

interface ProviderResult<T> {
  data: T;
  source: string;
  truncated: boolean;
  warnings: string[];
}
```

**降级链**：按 priority 排序调用，首个 `isAvailable=true` 的执行；执行失败按 `retryPolicy` 重试（默认 1 次），仍失败回退下一个 Provider；全部失败 → step=`blocked`。

**RunContext** 携带：`caseId / evidence[] / repoPath / classification / tokenBudget / timeoutMs`。

### 9.1 CodeContextProvider

```ts
interface CodeHit {
  path: string;
  lineStart: number;
  lineEnd: number;
  content: string;
  matchReason: 'keyword' | 'symbol' | 'apiRoute' | 'graphEdge';
  callers?: string[];
  callees?: string[];
}
```

**MVP 实现（按优先级）**：
1. `code.codegraph`：优先。查符号 + 调用链。
2. `code.ripgrep`：兜底。基于关键词 + apiPath 的搜索，取前后 20 行上下文。
3. `code.manual`：最后兜底，提示用户粘贴代码。

**约束**：
- 单次响应总大小 ≤ `tokenBudget * 0.4`，超出截断
- 敏感文件（`.env`、`*.pem`、`*credentials*`）跳过
- `repoPath` 必须在 §12.3 白名单内

### 9.2 DBContextProvider

```ts
interface TableSchema {
  name: string;
  columns: { name: string; type: string; nullable: boolean; default?: string }[];
  indexes: { name: string; columns: string[]; unique: boolean }[];
  foreignKeys: { column: string; refTable: string; refColumn: string }[];
}

interface DictionaryTable {
  name: string;
  codeColumn: string;
  labelColumn: string;
  typeColumn?: string;
}
```

**MVP 实现**：
1. `db.sqlparser`：可选依赖（后续），真 SQL parser。
2. `db.regex`：兜底默认，正则解析 DDL。

**字典表识别启发式**：表名匹配 `dict|dictionary|sys_dict|*_type|*_enum` 或字段包含 `(code|value) + (name|label|desc)` 组合。

### 9.3 BrowserContextProvider

```ts
interface ParsedRequest {
  method: string;
  url: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: string;
  response?: { status: number; headers: Record<string, string>; body: string; };
  timing?: { totalMs: number; ttfbMs: number };
}
```

**MVP 实现**：
1. `browser.mcp-chrome`：优先（Phase 5）。
2. `browser.paste`：兜底默认，解析用户粘贴的 cURL / HAR。

**HAR 过滤策略**：`apiUrlFilter` 命中时只留匹配项；否则按响应体 size 排序取前 5 条 + 4xx/5xx 全留。

### 9.4 TicketProvider

**MVP 实现**：
1. `ticket.yunxiao` / `ticket.jira`（Phase 5，需 token）
2. `ticket.text`：兜底默认，从粘贴文本启发式提取 title（首行）+ ID（正则 `[A-Z]+-\d+`）

### 9.5 Provider 选择与并行

| Step | Providers |
|---|---|
| InspectAPI | Browser |
| AnalyzeCode | Code |
| AnalyzeSchema | DB |
| Classify / Diagnose | Ticket（可选） |

InspectAPI / AnalyzeCode / AnalyzeSchema 三步无依赖，Pipeline Runner **并发执行**。

**Token 预算分配**：
```
tokenBudget(总) = modelContext - promptOverhead - reportSchema
每 Provider 预算 = tokenBudget * provider.weight
默认 weight: code=0.4, db=0.2, browser=0.3, ticket=0.1
```

## 10. LLM 交互协议

### 10.1 请求构造

```
┌─────────────────────────────────────────────┐
│ 1. System Prompt                            │
│ 2. Case Context (problem + meta + classify) │
│ 3. Rule Pack (RuleOutcome[] + llmDirectives)│
│ 4. Evidence Pack (分块 + parsed + sanitized)│
│ 5. Output Schema (§5.3 子集, JSON mode)     │
└─────────────────────────────────────────────┘
```

两次 LLM 调用职责区分：

| 调用 | Prompt 主体 | 输出 schema 子集 |
|---|---|---|
| Diagnose | System + Case + Rule Pack + Evidence Pack + Diagnose 部分 schema | problemSummary / confirmedFacts / evidenceChain / hypotheses / primaryDiagnosis / verificationSteps / missingInformation |
| ProposeFix | 上次 Report 主体 + Provider 结果 | suggestedFix / impactScope / regressionChecklist |

### 10.2 Token 预算与证据摘要

```
budget = contextWindow - reserveForOutput - reserveForSystem - reserveForSchema
       ≈ contextWindow * 0.6
```

**证据打包策略**（按优先级降序，逐条塞入直到预算耗尽）：

1. `parsed`（结构化）总是包含
2. `sanitized` 原文按类型分层截断：
   - `curl` / `api-response`：完整保留
   - `har`：仅 `apiUrlFilter` 命中项；未命中则按响应体 size 排前 5
   - `log`：完整异常栈 + 前后 20 行
   - `schema-sql`：分类相关表 + 字典表；无关表折叠为「其余 N 张表」
   - `ticket-text`：截前 800 字 + 关键评论
3. Provider 结果按 §9.5 的 weight 分配
4. 溢出的证据以「已省略：<证据摘要>」占位塞入 Evidence Pack 末尾

`summary.tokensEstimate` 在证据入库时预计算，不在 Prompt 组装时才算。

### 10.3 输出校验与重试

```
1. JSON 语法校验         → 失败: 走 §10.4 降级
2. Schema 校验（AJV）    → 失败: 记录错误，走 repair 重试
3. 语义校验:
   - evidenceIds 必须存在于 Case.evidences
   - hypotheses[0].confidence 不得违反 §6.2 的 Level 约束
   - factIds/hypothesisIds 引用完整
                        → 失败: 走 repair 重试
```

**Repair 重试**：最多 1 次，把原始输出 + 校验错误列表塞回 Prompt，要求「按错误列表修复」。仍失败走 §10.4。

### 10.4 失败降级

| 场景 | Backend 行为 | UI action |
|---|---|---|
| LLM API 超时 / 5xx | 指数退避重试 3 次（1s/3s/9s） | 「重试 / 更换模型」 |
| LLM 限流 429 | 重试至限流窗口过期，最多等 30s | 同上 |
| 输出校验连续失败 | 降级为「仅规则引擎骨架」的报告（`meta.llmModel='fallback:rules-only'`），标注 `partial=true` | 「补证据 / 换模型 / 手动补充」 |
| Key 无效 / 401 | 立即失败，不重试 | 「检查模型配置」 |

**降级报告**：即使 LLM 全挂，Rule Engine 骨架 + Provider 结果依然能拼出不完整但可用的报告，避免用户白等。

### 10.5 可观测性

每次 LLM 调用记录到 `~/.ai-debug-assistant/cases/{caseId}/llm-calls/{callId}.json`：

```ts
interface LlmCallRecord {
  callId: string;
  step: 'Diagnose' | 'ProposeFix';
  requestedAt: string;
  model: string;
  promptSections: {
    system: string;
    caseContext: string;
    rulePack: string;
    evidencePack: string;
    outputSchema: string;
  };
  promptTokens: number;
  responseRaw: string;
  responseTokens: number;
  durationMs: number;
  validationErrors?: string[];
  repaired: boolean;
  status: 'ok' | 'repaired' | 'fallback' | 'error';
  error?: { code: string; message: string };
}
```

UI 提供「查看 LLM 调用」开关，展示这份记录 —— 让 AI 过程真正可审计。

## 11. 持久化

### 11.1 本地 JSON 布局

```
~/.ai-debug-assistant/
├── config.json                     # 默认模型、UI 偏好、日志级别
├── rules/                          # 用户自定义规则（覆盖内置同名 id）
│   └── *.yaml
├── cases/
│   ├── index.json                  # 索引：{ id, title, createdAt, repoPath, status }
│   └── {caseId}/
│       ├── case.json               # §5.1
│       ├── evidence/
│       │   └── {evidenceId}.json   # §5.2
│       ├── runs/
│       │   └── {runId}.json        # §8.3
│       ├── llm-calls/
│       │   └── {callId}.json       # §10.5
│       └── report.json             # §5.3 最新版
└── secrets/                        # 可选，见 §12
```

### 11.2 Case 生命周期

```
draft(创建)  →  running(第一次跑)  →  {done | blocked | error}
   ↑                                    │
   └────────── 用户补证据/rerun ────────┘
```

- **草稿**：仅有 problem，即写盘保证刷新不丢。
- **归档**：`case.json.status = 'archived'`，不出现在 index 主视图，可导出。
- **删除**：物理删除目录 + 从 index.json 移除。

### 11.3 导入导出

- **导出**：`GET /cases/{id}/export` → 打包为 `case-{id}.zip`。
- **导入**：拖入 zip → 校验 schemaVersion → 生成新 caseId 落盘。
- 导出时二次脱敏，API Key 永不导出。

### 11.4 索引维护

- `index.json` 是**衍生文件**，可通过扫描 `cases/*/case.json` 重建。
- Backend 启动做一致性校验：目录存在但 index 缺失 → 自动重建；index 有但目录缺失 → 剔除并告警。
- 单机不加锁，写操作用「临时文件 + rename」原子替换。

## 12. 安全与隐私

### 12.1 API Key 处理

- **默认策略**：Key 只存浏览器 `sessionStorage`，Backend 只在内存保留，不写盘。
- **可选持久化**：用户显式勾选「记住 Key」→ 写入 `secrets/keys.json`，用 OS keychain 加密。keychain 不可用时降级为明文并 UI 显著警告。
- **传输**：`/config/model/test` 校验后 Key 立即从响应体清除，日志中永远打 `sk-****`。

### 12.2 敏感数据脱敏

Evidence 入库时同时生成 `sanitized`。默认打码规则：

| 位置 | 匹配规则 | 打码方式 |
|---|---|---|
| HTTP header | `Authorization / Cookie / X-*-Token / X-Auth-*` | 全值 → `***` |
| JSON body | key 匹配 `password / token / secret / key / accessKey / phone / idCard / email` | 值 → `***` |
| 通用正则 | 手机号 / 身份证 / IPv4 / JWT / AK/SK 模式 | 命中片段 → `***` |
| Log | 同上正则集 | 命中片段 → `***` |
| SQL | 字符串字面量 `'...'` | 保留结构，值 → `'***'` |

用户可查看 `redactedKeys[]`，对误打码字段执行「取消脱敏」（仅本 Case 生效）。

### 12.3 本地路径访问边界

- `repoPath` 由用户显式提供，不做扫描发现。
- 白名单：允许 `$HOME` 下任意目录，禁止 `/etc/`、`/var/`、`/System/`、`/usr/`、`/private/`、`~/.ssh/`、`~/.gnupg/`、`~/.aws/`、`~/.kube/`、任何 `.env*` 文件。
- Code Provider 扫描时跳过 `.git/objects/`、`node_modules/`、`target/`、`dist/`、`build/`、`.venv/`。
- 用户切换到未白名单的 repoPath → Backend 直接 403。

### 12.4 外发请求边界

- Backend 只对用户配置的 LLM base URL 发起外发请求。
- 未来 Provider 需要用户显式配置 endpoint + Key，走同样的白名单机制。

## 13. UI 结构（信息架构）

```
┌──────────────────────────────────────────────────────┐
│ Header                                               │
│   App name | Model status | Case 快速切换 | 导入/导出│
├─────────┬────────────────────────┬───────────────────┤
│  Left   │       Center           │      Right        │
│  · 模型 │  · Pipeline 状态条     │  · 报告 Tabs      │
│    配置 │    (8 步 + 状态色)     │    - 诊断         │
│  · Case │  · 证据卡片列表        │    - 证据链       │
│    表单 │    (add / 展开 / 删)   │    - 修复建议     │
│  · 元数据│  · 缺证据提示卡       │    - 回归清单     │
│         │  · Run / Resume 按钮   │    - LLM 调用     │
└─────────┴────────────────────────┴───────────────────┘
```

**交互不变量**：
- Pipeline 每步点击 → 展开该步的 input hash / output ref / 时长 / 错误。
- 证据卡片点击 → 展开 raw / parsed / sanitized 三视图切换。
- 报告里所有 `id` 都是可点击的锚点，点 hypothesis → 高亮相关 fact 和 evidence。
- Blocked 状态永远给「下一步操作按钮」，不出现死胡同。
- 所有 LLM 调用可在 UI 「LLM 调用」Tab 查看完整 prompt / response。

## 14. 可观测性

**三个观测面**（都不上报外部）：

1. **Case 溯源**：`meta.ruleEngineOutput` + `evidenceChain` + `llm-calls/` 全链路可回放。
2. **Pipeline 事件日志**：`runs/{runId}.json` 是运行完整时间线，含每步 duration / status / error。
3. **应用日志**：`~/.ai-debug-assistant/logs/app-{yyyy-MM-dd}.log`，默认 INFO，异常必带堆栈，所有 Key/Cookie/Token 走 §12.2 相同脱敏。

**指标**（可选 Phase）：本地小型指标聚合（成功率、平均耗时、LLM tokens），Backend 内存态，UI 「统计」页展示，不落盘不上报。

## 15. 交付节奏

| Phase | 目标 | Done 判据 |
|---|---|---|
| P1: 静态工作台 | 本地 Web、Case 表单、证据面板、Pipeline 只展示 waiting/ready、持久化落盘 | 能创建 Case + 添加 5 类证据 + 刷新不丢 + `case.json` 落盘 |
| P2: LLM 接入 | 模型配置、LLM Client、Report Schema 校验、Diagnose+ProposeFix 二阶段、失败降级 | 用完整证据（L3）跑通例子 Case，产出符合 schema 的 report；断网/无效 Key 走降级 |
| P3: 证据解析 | cURL / HAR / schema-sql / log 的 parsed 字段填充、sanitized 生成、tokensEstimate 预计算 | 5 类证据各 3 个 fixture 通过解析测试；脱敏抽检 100% 命中 |
| P4: 代码上下文 | Code Provider（ripgrep 兜底 + codegraph 可选）、DB Provider（regex 兜底） | 有 repoPath 的 Case 能在 report 里返回 codeHints；无 repoPath 走 skipped |
| P5: 外部集成 | mcp-chrome / 云效 / CI / K8s / log connector | 每类接一个即可，验收标准另定 |

**发布策略**：P1 结束发 0.1.0，之后每 Phase 一个 minor 版本；schemaVersion 与版本号解耦，仅在 §5 三大 schema 有 breaking change 时 bump。

## 16. 验收标准

### 16.1 功能验收

用户可以：
1. 本地打开 Web App。
2. 配置模型、连通性自检通过。
3. 创建 Case（四要素校验）。
4. 添加多类证据、看到 evidenceLevel 变化。
5. 看到缺什么证据、具体怎么补。
6. 触发分析、看到 Pipeline 实时状态。
7. 获得 schema 合规的结构化报告。
8. 点开任一假设，看到支撑证据；点开任一 verification 步骤，可复制执行。
9. 刷新页面、重启应用，Case 与报告仍在。
10. 导出 Case、在另一台机器导入并重放。

### 16.2 质量指标

| 指标 | 目标 | 备注 |
|---|---|---|
| L3 场景诊断命中率（人评） | ≥ 70% | 需要 20 例样本集，TBD 由项目方提供 |
| 单次分析耗时（L2, 平均） | ≤ 15s | 不含 LLM 网络往返 waiting |
| Pipeline 步骤失败恢复率 | 100% | 任何失败都必须给可执行的下一步 |
| 输出 schema 校验通过率（含 repair） | ≥ 98% | 校验失败必进降级路径 |
| 证据脱敏漏检率（抽检） | 0 敏感明文外泄到 LLM | 抽检样本 TBD |

### 16.3 非功能

- 冷启动 → UI 可交互：≤ 3s（本地）
- 单 Case 目录体积上限：500MB（超出提示归档 / 拆分）
- 单证据 raw content 上限：10MB（超出拒绝入库，提示分片粘贴）

## 17. 附录 A：示例 Case 全链路

### A.1 输入

```
Actual behavior:  审批详情页面某些字段显示为数字。
Expected behavior:字段应显示为可读的中文名称。
Entry:            PLJI-2458 或审批详情页 URL。
Environment:      万联现场环境，账号 yunying。
```

### A.2 Pipeline 逐步

**Step 1 · Normalize**：去除 URL 尾斜杠、trim 文本、entry 识别为工单号 `PLJI-2458`。

**Step 2 · Classify**：Rule Engine 命中 `field-display` 类目。输出 `classification = { category: 'field-display', confidence: 'medium' }`。

**Step 3 · CollectEvidence**：当前 Level = L0。该 category 必需证据：`api-response` 或 `curl`。输出 MissingInfo：
```
what:         详情接口的响应体
why:          区分「后端未做字典转换」vs「前端未绑定 label 字段」
howToProvide: 浏览器 Network 面板 → 右键详情请求 → Copy as cURL
```
Pipeline 进入 `blocked / need-evidence`。

**用户补 cURL → Resume**

**Step 4 · InspectAPI**：Browser Provider（paste 实现）解析 cURL：
```
GET /api/approval/detail?id=xxx
Response: {
  "code": 0,
  "data": { "status": 3, "type": 2, "source": 1, "amount": 1000 }
}
```
判定：响应体只有 code，没有 label。命中规则 `field-display-code-only`。

**Step 5 · AnalyzeCode**：用户提供了 repoPath。Code Provider（ripgrep）用关键词 `approval/detail`、`ApprovalDetail`、`status`、`type` 搜索。返回 3 处命中：controller / service / DTO 转换类，DTO 未见字典转换调用。

**Step 6 · AnalyzeSchema**：用户粘贴了 init.sql 片段。DB Provider（regex）识别出字典表 `sys_dict`。

**Step 7 · Diagnose**（LLM 第一次调用）：
```json
{
  "primaryDiagnosis": {
    "hypothesisId": "h1",
    "rationale": "detail 接口返回 status/type/source 均为原始 code，未见 label；DTO 转换类中未发现调用字典服务；schema 中存在 sys_dict 字典表可供查询",
    "confidence": "high"
  },
  "hypotheses": [
    { "id": "h1", "statement": "后端 DTO 未做字典 enrichment", "confidence": "high", "supportingFactIds": ["f1","f2","f3"], "ruleIds": ["field-display-code-only"] },
    { "id": "h2", "statement": "前端强制展示 code 字段，忽略 label", "confidence": "low", "supportingFactIds": [], "contradictingFactIds": ["f1"] }
  ]
}
```

**Step 8 · ProposeFix**（LLM 第二次调用）：
```
approach:    在 ApprovalDetailAssembler 或 DTO 组装环节注入 DictService，对 status/type/source 三个字段调用字典查询补充 label。
codeHints:   [{ path: '.../ApprovalDetailService.java', symbol: 'buildDetail', reason: '缺少字典 enrichment 调用' }]
dbHints:     [{ table: 'sys_dict', column: null, suggestedChange: '确认字典配置覆盖 approval_status/approval_type/approval_source 三个 type' }]
risk:        low
```

verificationSteps 示例：
```
1. description:    确认 sys_dict 中存在对应 type 的字典项
   command:        SELECT * FROM sys_dict WHERE type IN ('approval_status','approval_type','approval_source');
   expectedResult: 每个 type 都能查到多行记录
2. description:    改造 buildDetail 后重新请求详情接口
   expectedResult: 返回体中出现 statusLabel/typeLabel/sourceLabel 字段
```

regressionChecklist：列表页、其他详情接口是否同样问题、字典缓存刷新逻辑。

### A.3 最终报告结构（截取）

```json
{
  "id": "rpt-...",
  "caseId": "case-...",
  "problemSummary": "审批详情接口返回原始 code，前端展示为数字而非可读名称，根因位于后端 DTO 组装阶段缺失字典转换。",
  "meta": {
    "evidenceLevel": "L3",
    "ruleEngineOutput": [{ "ruleId": "field-display-code-only", "matched": true, "conclusion": "..." }],
    "schemaVersion": "1.0"
  }
}
```

## 18. 附录 B：术语表 & 参考

### B.1 术语表

| 术语 | 定义 | 出处 |
|---|---|---|
| Case | 一次排障会话，本地 JSON 文件承载 | §3, §5.1 |
| Evidence | 可解析或引用的证据单元 | §3, §5.2 |
| Evidence Level | L0–L3，当前 Case 的证据完备度 | §6.2 |
| Pipeline | 从归一化到 ProposeFix 的 8 步状态机 | §8 |
| Provider | Code/DB/Browser/Ticket 上下文接入抽象层 | §9 |
| Rule | 声明式规则，输入证据快照输出骨架结论 | §7.1 |
| Report | Pipeline 终态产物，严格 JSON schema | §5.3 |
| RuleOutcome | 规则执行结果，作为 LLM Prompt 骨架输入 | §7.2, §10.1 |
| RepairRetry | LLM 输出 schema 不通过时的一次修正重试 | §10.3 |
| Fallback Report | LLM 全挂时仅由规则+Provider 拼出的降级报告 | §10.4 |
| RunContext | Pipeline Runner 传给 Provider 的上下文 | §9.0 |
| Token Budget | 单次 LLM 请求可用 token 预算 | §10.2 |

### B.2 未来扩展点索引

| 扩展点 | 位置 | 触发条件 |
|---|---|---|
| codegraph 接入 | §9.1 | MCP 可用时 |
| mcp-chrome 集成 | §9.3 | Phase 5 |
| 云效 / Jira ticket | §9.4 | Phase 5 |
| SQL parser（真解析） | §9.2 | 需更精确 DDL 分析时 |
| 多模型路由 | §10.1 | 多候选模型 + 任务分层需求时 |
| OS Keychain 加密 | §12.1 | 用户勾选「记住 Key」时 |
| K8s / CI / Log connector | §9 | Phase 5 |
| 指标面板 | §14 | P2 之后按需 |

### B.3 参考实现（跨语言可选）

- YAML 规则：任何主流 YAML lib + JSON Schema 校验器
- JSON Schema 校验：AJV (JS) / everit-json-schema (Java) / jsonschema (Python)
- SSE：浏览器原生 `EventSource` + 后端普通 HTTP 流
- Token 估算：`tiktoken` 或 `chars/4` 兜底
- 字符编码：全链路 UTF-8

---

**文档结束**

