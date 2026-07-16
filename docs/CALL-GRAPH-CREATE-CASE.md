# 执行链路：新建 Case（create-case）从头到尾

> 建 Case 是这个工具里**串起来 + 进化**能力发生的地方：
> - 分类到某个业务模块（feature）→ 挂进对应"档案柜"
> - 找出该模块历史上同类的 resolved bug → 存 relatedCaseIds
> - 起草一份 3-6 步的排障 playbook → 自动记为 case.playbook
>
> 全程 3 次 LLM 调用（classify → similarity → playbook），成功时全串起来，任何一步挂了主流程仍然产出可用的 Case。

---

## 0. 上帝视角

```
┌──────────────────────┐
│ Browser              │
│  QuickForm.onSubmit  │  src/components/analyze/quick-form.tsx
│  ↓                   │
│  api.createCase()    │  src/client/api.ts:20
└──────────┬───────────┘
           │ POST /api/cases { problem, meta? }
           ▼
┌──────────────────────────────────────────────────────────────┐
│ Route Handler                                                │
│  src/app/api/cases/route.ts:25 (POST)                        │
│                                                              │
│  1. 校验 body                                                │
│  2. createCase(...) —— case.json 立刻落盘（拿到 id）          │
│  3. 读 config；没配置就直接返回，不做后续 3 步                │
│  4. new TraceRecorder                                        │
│  5. step:classify-feature —— 1 次 LLM                        │
│     ├─ 已有则复用 feature id                                 │
│     └─ 没有则 createFeature() 落盘                            │
│  6. incrementFeatureStats(bug:+1)                            │
│  7. step:find-similar —— 有 candidate 才调 1 次 LLM           │
│     └─ 无 candidate → recorder.add(skipped)                  │
│  8. updateCase({ featureId, relatedCaseIds })                │
│  9. step:load-knowledge(生成 playbook) —— 1 次 LLM           │
│     └─ 失败 → warnings.push('playbook failed')               │
│ 10. finalize trace + 落盘                                    │
│ 11. 返回 { case, feature, relatedCases, trace, warnings }    │
└──────────────────────────────────────────────────────────────┘
```

3 次 LLM 调用是**串行**的（每一步的输入依赖上一步），不能并行。总耗时通常 3-6 秒。

---

## 1. 前端触发

**文件**：`src/components/analyze/quick-form.tsx`

用户在首屏填了问题描述（可能是从任意一段粘贴文本自动分节的）后，`onSubmit` 抛给主页：

```ts
// src/app/page.tsx: handleFirstMessage
const created = await api.createCase({
  problem: { actual, expected, entry, environment },
  meta: { repoPath?, module? }
});
```

`api.createCase` 就是普通 `fetch POST`（`src/client/api.ts:20-22`）。返回的响应结构：

```ts
{
  case: Case,                    // 已带 featureId, relatedCaseIds, playbook
  feature?: Feature,
  relatedCases: [{ id, headline?, rootCause? }],
  trace: { id },                 // 本次执行的 trace id
  warnings?: string[]            // 各步的非致命错误
}
```

---

## 2. 入口 Route：早退 + 立即落盘

**文件**：`src/app/api/cases/route.ts:25`

**Step 0**（不入 trace）：

```ts
// route.ts:32-49
const parsed = createCaseInputSchema.safeParse(body);          // Zod 校验
if (!parsed.success) return 400;

let c = await createCase(parsed.data);                          // 41: **立刻落盘**

const cfg = await readSavedConfig();                            // 44
if (!cfg) {
  warnings.push('model not configured — skipped feature classification');
  await upsertIndexEntry(c);
  return NextResponse.json({ case: c, ..., warnings }, { status: 201 });   // 未配置时的短路径
}
```

**关键设计**：**Case 在 LLM 调用之前就落盘**（第 41 行）。哪怕后面所有 LLM 都挂了，用户至少拿到一个可交互的 Case（无 feature、无 playbook，但可以正常聊天）。

`createCase`（`case-store.ts:25`）只做纯本地操作：uuid + 默认 pipeline + 原子写盘 → 不会失败。

---

## 3. Step 1 · classify-feature — 判断业务模块

**入口**：`route.ts:51-83`

```ts
const recorder = new TraceRecorder(c.id, 'create-case');
const existingFeatures = await listFeatures();      // 读 ~/.ai-debug-assistant/features/*.json

const classification = await recorder.step(
  'classify-feature',
  '分类业务模块',
  () => classifyFeature(cfg, { problem, meta, existingFeatures })
);

// 解析结果 → 命中已有 feature 或新建
if (classification.matchedExistingId) {
  featureId = classification.matchedExistingId;
  feature = await getFeature(featureId).catch(() => undefined);
  if (!feature) feature = await createFeature({ name: classification.featureName });
} else {
  const existing = await findFeatureByName(classification.featureName);
  if (existing) { featureId = existing.id; feature = existing; }
  else feature = await createFeature({ name: classification.featureName });
}

await incrementFeatureStats(featureId, { bug: 1 });   // bugCount++
```

