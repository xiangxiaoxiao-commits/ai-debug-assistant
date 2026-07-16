# 执行链路：发消息（send-message）从头到尾

> 目的：把「用户在对话框敲回车」到「摘要卡片自动刷新」这条最长的链路，用真实的文件 + 行号 + 顺序，讲清楚每一步做了什么、依赖了谁。
>
> 阅读方式：从上往下顺序读，遇到不清楚的模块可以按行号跳过去看。

---

## 0. 上帝视角

```
┌──────────────────────┐
│ Browser              │
│  Composer.onSubmit   │  src/components/bug/composer.tsx:29
│  ↓                   │
│  api.sendMessage()   │  src/client/api.ts (SSE 消费)
└──────────┬───────────┘
           │ POST /api/cases/:id/messages   { text }
           ▼
┌──────────────────────────────────────────────────────────────┐
│ Route Handler                                                │
│  src/app/api/cases/[id]/messages/route.ts:39 (POST)          │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  1. 校验 body / 读配置 / 读 case                       │   │
│  │  2. appendMessage(role:user) + new TraceRecorder      │   │
│  │  3. 打开 SSE ReadableStream                            │   │
│  │  4. 顺序执行 8 个 trace step，每步完成后 send trace-step│   │
│  │  5. finalize trace 落盘                                │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────┬───────────────────────────────────────────────────┘
           │ SSE frames
           ▼
┌──────────────────────┐
│ Browser 消费         │
│  ReportStream 边渲染 │
│  边收 trace-step /   │
│  meta / text / done  │
└──────────────────────┘
```

8 步 trace step 按顺序：

| # | kind | 作用 | 涉及模块 |
|---|---|---|---|
| 1 | `quick-ingest` | 把用户粘贴的文本按启发式规则拆成多条 Evidence | `quick-ingest.ts` → `evidence-store.ts` |
| 2 | `read-code` | 有 repoPath 就 grep 关键代码文件 | `code-reader.ts` |
| 3 | `load-knowledge` | 读该功能的 FeatureKnowledge（常见根因 / 已验证修复） | `feature-store.ts` |
| 4 | `find-similar` | Phase 4B 里跳过（相似 case 在建 Case 时就锁定了） | — |
| 5 | `build-prompt` | 拼 systemPrompt + userPrompt | `prompt-builder.ts` |
| 6 | `llm-call` | 调 LLM，同时把 text 分片 SSE 转发给前端 | `llm-client.ts` |
| 7 | `extract-summary` | 二次调 LLM，产出结构化 BugSummary | `summary-extractor.ts` |
| 8 | `update-playbook` | 三次调 LLM，推进 Playbook 步骤状态 | `playbook-updater.ts` |

一次消息就是 3 次 LLM 调用（第 6 → 第 7 → 第 8）。

---

## 1. 前端触发：Composer → api.sendMessage

**文件**：`src/components/bug/composer.tsx`

按 ⌘/Ctrl+Enter 触发 `submit()`（第 21-25 行），把非空文本传给父组件：

```ts
// composer.tsx:21
const submit = () => {
  if (!text.trim() || disabled || submitting) return;
  onSubmit(text.trim());
  setText('');
};
```

父组件 `src/app/page.tsx` 的 `streamMessage(caseId, text)` 调 API 客户端：

```ts
// src/client/api.ts (sendMessage 生成器)
sendMessage: async function* (caseId, text) {
  const res = await fetch(`/api/cases/${caseId}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
  // 逐帧解析 SSE，yield 每个 MessageChunk
}
```

前端消费的 chunk 类型（`src/client/api.ts` 末尾）：

```ts
type MessageChunk =
  | { type: 'meta',      evidences, codeSnippets, promptChars, userMessageId }
  | { type: 'text',      text }
  | { type: 'summary',   summary }
  | { type: 'trace-step', step: { kind, label, status, durationMs } }  // Phase 4B 新增
  | { type: 'trace-done', traceId, totalMs, stepCount }                // Phase 4B 新增
  | { type: 'playbook',  playbook }                                    // Phase 4B 新增
  | { type: 'context',   featureName, featureKnowledgeSize, relatedCases }  // Phase 4A 新增
  | { type: 'error',     message }
  | { type: 'done',      assistantMessageId, inputTokens, outputTokens };