**跳到 `feature-classifier.ts:31`**：

- **System prompt**（第 5-13 行）：
  ```
  你负责把 bug 归入业务模块。看用户描述，从已有模块中挑一个最匹配的；
  如果都不匹配，起一个简短业务名（2-6 字，如「审批」「订单」「登录」）。

  输出严格遵循以下 JSON（不要输出任何其他内容）：
  { "featureName": "...", "matchedExistingId": "uuid 或 null", "confidence": 0..1, "reasoning": "..." }
  ```

- **User prompt** 结构（第 45 行）：
  ```
  ## 已有业务模块
  - 审批 (id: uuid-1)
  - 订单 (id: uuid-2)
  ...
  ## Bug 描述
  - 实际现象：...
  - 期望行为：...
  - 入口：...
  - 环境：...
  ```

- **LLM 参数**：`maxTokens: 256, temperature: 0` — 极便宜、极稳定。

- **JSON 解析**：用 `extractJson()` 括号平衡查找第一个 `{...}`（容错模型偶尔用 markdown 包裹）；schema 校验失败 → `FALLBACK = { featureName: '未分类', confidence: 0 }`（第 29 行），**永远不抛**。

**为什么设计成永不抛**：整个 create-case 路由把 classify 挂了会退化成"未分类的 case"，用户仍能用。抛出去反而会 500 导致 case 都没保住（不过 case 已经在 step 0 落盘了，其实无所谓——这是双保险）。

---

## 4. Step 2 · find-similar — 找相似的已解决 bug

**入口**：`route.ts:88-103`

```ts
const allCases = await listCases();
const candidateCases = allCases.filter(
  cc => cc.featureId === featureId && cc.summary?.status === 'resolved'
);

if (candidateCases.length > 0) {
  const similar = await recorder.step(
    'find-similar',
    `命中相似历史 ${candidateCases.length} 条`,
    () => findSimilarCases(cfg, { problem, candidateCases, topK: 3 })
  );
  relatedCaseIds = similar.map(s => s.caseId);
} else {
  recorder.add({ kind: 'find-similar', label: '无相似历史', status: 'skipped' });
}
```

**关键设计**：candidate 池**先在服务器端过滤**（同 featureId + status=resolved），才丢给 LLM 打分。这样：
1. 不同 feature 之间的 bug 不会互相污染
2. 未解决的 bug 不做参考（避免"错误引导"）
3. LLM 只需要在小池子里排序（通常 < 20 条），token 消耗低

**跳到 `similarity-search.ts:21`**：

- **短路优化**（第 31-33 行）：如果候选数量 ≤ topK，直接全返回不调 LLM。
- **User prompt** 结构（第 42 行）：
  ```
  ## 当前问题
  - 现象：...
  - 期望：...

  ## 候选已解决 Bug（共 N 条）
  1. id=xxx | 标题=xxx | 根因=xxx | 现象=前 200 字
  2. ...

  请从候选中找出最相似的 3 条，输出 JSON 数组：
  [{"caseId":"...","score":0..1,"reason":"..."}]
  ```
- **回退策略**（第 35-36 行）：JSON 无法解析或数组空 → `candidateCases.slice(0, topK)` 前 3 条以 `score=0.5` 返回。即"打分挂了也给个东西"，不会让用户完全拿不到相似历史。

---

## 5. 把结果串到 Case 上

**入口**：`route.ts:106-125`

```ts
c = await updateCase({
  ...c,
  featureId,
  relatedCaseIds: relatedCaseIds.length > 0 ? relatedCaseIds : undefined
});
await upsertIndexEntry(c, feature.name);      // 让左侧 Bug 列表能按 feature 分组

// 把相似 case 展开成可读结构（供响应用 + 供 playbook 用）
const relatedCasesResp = await Promise.all(
  relatedCaseIds.map(async (id) => {
    const rc = await getCase(id);
    relatedCasesForPlaybook.push({
      headline: rc.summary?.headline,
      rootCause: rc.summary?.rootCause,
      fix: rc.summary?.fixApproach
    });
    return { id, headline: rc.summary?.headline, rootCause: rc.summary?.rootCause };
  })
);
```

到这里 case.json 已经有了 `featureId` 和 `relatedCaseIds`。**发消息链路就是靠这两个字段吃到"串起来"的红利**（见 `docs/CALL-GRAPH.md` step 3、step 4）。

---

## 6. Step 3 · load-knowledge → 生成 Playbook

**入口**：`route.ts:128-147`

```ts
try {
  const featureKnowledge = feature?.knowledge;    // 该 feature 之前已经"进化"出来的知识
  const playbook = await recorder.step(
    'load-knowledge',
    'AI 生成排障 Playbook',
    () => generatePlaybook(cfg, {
      problem,
      featureKnowledge,          // 有历史沉淀就带上
      relatedCases: relatedCasesForPlaybook   // 上一步展开的相似 case
    }).then(pb => {
      if (!pb) throw new Error('generatePlaybook returned null');
      return pb;
    })
  );
  await updatePlaybook(c.id, playbook);
  c = await getCase(c.id);      // 重新读一遍，把 playbook 带进响应
} catch {
  warnings.push('playbook generation failed');
}
```

> 注：trace step kind 用的是 `load-knowledge`（把生成 Playbook 视为"读取该功能的知识 → 编译成流程"的动作）。这是 4B 实现的一个小妥协，未来可以扩 kind 枚举。

**跳到 `playbook-generator.ts`**（前 60 行是 prompt 组装，60 行往后是 LLM 调用和 JSON 解析）：

- **System prompt**：让 LLM 起草 3-6 步的排障 playbook，每步是动词短句 + 可选 hint
- **User prompt** 结构（`playbook-generator.ts:30-58`）：
  ```
  ## 问题描述
  - 实际现象 / 期望 / 入口 / 环境

  ## 该功能的已知模式（若 featureKnowledge 存在）
  常见根因：- xxx
  已验证的修复模式：- 症状：X → 根因：Y → 修复：Z

  ## 相似历史案例（若 relatedCases 存在）
  1. headline → 根因：rootCause

  请输出 JSON：{"steps":[{"title":"...","hint":"..."}]}
  ```
- 解析后（第 79-90 行）转成 `Playbook.steps[]`：
  ```ts
  {
    id: uuid(),
    order: i + 1,
    title: '抓详情接口 cURL',
    hint: '从浏览器 Network 面板 Copy as cURL',
    status: 'todo',
    updatedAt: now,
    updatedBy: 'llm'
  }
  ```
- **失败恢复**：任何环节挂了 → 返回 `null`。路由层的 `.then(pb => { if (!pb) throw... })` 把 null 转成异常让 `recorder.step` 记 `failed`；外层 try/catch 只是加个 warning，不影响主 case 返回。

**"进化"的关键就在这一步**：`featureKnowledge` 是历史修复经验的沉淀，`relatedCases` 是同一 feature 已解决 bug 的摘要。**下一个同 feature 的新 case，起草出的 playbook 就会自然反映过去的教训**。

---

## 7. Finalize + 响应

**入口**：`route.ts:149-153`

```ts
const trace = await recorder.finalize();      // 写 traces/{traceId}.json + 追加 case.traceIds
return NextResponse.json(
  { case: c, feature, relatedCases: relatedCasesResp, warnings, trace: { id: trace.id } },
  { status: 201 }
);
```

**catch 路径**（`route.ts:154-160`）：

```ts
} catch (e) {
  warnings.push(`classification failed: ${(e as Error).message}`);
  try { await recorder.finalize(); } catch { /* ignore */ }
}
await upsertIndexEntry(c);
return NextResponse.json({ case: c, feature: undefined, relatedCases: [], warnings }, { status: 201 });
```

即使整段 try 块挂了：
1. **Case 依然存在**（step 0 落盘的）
2. Trace 尽可能落盘（可能记录到失败的那一步为止）
3. 返回 201 而不是 5xx，让前端跳过错误 UI 直接进入对话页
4. warnings 里带着具体错误原因，UI 可选择性显示

---

## 8. 全链路一图流