```

---

## 2. 入口 Route：validation + TraceRecorder 初始化

**文件**：`src/app/api/cases/[id]/messages/route.ts:39`

**Step 0**（不记入 trace，属于前置准备）：

```ts
// route.ts:39-56
export async function POST(req, { params }) {
  const raw = await req.json().catch(() => null);
  const parsed = postBodySchema.safeParse(raw);        // 40-42:  body 校验
  if (!parsed.success) return new Response('bad request', { status: 400 });

  const cfg = await readSavedConfig();                 // 44:     读 ~/.ai-debug-assistant/config.json
  if (!cfg) return new Response('model not configured', { status: 400 });

  const { id } = await params;                          // 47:     Next 15 params 是 Promise
  const kase = await getCase(id).catch(() => null);    // 48:     读 case.json + normalizeCase
  if (!kase) return new Response('case not found', { status: 404 });

  const userMsg = await appendMessage(id, {            // 51-54:  用户消息先落盘（避免 LLM 挂掉丢失）
    role: 'user',
    content: parsed.data.text || kase.problem.actual
  });

  const recorder = new TraceRecorder(id, 'send-message', userMsg.id);  // 56: 开始记账
```

`appendMessage` 会读 case → 追加消息 → `updateCase` 写回，见 `case-store.ts:78`：

```ts
// case-store.ts:78-91
export async function appendMessage(caseId, msg) {
  const kase = await getCase(caseId);
  const full: Message = { ...msg, id: uuid(), createdAt: new Date().toISOString() };
  const messages = [...(kase.messages ?? []), full];
  await updateCase({ ...kase, messages });
  return full;
}
```

**TraceRecorder** 是这一段最关键的抽象（`trace-recorder.ts:13`）。用法：

```ts
recorder.step(kind, label, fn)   // 包一层：自动记 start/end/duration/status/error
recorder.add({ kind, label, status: 'skipped', ... })  // 手动记（不执行任何工作）
recorder.finalize()              // 汇总写 traces/{traceId}.json + 追加到 case.traceIds
```

每次 `step()` 成功后，路由用 `recorder.lastStep` 拿到刚记的那条，通过 SSE 推给前端：

```ts
// route.ts:64-67
const emitStep = () => {
  const s = recorder.lastStep;
  if (s) send({ type: 'trace-step', step: { kind: s.kind, label: s.label, status: s.status, durationMs: s.durationMs } });
};
```

---

## 3. Step 1 · quick-ingest — 拆证据

**目的**：用户粘贴的一大坨文本，按空行切块，每块启发式判定类型（curl / api-response / schema-sql / log / page-url / free-text）。

**入口**：`route.ts:72-90`

```ts
if (parsed.data.text.trim()) {
  try {
    const ingestResult = await recorder.step(
      'quick-ingest',
      '快速录入用户消息',
      () => quickIngest(id, parsed.data.text)
    );
    emitStep();
    evidenceIds = ingestResult.createdIds;
    if (evidenceIds.length > 0) {
      await updateMessage(id, userMsg.id, { ingested: { evidenceIds } });   // 把证据 id 挂回消息
    }
  } catch { emitStep(); }
} else {
  recorder.add({ kind: 'quick-ingest', label: '用户消息为空，跳过录入', status: 'skipped' });
  emitStep();
}
```

**跳到 `quick-ingest.ts`**：

```ts
// quick-ingest.ts:49
export async function quickIngest(caseId, text) {
  const chunks = splitByBlankLine(text);       // 按空行切
  const created = [];
  for (const chunk of chunks) {
    const type = detectType(chunk);            // 启发式判定
    const ev = await addEvidence(caseId, { type, content: chunk });
    created.push(ev.id);
  }
  return { createdIds: created };
}
```

`detectType` 的匹配顺序（`quick-ingest.ts:10-47`）：
1. 首行以 `curl ` 开头 → `curl`
2. `{` / `[` 开头且 JSON.parse 成功 → `api-response`
3. 含 `CREATE TABLE` / `ALTER TABLE` / `CREATE INDEX` → `schema-sql`
4. 含 `ERROR/WARN/FATAL` / `Exception` / `at xxx(` 栈帧模式 → `log`
5. 单独一行是 `https?://...` → `page-url`
6. 兜底：`free-text`

**跳到 `evidence-store.ts:32`** 看 addEvidence 落盘（含关键词提取、token 估算）——每条 Evidence 一个文件：`cases/{caseId}/evidence/{evidenceId}.json`。

---

## 4. Step 2 · read-code — 读代码上下文

**入口**：`route.ts:96-110`

```ts
if (kase.meta?.repoPath) {                     // 用户在 QuickForm 里给了 repoPath 才走
  code = await recorder.step(
    'read-code',
    '读取代码上下文',
    () => readCodeContext({
      repoPath: kase.meta!.repoPath!,
      keywords: buildKeywords(kase, evidences)  // route.ts:22 — 从 problem/entry/evidence.summary.keywords 合并
    })
  );
} else {
  recorder.add({ kind: 'read-code', label: '未配置代码仓库，跳过', status: 'skipped' });
}
```

**关键词是怎么来的**（`route.ts:22-37`）：

```ts
function buildKeywords(kase, evidences): string[] {
  const words = new Set<string>();
  const push = (s) => s?.match(/\b[A-Za-z][A-Za-z0-9_/]{2,}\b/g)?.forEach(w => words.add(w));
  push(kase.problem.entry);           // e.g. 'PLJI-2458' / 'POST /api/orders'
  push(kase.problem.actual);           // 从现象里抽出类名 / 接口名
  push(kase.meta?.module);
  for (const e of evidences) {
    for (const k of e.summary.keywords) words.add(k);   // Evidence 入库时就抽好了
  }
  return Array.from(words).slice(0, 30);
}
```

**跳到 `code-reader.ts:188`** — `readCodeContext`：

1. 路径解析 + 白名单校验（`isSafePath`，仅允许 `$HOME` 下，拒 `/etc /var /private /System /usr`）
2. 递归遍历目录，忽略 `.git/objects, node_modules, target, dist, build, .next, coverage, .venv, __pycache__, .idea, .vscode`
3. 忽略敏感文件 `.env* / *.pem / *.key / *credentials*`
4. 每个候选文件的**文件路径** + **文件内容**做子串匹配（大小写不敏感），多关键词命中的文件优先
5. 每文件截断到 8000 bytes（head + tail + `... [truncated N bytes] ...`）
6. 从 `.git/HEAD` + `.git/refs/heads/*` 纯 fs 读 branch + commit（不 shell 出去）
7. 返回 `{ repoRoot, branch?, commit?, snippets[], skipped, warnings[] }`

**为什么这一步不用 LLM**：明确的机械查找，快 + 便宜。真正的语义在下一步交给模型。

---

## 5. Step 3 · load-knowledge — 加载功能沉淀

**入口**：`route.ts:119-139`

```ts
if (freshCase.featureId) {
  const feat = await getFeature(freshCase.featureId);       // feature-store.ts
  featureKnowledge = feat.knowledge;
  featureName = feat.name;
  recorder.add({
    kind: 'load-knowledge',
    label: `加载功能知识库 ${knowledgeSize} 条`,
    status: 'ok',
    meta: { knowledgeSize }
  });
}
```

**`featureId` 是谁写进 case 的？** 建 Case 时（Phase 4A：`POST /api/cases`），后端会：
1. 调 `feature-classifier.classifyFeature()`（1 次 LLM）判定「这个 bug 属于哪个业务模块」
2. 已有的取其 id，否则 `createFeature({ name })`
3. 把 featureId 写进 case.json，`feature.bugCount++`

**`feature.knowledge` 是怎么来的**：当 Case 状态被改成 `resolved` 时（Phase 4A：`PATCH /api/cases/:id/status`），后端顺手 fire-and-forget：
1. `lesson-extractor.extractLesson()`（1 次 LLM）从对话里抽 `{ symptomPattern, rootCause, fix }`
2. `knowledge-builder.refreshFeatureKnowledge(featureId)` 聚合该 feature 所有 resolved case 的 lessons，产出 `commonRootCauses[]` + `verifiedFixes[]`

结果就是：**bug 越修，功能知识越厚。每条相同功能的新 bug 都能自动读到「前辈们踩过的坑」**。

---

## 6. Step 4 · find-similar — 已跳过

`route.ts:142-156` 只做两件事：

```ts
recorder.add({ kind: 'find-similar', label: '相似案例已从 Case 关联列表加载', status: 'skipped' });
// 从 freshCase.relatedCaseIds 展开成 { headline, rootCause, fix }[]
for (const rcId of freshCase.relatedCaseIds ?? []) {
  const rc = await getCase(rcId);
  relatedCasesForPrompt.push({
    headline: rc.summary?.headline,
    rootCause: rc.summary?.rootCause,
    fix: rc.summary?.fixApproach
  });
}
```

**为什么跳过**：相似检索是在建 Case 的时候一次性做完（Phase 4A：`similarity-search.findSimilarCases`），把 top-3 相似 resolved case 的 id 存进 `case.relatedCaseIds`。发消息时直接读，不再花一次 LLM 调用。

---

## 7. Step 5 · build-prompt — 拼提示词

**入口**：`route.ts:158-176`

```ts
const opts = buildConversationPrompt({
  problem: freshCase.problem,
  meta: freshCase.meta,
  evidences,
  code,
  messages: freshCase.messages ?? [],   // 完整对话历史
  currentSummary: freshCase.summary,
  featureKnowledge,                      // 步骤 3 拿到的
  relatedCases: relatedCasesForPrompt    // 步骤 6 展开的
});
```

**跳到 `prompt-builder.ts:219`**（`buildConversationPrompt`）。最终 userPrompt 的分节顺序（有 featureInjection 时）：

```
## 该功能的已知模式
   常见根因：- xxx
   已验证的修复模式：- 症状：xxx → 根因：yyy → 修复：zzz

## 相似历史 bug（供参考）
   - headline：rootCause → fix

## 当前 Bug 摘要
   - 状态、结论、根因、修复方案…

## 问题描述
   - 实际现象 / 期望 / 入口 / 环境 / 模块 / 仓库

## 已收集证据（N 条）
   ### 证据 1: curl
   {oneLine + raw.content 截断至 4000 字}
   ...

## 代码上下文
   分支：main, HEAD：abc123
   ### src/order/OrderService.java [命中 orderStatus, sys_dict]
   {文件内容截断至 8000 字节}
   ...

## 对话历史
   **用户**：… **助手**：…
   （超预算的最早几轮压缩成 `## 早期对话摘要`）

## 当前任务
   基于以上，回答用户的最新消息。保持结构化输出…
```

**预算控制**（`prompt-builder.ts:121-186`）：
- 总上限 `MAX_CONVERSATION_PROMPT_CHARS = 30_000`
- 固定分节（system + feature + summary + problem + code + task）先算掉
- 剩余部分按 6:4 切给 evidence 和 history
- Evidence 一条条塞，超预算就整条丢掉并追加「已省略：N 条证据」
- History 从最新往前塞，塞不下的最早那部分调用 `firstSentence()` 压缩成 `## 早期对话摘要`

**system prompt**（`prompt-builder.ts:103-119`）：

```
你是一名资深工程排障助手。这是一次多轮排障对话。用户可能在后续消息里补充证据、修正描述、追问细节，你要基于**累计的证据**和**当前诊断结论**回答。如果新信息推翻了前一轮的结论，明确说出「修正：…」。
（6 条原则 + 6 段固定 Markdown 结构：一句话结论 / 已确认事实 / 根因假设 / 建议验证 / 建议修复 / 还需要什么信息）
```

---

## 8. Step 6 · llm-call — 调 LLM 并同步流式转发

**入口**：`route.ts:196-230`

```ts
await recorder.step(
  'llm-call',
  `调用 LLM (${cfg.model})`,
  async () => {
    for await (const chunk of streamLlm(cfg, opts)) {   // ← 底层生成器
      if (chunk.type === 'text') {
        send(chunk);          // ← 立刻转发给浏览器
        fullText += chunk.text;
      } else if (chunk.type === 'done') {
        inputTokens = chunk.inputTokens;
        outputTokens = chunk.outputTokens;
        break;
      } else if (chunk.type === 'error') {
        send(chunk);
        throw new Error(chunk.message);
      }
    }
  }
);
```

**关键**：一个 `for await` 循环同时干三件事：
1. **推 SSE 给前端**（`send(chunk)`），实现"AI 边思考边显示"
2. **累加到 `fullText`**，等一会儿要落盘为 assistantMsg
3. **抓 usage tokens**，用于告诉前端本次消耗

**跳到 `llm-client.ts:200`** — `streamLlm`：

```ts
export async function* streamLlm(cfg, opts): AsyncGenerator<LlmChunk> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);   // 60s 超时
  try {
    const gen = isAnthropic(cfg.provider)
      ? streamAnthropicCompatible(cfg, opts, controller.signal)     // llm-client.ts:83
      : streamOpenAiCompatible(cfg, opts, controller.signal);       // llm-client.ts:25
    yield* gen;
  } finally {
    clearTimeout(timer);
  }
}
```

两个 provider 分支的差异：

| 层 | openai-compatible | anthropic-compatible |
|---|---|---|
| endpoint | `${baseUrl}/chat/completions` | `${baseUrl}/v1/messages` |
| 认证 | `Authorization: Bearer ${key}` | `x-api-key: ${key}` + `anthropic-version: 2023-06-01` |
| body 结构 | `messages: [{role:'system'/'user'}]` | `system: '...'` + `messages: [{role:'user'}]` |
| text 位置 | `obj.choices[0].delta.content` | `obj.type === 'content_block_delta'` → `obj.delta.text` |
| 完结信号 | `data: [DONE]` | `obj.type === 'message_stop'` |
| tokens | `obj.usage.{prompt_tokens, completion_tokens}` | 分开两个事件：`message_start.usage.input_tokens` + `message_delta.usage.output_tokens` |

**SSE 帧的解析**由 `readSseStream(res, signal, apiKey, parse)` 统一处理（`llm-client.ts:150-193`）。每个 provider 只需要给一个 `parse(data)` 回调，返回 `{text}`、`{done:true}` 或 `null`。

**错误处理**：任何 fetch 抛错、非 2xx、超时、abort 都会 yield `{ type: 'error', message }`，路由层捕获 → send 给前端 → `recorder` 记 `failed` → finalize + close SSE。**apiKey 在错误消息里始终会被 `redactKey` 打码**（`llm-client.ts:20-23`）。

---

## 8.5 · assistant 消息落盘

`route.ts:232-240`（不算 trace step，属于 llm-call 之后的收尾）：

```ts
const durationMs = Date.now() - startMs;
const assistantMsg = await appendMessage(id, {
  role: 'assistant',
  content: fullText,
  meta: { inputTokens, outputTokens, durationMs }
});
send({ type: 'done', assistantMessageId: assistantMsg.id, inputTokens, outputTokens });
```

到这里**主流程就结束了**：前端已经拿到完整 markdown + assistantMsg id + tokens 数据。**但服务器不 close**，因为还有两件"事后加工"要做。

---

## 9. Step 7 · extract-summary — 抽结构化摘要

**入口**：`route.ts:243-259`

```ts
try {
  const latestCase = await getCase(id);
  const summary = await recorder.step(
    'extract-summary',
    '提取 Bug 摘要',
    () => extractSummary(cfg, {
      problem: latestCase.problem,
      latestAssistantReply: fullText,
      currentSummary: latestCase.summary
    })
  );
  await updateSummary(id, summary);   // 落盘 + 同步 index.json
  send({ type: 'summary', summary });  // 推给前端刷新摘要卡
} catch { /* 记 failed step 但不影响主流程 */ }
```

**跳到 `summary-extractor.ts:46`** — 用**非流式**方式再调一次 LLM，让它把 assistant 的 markdown 回复浓缩成 JSON：

```ts
// summary-extractor.ts:56
const userPrompt = `## 问题描述\n${problem.actual}\n\n## 最新诊断回复\n${latestAssistantReply.slice(0, 6000)}`;
// systemPrompt (extractor 专用): 只回复 JSON，schema = { status, headline, rootCause, fixApproach, verified, verificationNotes }
```

拿到 fullText 后：
1. `extractJson()` 用括号平衡查找第一个 `{...}`（容错 markdown 里带 ```json 包裹）
2. 校验 status 是四选一（open / investigating / resolved / wont-fix），非法就默认 `investigating`
3. 各字段类型检查，非空就填
4. **任何 parse 失败** → `fallback(currentSummary)`，保留旧摘要不报错（`summary-extractor.ts:92`）

`updateSummary` 会走 `case-store.ts:106` 更新 case.json → 再调 `index-store.upsertIndexEntry` 让左侧 Bug 列表实时看到新 headline / status。

---

## 10. Step 8 · update-playbook — 推进步骤状态

**入口**：`route.ts:262-286`

```ts
if (caseWithPlaybook.playbook) {
  const updatedPlaybook = await recorder.step(
    'update-playbook',
    '更新 Playbook 进度',
    () => updatePlaybookProgress(cfg, {
      playbook: caseWithPlaybook.playbook!,
      latestUserMessage: parsed.data.text,
      latestAssistantReply: fullText
    }).then(pb => {
      if (!pb) throw new Error('no changes');    // 让 recorder 记 failed
      return pb;
    })
  );
  await updatePlaybook(id, updatedPlaybook);
  send({ type: 'playbook', playbook: updatedPlaybook });
} else {
  recorder.add({ kind: 'update-playbook', label: '无 Playbook，跳过', status: 'skipped' });
}
```

**跳到 `playbook-updater.ts:32`**：把当前 playbook 步骤列表 + 用户消息 + AI 回复摘要给 LLM，要求它输出：

```json
{
  "updates": [
    { "stepId": "abc", "status": "done", "notes": "已从证据 3 确认" },
    { "stepId": "def", "status": "doing" }
  ]
}
```

**只列变化的步骤**，路由 `map` 一遍应用变更。malformed 或无变化 → 返回 null → 记 failed step → 不推 SSE。

**Playbook 从哪来的**：建 Case 时（Phase 4B：`POST /api/cases`）会调 `playbook-generator.generatePlaybook()` 根据问题描述 + featureKnowledge + relatedCases 起草一份 3-6 步的排障流程。用户也可以 `PUT /api/cases/:id/playbook` 完全自定义。

---

## 11. Finalize trace + 关闭 SSE

**入口**：`route.ts:288-298`

```ts
const trace = await recorder.finalize();
send({ type: 'trace-done', traceId: trace.id, totalMs: trace.totalMs, stepCount: trace.steps.length });
// ...
finally { controller.close(); }
```

**跳到 `trace-recorder.ts:89`** — `finalize()`：

1. 组装 `Trace { id, caseId, triggeredBy, triggerRef, createdAt, totalMs, steps[] }`
2. **原子写盘** `traces/{traceId}.json`（`writeJsonAtomic`：先写 `.tmp` 再 `rename`）
3. 追加 traceId 到 `case.traceIds`（读 → 校验 schema → 原子写回）
4. 追加失败不 throw（trace 已经写盘，主流程仍然成功）

---

## 12. 全链路一图流

```
┌─────────────────────────────────────────────────────────────────────────┐
│ POST /api/cases/:id/messages                                            │
│                                                                         │
│  校验 body ──▶ readSavedConfig ──▶ getCase ──▶ appendMessage(user)      │
│                                                                    │    │
│                                                                    ▼    │
│                                            new TraceRecorder ─────┐     │
│                                                                    │    │
│  ┌───────────────── SSE ReadableStream 内 ─────────────────────────▼──┐ │
│  │                                                                    │ │
│  │  step1 quick-ingest   quickIngest → detectType → addEvidence       │ │
│  │        │              (evidence-store 每条一个 json 落盘)          │ │
│  │        │              emitStep ─▶ SSE {type:'trace-step'}          │ │
│  │        │                                                            │ │
│  │  step2 read-code      readCodeContext(repoPath, keywords)          │ │
│  │        │              (code-reader 白名单 → 遍历 → 截断 → 返回)    │ │
│  │        │              emitStep                                     │ │
│  │        │                                                            │ │
│  │  step3 load-knowledge getFeature(featureId).knowledge              │ │
│  │        │              emitStep                                     │ │
│  │        │                                                            │ │
│  │  step4 find-similar   [skipped: 已从 case.relatedCaseIds 展开]      │ │
│  │        │              emitStep                                     │ │
│  │        │                                                            │ │
│  │        │  ──▶ SSE {type:'context', featureName, ...}               │ │
│  │        │  ──▶ SSE {type:'meta', evidences, codeSnippets, ...}      │ │
│  │        │                                                            │ │
│  │  step5 build-prompt   buildConversationPrompt({...})               │ │
│  │        │              (prompt-builder 按预算切分 evidence + history)│ │
│  │        │              emitStep                                     │ │
│  │        │                                                            │ │
│  │  step6 llm-call       streamLlm(cfg, opts) ── 边收边转发            │ │
│  │        │              ├─ SSE {type:'text', ...}  × N               │ │
│  │        │              └─ 收 done → 拿 inputTokens/outputTokens     │ │
│  │        │              emitStep                                     │ │
│  │        │                                                            │ │
│  │        │  ──▶ appendMessage(assistant, fullText)                   │ │
│  │        │  ──▶ SSE {type:'done', assistantMessageId, tokens}        │ │
│  │        │                                                            │ │
│  │  step7 extract-summary extractSummary(cfg, {...}) → JSON           │ │
│  │        │               ├─ updateSummary → 写 case.json + index.json│ │
│  │        │               └─ SSE {type:'summary', summary}            │ │
│  │        │              emitStep                                     │ │
│  │        │                                                            │ │
│  │  step8 update-playbook updatePlaybookProgress(cfg, {...})          │ │
│  │        │               ├─ updatePlaybook → 写 case.json            │ │
│  │        │               └─ SSE {type:'playbook', playbook}          │ │
│  │        │              emitStep                                     │ │
│  │        │                                                            │ │
│  │  recorder.finalize()  writeJsonAtomic(traces/{id}.json)            │ │
│  │        │              追加 case.traceIds                            │ │
│  │        │              ──▶ SSE {type:'trace-done', traceId, ...}    │ │
│  │        ▼                                                            │ │
│  │  controller.close()                                                 │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 13. 关键设计取舍（读代码看不出来的东西）

1. **用户消息在 LLM 调用之前就落盘**（第 51 行 `appendMessage`）。目的：LLM 挂了对话不丢，下次重跑还是完整历史。
2. **TraceRecorder 用 lastStep + emitStep 而不是"直接推"**。目的：`recorder.step()` 是通用的（成功失败都记），`emitStep()` 只负责把最新那条推到前端，两个关注点分离。
3. **extract-summary 和 update-playbook 是"事后加工"，失败不影响主结果**。这两步各自 `try/catch` 独立，用户已经拿到 markdown 回复了，Playbook/summary 顶多是 UI 上没刷新。
4. **一次消息 3 次 LLM 调用**看似昂贵，但 summary/playbook 都是 512/256 max tokens 的低成本调用，实际总 token 消耗主要在 step 6（几千 tokens）。
5. **Trace 步骤"骨架"是硬编码的**（quick-ingest / read-code / load-knowledge / …），不是让 LLM 自由发挥。目的：可预测、可观测、每一步都能被 UI 上的 timeline 展示。用户如果想改流程 → 用 Playbook（面向业务步骤），而不是 Trace（面向系统实现）。
6. **quick-ingest 是启发式而非 LLM**。目的：0 成本 + 可预测。判错了大不了归到 `free-text`，反正内容都还在 raw.content 里，LLM 照样能看。

---

## 14. 想改进哪一步就去改哪个文件

| 想做的事 | 改哪里 |
|---|---|
| 加一种证据类型识别（如 K8s manifest） | `quick-ingest.ts:10 detectType` |
| 调 Prompt 的分节顺序 / 加新章节 | `prompt-builder.ts:219 buildConversationPrompt` |
| 支持新 LLM provider（如 Google Vertex） | `llm-client.ts` 加一个 `stream*Compatible` + `isAnthropic()` 那种分派 |
| 让 summary 抽取用另一个更便宜的小模型 | `summary-extractor.ts:60` 加一个 `smallModelConfig` 参数 |
| 让 read-code 用 codegraph 而不是 grep | `code-reader.ts:188 readCodeContext` 换实现，保持返回签名 |
| Trace 里加一步（如 "校验修复方案" 二次审查） | 在 `route.ts` 加一个 `recorder.step('validate-fix', ...)` |
| 让用户能"重跑"某个 step | 目前不支持；需要 Trace 存 step 输入 + 加 `POST /api/cases/:id/traces/:traceId/steps/:stepId/rerun` |

---

## 15. 相关 Trace 文件

一次成功的 send-message 会在 `~/.ai-debug-assistant/cases/{caseId}/traces/{traceId}.json` 留下类似：

```json
{
  "id": "trace-uuid",
  "caseId": "case-uuid",
  "triggeredBy": "send-message",
  "triggerRef": "user-message-uuid",
  "createdAt": "2026-07-16T...",
  "totalMs": 6842,
  "steps": [
    { "kind": "quick-ingest", "label": "快速录入用户消息", "durationMs": 12, "status": "ok" },
    { "kind": "read-code", "label": "读取代码上下文", "durationMs": 187, "status": "ok", "meta": { "hits": 5 } },
    { "kind": "load-knowledge", "label": "加载功能知识库 8 条", "durationMs": 4, "status": "ok" },
    { "kind": "find-similar", "label": "相似案例已从 Case 关联列表加载", "durationMs": 0, "status": "skipped" },
    { "kind": "build-prompt", "label": "构建提示词 18234 字符", "durationMs": 2, "status": "ok" },
    { "kind": "llm-call", "label": "调用 LLM (claude-opus-4-7)", "durationMs": 5423, "status": "ok" },
    { "kind": "extract-summary", "label": "提取 Bug 摘要", "durationMs": 891, "status": "ok" },
    { "kind": "update-playbook", "label": "更新 Playbook 进度", "durationMs": 312, "status": "ok" }
  ]
}
```

前端可以通过 `GET /api/cases/:id/traces/:traceId` 拿到，做 UI 展示的 timeline。