```
POST /api/cases  body: { problem, meta? }
    │
    ├─▶ Zod validate
    ├─▶ createCase(parsed) ──▶ case.json 落盘（step 0 就已获得 caseId）
    ├─▶ readSavedConfig
    │       │
    │       └─ 未配置 ──▶ upsertIndexEntry ──▶ 201 return（早退）
    │
    ├─▶ new TraceRecorder(caseId, 'create-case')
    │
    ├─▶ listFeatures()  （读 features/index.json + 每个 features/{id}.json）
    │
    ├─▶ step:classify-feature
    │     └─ classifyFeature(cfg, { problem, meta, existingFeatures })
    │            └─ streamLlm × 1  (system: JSON only, max 256 tokens)
    │            └─ extractJson → parsed / FALLBACK
    │       │
    │       ├─ matchedExistingId 命中 → getFeature(id)
    │       ├─ 或 findFeatureByName(name) → 命中
    │       └─ 都不命中 → createFeature({ name })
    │
    ├─▶ incrementFeatureStats(id, { bug: +1 })
    │
    ├─▶ candidates = listCases().filter(featureId + status=resolved)
    │
    ├─▶ if candidates.length > 0:
    │       step:find-similar
    │       └─ findSimilarCases(cfg, { problem, candidates, topK:3 })
    │              └─ streamLlm × 1  (LLM 打分，返回 JSON 数组)
    │              └─ fallback: 取前 3 条 score=0.5
    │    else:
    │       recorder.add({ find-similar, skipped })
    │
    ├─▶ updateCase({ featureId, relatedCaseIds })  ──▶ case.json 再次落盘
    ├─▶ upsertIndexEntry(c, feature.name)          ──▶ index.json 更新（含 featureName）
    │
    ├─▶ 展开 relatedCases 详情（headline / rootCause / fix）
    │
    ├─▶ step:load-knowledge (生成 playbook)
    │     └─ generatePlaybook(cfg, { problem, featureKnowledge, relatedCases })
    │            └─ streamLlm × 1 (max 512 tokens)
    │            └─ 解析 steps[] → 附 id + order + status='todo'
    │       │
    │       └─ updatePlaybook(caseId, playbook) ──▶ case.json 落盘
    │
    ├─▶ recorder.finalize() ──▶ traces/{id}.json 落盘 + case.traceIds 追加
    │
    └─▶ 201 { case, feature, relatedCases, warnings, trace:{id} }
```

**LLM 调用次数**：classify (1) + similarity (0 或 1) + playbook (1) = **通常 3 次，最少 2 次**。

**总 token 花销**（典型场景）：
- classify: ~200 in / ~50 out
- similarity: ~1000 in / ~150 out（依赖候选数量）
- playbook: ~800 in / ~250 out
- 合计约 **2500 in / 450 out**，比一次对话消息还便宜。

---

## 9. 与"发消息"链路的对照

| 维度 | create-case（本文档） | send-message（[docs/CALL-GRAPH.md](./CALL-GRAPH.md)） |
|---|---|---|
| 触发 | 首次填表提交 | 对话框输入 |
| LLM 调用 | 3 次串行（classify → similarity → playbook） | 3 次串行（chat → summary → playbook-update） |
| 响应形式 | 一次性 JSON | SSE 流式 |
| 主输出 | Case + Playbook + relatedCases | Assistant markdown + summary + playbook 更新 |
| 失败容忍 | 每步独立 try/catch，warnings 累积 | 每步 recorder.step 独立记录，emit trace-step |
| Trace 内容 | classify → find-similar → load-knowledge | quick-ingest → read-code → load-knowledge → find-similar(skip) → build-prompt → llm-call → extract-summary → update-playbook |
| 用户可见步骤数 | 3 步 | 8 步 |

**两条链路共享的模块**：`TraceRecorder`、`streamLlm`、`case-store`、`feature-store`、`prompt-builder`（send-message 用 `buildConversationPrompt`，create-case 各分类器自己起 prompt）。

---

## 10. 想改动哪一步就去改哪个文件

| 想做的事 | 改哪里 |
|---|---|
| 让 classify 用小模型（省 token） | `feature-classifier.ts:49` 加一个 `smallModelConfig` 参数 |
| 换个策略选相似 case（embedding / BM25） | `similarity-search.ts:21 findSimilarCases`，保持返回签名 |
| Playbook 模板化（同 feature 都用同一份） | 在 `feature-store.ts` 里加 `feature.playbookTemplate?`，`playbook-generator.ts` 优先读它 |
| classify 加人工确认（低置信度时让 UI 弹一下） | `route.ts:65` 检查 `classification.confidence < 0.6` 时不写 featureId，前端根据 warnings 弹确认 |
| 允许一个 Case 归属多个 feature | 把 `case.featureId: string` 改成 `case.featureIds: string[]`，全局 grep 更新 |

---

## 11. 一份真实 trace（截取）

新建一个 case 后 `~/.ai-debug-assistant/cases/{id}/traces/{traceId}.json` 大致长这样：

```json
{
  "id": "3f8...",
  "caseId": "adb...",
  "triggeredBy": "create-case",
  "createdAt": "2026-07-16T...",
  "totalMs": 4213,
  "steps": [
    {
      "kind": "classify-feature",
      "label": "分类业务模块",
      "durationMs": 894,
      "status": "ok",
      "meta": {}
    },
    {
      "kind": "find-similar",
      "label": "命中相似历史 5 条",
      "durationMs": 1207,
      "status": "ok"
    },
    {
      "kind": "load-knowledge",
      "label": "AI 生成排障 Playbook",
      "durationMs": 2103,
      "status": "ok"
    }
  ]
}
```

前端可以通过 `GET /api/cases/:caseId/traces/:traceId` 拿到，做 timeline 展示。所有历史 trace 通过 `GET /api/cases/:caseId/traces` 拉列表（每次发消息都会新增一条）。
