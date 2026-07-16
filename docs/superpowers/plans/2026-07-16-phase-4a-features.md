# Phase 4A — Feature Knowledge Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-classify every new Bug Case into a business feature (业务模块), find similar resolved cases at creation time, extract lessons when cases resolve, and roll knowledge up into a per-feature card that enriches future conversation prompts.

**Architecture:** New server-side modules (feature-store, feature-classifier, similarity-search, lesson-extractor, knowledge-builder) follow the same atomic-write / streamLlm patterns already in the codebase. Domain types and Zod schemas grow new optional fields for full backward compat. Two existing API routes (POST /cases, PATCH /cases/:id/status) gain fire-and-forget LLM enrichment; five new routes expose Feature CRUD.

**Tech Stack:** TypeScript, Next.js App Router API routes, Zod, uuid, vitest — no new dependencies.

---

## File Map

### New files to create
- `src/domain/types.ts` — extend (add Feature, FeatureKnowledge, VerifiedFix, Lesson; extend Case, CaseIndexEntry)
- `src/domain/schemas.ts` — extend (add feature/lesson schemas; extend caseSchema, caseIndexEntrySchema)
- `src/server/paths.ts` — extend (add featuresDir, featureFile, featuresIndexFile)
- `src/server/feature-store.ts` — CRUD + index for Feature entities
- `src/server/feature-classifier.ts` — LLM-based feature classification
- `src/server/similarity-search.ts` — LLM-based top-K similar resolved-case lookup
- `src/server/lesson-extractor.ts` — LLM-based lesson extraction from resolved case
- `src/server/knowledge-builder.ts` — pure aggregation of lessons into FeatureKnowledge
- `src/server/prompt-builder.ts` — extend buildConversationPrompt with featureKnowledge + relatedCases
- `src/app/api/cases/route.ts` — extend POST to classify + find similar cases
- `src/app/api/cases/[id]/messages/route.ts` — extend to inject feature context + emit context SSE chunk
- `src/app/api/cases/[id]/status/route.ts` — extend resolved transition to extract lesson + refresh knowledge
- `src/app/api/features/route.ts` — GET (list) handler
- `src/app/api/features/[id]/route.ts` — GET (detail) + PATCH (rename/aliases) handler
- `src/app/api/features/[id]/refresh-knowledge/route.ts` — POST force recompute
- `src/app/api/cases/[id]/feature/route.ts` — PATCH manual feature reassignment

### New test files to create
- `tests/server/feature-store.test.ts`
- `tests/server/feature-classifier.test.ts`
- `tests/server/similarity-search.test.ts`
- `tests/server/lesson-extractor.test.ts`
- `tests/server/knowledge-builder.test.ts`
- `tests/api/features.test.ts`
- `tests/api/cases-feature.test.ts` — extends POST /cases classification tests
- `tests/api/status-feature.test.ts` — extends resolved transition tests

---

## Task 1: Extend domain types and Zod schemas

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/schemas.ts`
- Test: `tests/domain/schemas.test.ts` (extend existing)

- [ ] **Step 1: Add new interfaces to types.ts**

Open `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/domain/types.ts` and append after the existing `CaseIndexEntry` interface:

```ts
export interface VerifiedFix {
  symptomPattern: string;
  rootCause: string;
  fix: string;
  sourceCaseIds: string[];
}

export interface FeatureKnowledge {
  commonRootCauses: string[];
  verifiedFixes: VerifiedFix[];
  updatedAt: string;
  sourceCaseCount: number;
}

export interface Feature {
  id: string;
  name: string;
  aliases?: string[];
  createdAt: string;
  updatedAt: string;
  bugCount: number;
  resolvedCount: number;
  knowledge?: FeatureKnowledge;
}

export interface Lesson {
  symptomPattern: string;
  rootCause: string;
  fix: string;
  extractedAt: string;
}
```

Also extend the existing `Case` interface — add three optional fields inside `Case` after `summary?`:

```ts
  featureId?: string;
  relatedCaseIds?: string[];
  lessons?: Lesson;
```

Extend the existing `CaseIndexEntry` interface — add two optional fields:

```ts
  featureId?: string;
  featureName?: string;
```

- [ ] **Step 2: Add Zod schemas to schemas.ts**

Open `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/domain/schemas.ts` and append after `caseIndexEntrySchema`:

```ts
export const verifiedFixSchema = z.object({
  symptomPattern: z.string(),
  rootCause: z.string(),
  fix: z.string(),
  sourceCaseIds: z.array(z.string())
});

export const featureKnowledgeSchema = z.object({
  commonRootCauses: z.array(z.string()),
  verifiedFixes: z.array(verifiedFixSchema),
  updatedAt: z.string(),
  sourceCaseCount: z.number().nonnegative()
});

export const featureSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  bugCount: z.number().nonnegative(),
  resolvedCount: z.number().nonnegative(),
  knowledge: featureKnowledgeSchema.optional()
});

export const lessonSchema = z.object({
  symptomPattern: z.string(),
  rootCause: z.string(),
  fix: z.string(),
  extractedAt: z.string()
});

export const featureIndexEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  bugCount: z.number().nonnegative(),
  resolvedCount: z.number().nonnegative(),
  updatedAt: z.string()
});
```

Also update the existing `caseSchema` — add optional fields inside the `z.object({...})` block, after `summary`:

```ts
  featureId: z.string().uuid().optional(),
  relatedCaseIds: z.array(z.string().uuid()).optional(),
  lessons: lessonSchema.optional(),
```

And update `caseIndexEntrySchema` — add optional fields after `headline`:

```ts
  featureId: z.string().uuid().optional(),
  featureName: z.string().optional(),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run typecheck 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Run existing tests to confirm no regression**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test 2>&1 | tail -10
```

Expected: `Tests  161 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && git add src/domain/types.ts src/domain/schemas.ts && git commit -m "feat(domain): add Feature, Lesson, FeatureKnowledge types and Zod schemas"
```

---

## Task 2: Extend paths.ts and create feature-store.ts

**Files:**
- Modify: `src/server/paths.ts`
- Create: `src/server/feature-store.ts`
- Create: `tests/server/feature-store.test.ts`

- [ ] **Step 1: Write failing tests for feature-store**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/tests/server/feature-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  createFeature,
  getFeature,
  listFeatures,
  updateFeature,
  deleteFeature,
  findFeatureByName,
  incrementFeatureStats
} from '@/server/feature-store';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-feat-'));
  process.env.AI_DEBUG_HOME = tmp;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

describe('feature-store — CRUD', () => {
  it('createFeature 生成 uuid + 落盘', async () => {
    const f = await createFeature({ name: '审批' });
    expect(f.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.name).toBe('审批');
    expect(f.bugCount).toBe(0);
    expect(f.resolvedCount).toBe(0);
    const raw = await fs.readFile(
      path.join(tmp, 'features', f.id + '.json'), 'utf8'
    );
    expect(JSON.parse(raw).id).toBe(f.id);
  });

  it('getFeature 回读', async () => {
    const f = await createFeature({ name: '订单' });
    const back = await getFeature(f.id);
    expect(back.id).toBe(f.id);
    expect(back.name).toBe('订单');
  });

  it('getFeature 不存在 → 抛错', async () => {
    await expect(getFeature('00000000-0000-0000-0000-000000000000')).rejects.toThrow();
  });

  it('listFeatures 返回全部', async () => {
    const a = await createFeature({ name: '审批' });
    const b = await createFeature({ name: '登录' });
    const list = await listFeatures();
    const ids = list.map(x => x.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
  });

  it('listFeatures 目录不存在时返回空数组', async () => {
    const list = await listFeatures();
    expect(list).toEqual([]);
  });

  it('updateFeature 修改名称 + 更新 updatedAt', async () => {
    const f = await createFeature({ name: '审批' });
    const updated = await updateFeature({ ...f, name: '审批流' });
    expect(updated.name).toBe('审批流');
    const back = await getFeature(f.id);
    expect(back.name).toBe('审批流');
  });

  it('deleteFeature 移除文件', async () => {
    const f = await createFeature({ name: '审批' });
    await deleteFeature(f.id);
    await expect(getFeature(f.id)).rejects.toThrow();
  });

  it('findFeatureByName 精确匹配', async () => {
    await createFeature({ name: '审批' });
    const found = await findFeatureByName('审批');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('审批');
  });

  it('findFeatureByName 不存在 → null', async () => {
    await createFeature({ name: '审批' });
    const found = await findFeatureByName('不存在');
    expect(found).toBeNull();
  });

  it('aliases 选填，存储后回读', async () => {
    const f = await createFeature({ name: '审批', aliases: ['approval', 'audit'] });
    const back = await getFeature(f.id);
    expect(back.aliases).toEqual(['approval', 'audit']);
  });
});

describe('feature-store — index maintenance', () => {
  it('createFeature 写入 features/index.json', async () => {
    const f = await createFeature({ name: '审批' });
    const raw = await fs.readFile(path.join(tmp, 'features', 'index.json'), 'utf8');
    const idx = JSON.parse(raw);
    expect(Array.isArray(idx)).toBe(true);
    expect(idx[0].id).toBe(f.id);
    expect(idx[0].name).toBe('审批');
  });

  it('deleteFeature 从 index 移除', async () => {
    const f = await createFeature({ name: '审批' });
    await deleteFeature(f.id);
    const raw = await fs.readFile(path.join(tmp, 'features', 'index.json'), 'utf8');
    const idx = JSON.parse(raw);
    expect(idx.find((e: { id: string }) => e.id === f.id)).toBeUndefined();
  });
});

describe('feature-store — incrementFeatureStats', () => {
  it('bug delta 累加', async () => {
    const f = await createFeature({ name: '审批' });
    await incrementFeatureStats(f.id, { bug: 1 });
    await incrementFeatureStats(f.id, { bug: 1 });
    const back = await getFeature(f.id);
    expect(back.bugCount).toBe(2);
  });

  it('resolved delta 累加', async () => {
    const f = await createFeature({ name: '审批' });
    await incrementFeatureStats(f.id, { bug: 1, resolved: 1 });
    const back = await getFeature(f.id);
    expect(back.bugCount).toBe(1);
    expect(back.resolvedCount).toBe(1);
  });

  it('负数 delta 不低于 0', async () => {
    const f = await createFeature({ name: '审批' });
    await incrementFeatureStats(f.id, { resolved: -1 });
    const back = await getFeature(f.id);
    expect(back.resolvedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/server/feature-store.test.ts 2>&1 | tail -15
```

Expected: FAIL (module not found).

- [ ] **Step 3: Extend paths.ts with feature path helpers**

Append to `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/server/paths.ts`:

```ts
export function featuresDir(): string {
  return path.join(getRoot(), 'features');
}

export function featureFile(featureId: string): string {
  return path.join(featuresDir(), `${featureId}.json`);
}

export function featuresIndexFile(): string {
  return path.join(featuresDir(), 'index.json');
}
```

- [ ] **Step 4: Create feature-store.ts**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/server/feature-store.ts`:

```ts
import fs from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import type { Feature } from '@/domain/types';
import { featureSchema, featureIndexEntrySchema } from '@/domain/schemas';
import { featuresDir, featureFile, featuresIndexFile } from './paths';
import { writeJsonAtomic, readJson, fileExists } from './fs-atomic';
import { z } from 'zod';

const featureIndexArraySchema = z.array(featureIndexEntrySchema);

type FeatureIndexEntry = z.infer<typeof featureIndexEntrySchema>;

async function readFeaturesIndex(): Promise<FeatureIndexEntry[]> {
  if (!(await fileExists(featuresIndexFile()))) return [];
  try {
    return featureIndexArraySchema.parse(await readJson(featuresIndexFile()));
  } catch {
    return [];
  }
}

async function writeFeaturesIndex(entries: FeatureIndexEntry[]): Promise<void> {
  await writeJsonAtomic(featuresIndexFile(), entries);
}

function toIndexEntry(f: Feature): FeatureIndexEntry {
  return {
    id: f.id,
    name: f.name,
    bugCount: f.bugCount,
    resolvedCount: f.resolvedCount,
    updatedAt: f.updatedAt
  };
}

async function upsertIndex(f: Feature): Promise<void> {
  const cur = await readFeaturesIndex();
  const next = cur.filter(e => e.id !== f.id);
  next.push(toIndexEntry(f));
  next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  await writeFeaturesIndex(next);
}

async function removeFromIndex(id: string): Promise<void> {
  const cur = await readFeaturesIndex();
  await writeFeaturesIndex(cur.filter(e => e.id !== id));
}

export async function createFeature(input: { name: string; aliases?: string[] }): Promise<Feature> {
  const now = new Date().toISOString();
  const f: Feature = {
    id: uuid(),
    name: input.name,
    aliases: input.aliases,
    createdAt: now,
    updatedAt: now,
    bugCount: 0,
    resolvedCount: 0
  };
  featureSchema.parse(f);
  await writeJsonAtomic(featureFile(f.id), f);
  await upsertIndex(f);
  return f;
}

export async function getFeature(id: string): Promise<Feature> {
  const file = featureFile(id);
  if (!(await fileExists(file))) throw new Error(`Feature not found: ${id}`);
  const raw = await readJson<Feature>(file);
  return featureSchema.parse(raw);
}

export async function updateFeature(f: Feature): Promise<Feature> {
  const next = { ...f, updatedAt: new Date().toISOString() };
  featureSchema.parse(next);
  await writeJsonAtomic(featureFile(next.id), next);
  await upsertIndex(next);
  return next;
}

export async function listFeatures(): Promise<Feature[]> {
  const dir = featuresDir();
  if (!(await fileExists(dir))) return [];
  const entries = await fs.readdir(dir);
  const features: Feature[] = [];
  for (const e of entries) {
    if (!/^[0-9a-f-]{36}\.json$/.test(e)) continue;
    try {
      features.push(await getFeature(e.replace('.json', '')));
    } catch {
      // skip corrupted
    }
  }
  return features.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteFeature(id: string): Promise<void> {
  const file = featureFile(id);
  await fs.rm(file, { force: true });
  await removeFromIndex(id);
}

export async function findFeatureByName(name: string): Promise<Feature | null> {
  const all = await listFeatures();
  return all.find(f => f.name === name) ?? null;
}

export async function incrementFeatureStats(
  id: string,
  delta: { bug?: number; resolved?: number }
): Promise<void> {
  const f = await getFeature(id);
  const bugCount = Math.max(0, f.bugCount + (delta.bug ?? 0));
  const resolvedCount = Math.max(0, f.resolvedCount + (delta.resolved ?? 0));
  await updateFeature({ ...f, bugCount, resolvedCount });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/server/feature-store.test.ts 2>&1 | tail -15
```

Expected: all feature-store tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && git add src/server/paths.ts src/server/feature-store.ts tests/server/feature-store.test.ts && git commit -m "feat(features): add feature store with CRUD, index maintenance, and stat increment"
```

---

## Task 3: Feature classifier

**Files:**
- Create: `src/server/feature-classifier.ts`
- Create: `tests/server/feature-classifier.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/tests/server/feature-classifier.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/llm-client', () => ({
  streamLlm: vi.fn()
}));

import { classifyFeature } from '@/server/feature-classifier';
import { streamLlm } from '@/server/llm-client';
import type { Feature } from '@/domain/types';

const cfg = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434',
  apiKey: 'test-key',
  model: 'gpt-4'
};

const problem = {
  actual: '审批单提交后无响应',
  expected: '跳转到成功页',
  entry: 'POST /api/approve',
  environment: 'production'
};

async function* makeStream(text: string) {
  yield { type: 'text' as const, text };
  yield { type: 'done' as const };
}

const existingFeatures: Feature[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: '审批',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    bugCount: 3,
    resolvedCount: 2
  }
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe('classifyFeature', () => {
  it('成功匹配已有模块 → 返回 matchedExistingId', async () => {
    const json = JSON.stringify({
      featureName: '审批',
      matchedExistingId: '11111111-1111-1111-1111-111111111111',
      confidence: 0.9,
      reasoning: '明显属于审批模块'
    });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await classifyFeature(cfg, { problem, existingFeatures });
    expect(result.featureName).toBe('审批');
    expect(result.matchedExistingId).toBe('11111111-1111-1111-1111-111111111111');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('提议新模块名 → matchedExistingId 为 undefined', async () => {
    const json = JSON.stringify({
      featureName: '订单支付',
      matchedExistingId: null,
      confidence: 0.8,
      reasoning: '和支付有关'
    });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await classifyFeature(cfg, { problem, existingFeatures });
    expect(result.featureName).toBe('订单支付');
    expect(result.matchedExistingId).toBeUndefined();
  });

  it('malformed JSON → fallback 未分类，不抛错', async () => {
    vi.mocked(streamLlm).mockImplementation(() => makeStream('not json'));

    const result = await classifyFeature(cfg, { problem, existingFeatures });
    expect(result.featureName).toBe('未分类');
    expect(result.confidence).toBe(0);
  });

  it('LLM 报错 → fallback 未分类，不抛错', async () => {
    async function* errorStream() {
      yield { type: 'error' as const, message: 'network error' };
    }
    vi.mocked(streamLlm).mockImplementation(() => errorStream());

    const result = await classifyFeature(cfg, { problem, existingFeatures });
    expect(result.featureName).toBe('未分类');
    expect(result.confidence).toBe(0);
  });

  it('空 existingFeatures → 仍然返回 featureName', async () => {
    const json = JSON.stringify({
      featureName: '登录',
      matchedExistingId: null,
      confidence: 0.75,
      reasoning: '登录相关'
    });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await classifyFeature(cfg, { problem, existingFeatures: [] });
    expect(result.featureName).toBe('登录');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/server/feature-classifier.test.ts 2>&1 | tail -10
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create feature-classifier.ts**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/server/feature-classifier.ts`:

```ts
import type { ModelConfig } from '@/domain/model-config';
import type { CaseProblem, CaseMeta, Feature } from '@/domain/types';
import { streamLlm } from './llm-client';

const SYSTEM_PROMPT = `你负责把 bug 归入业务模块。看用户描述，从已有模块中挑一个最匹配的；如果都不匹配，起一个简短业务名（2-6 字，如「审批」「订单」「登录」）。

输出严格遵循以下 JSON（不要输出任何其他内容，不要包裹在 markdown 代码块里）：
{
  "featureName": "模块名",
  "matchedExistingId": "已有模块的 uuid 或 null",
  "confidence": 0.0到1.0的数字,
  "reasoning": "一句话说明"
}`;

function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

const FALLBACK = { featureName: '未分类', confidence: 0, reasoning: 'classification failed' };

export async function classifyFeature(
  cfg: ModelConfig,
  input: {
    problem: CaseProblem;
    meta?: CaseMeta;
    existingFeatures: Feature[];
  }
): Promise<{ featureName: string; matchedExistingId?: string; confidence: number; reasoning: string }> {
  const { problem, meta, existingFeatures } = input;

  const featureList = existingFeatures.length > 0
    ? existingFeatures.map(f => `- ${f.name} (id: ${f.id})`).join('\n')
    : '（暂无已有模块）';

  const userPrompt = `## 已有业务模块\n${featureList}\n\n## Bug 描述\n- 实际现象：${problem.actual}\n- 期望行为：${problem.expected}\n- 入口：${problem.entry}\n- 环境：${problem.environment}${meta?.module ? `\n- 模块提示：${meta.module}` : ''}`;

  try {
    let fullText = '';
    for await (const chunk of streamLlm(cfg, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 256,
      temperature: 0
    })) {
      if (chunk.type === 'text') fullText += chunk.text;
      if (chunk.type === 'done' || chunk.type === 'error') break;
    }

    const jsonStr = extractJson(fullText);
    if (!jsonStr) return FALLBACK;

    const parsed = JSON.parse(jsonStr);
    if (typeof parsed.featureName !== 'string' || !parsed.featureName) return FALLBACK;

    const matchedExistingId =
      typeof parsed.matchedExistingId === 'string' && parsed.matchedExistingId
        ? parsed.matchedExistingId
        : undefined;

    return {
      featureName: parsed.featureName,
      matchedExistingId,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : ''
    };
  } catch {
    return FALLBACK;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/server/feature-classifier.test.ts 2>&1 | tail -10
```

Expected: all feature-classifier tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && git add src/server/feature-classifier.ts tests/server/feature-classifier.test.ts && git commit -m "feat(features): add LLM-based feature classifier with fallback"
```

---

## Task 4: Similarity search

**Files:**
- Create: `src/server/similarity-search.ts`
- Create: `tests/server/similarity-search.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/tests/server/similarity-search.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/llm-client', () => ({
  streamLlm: vi.fn()
}));

import { findSimilarCases } from '@/server/similarity-search';
import { streamLlm } from '@/server/llm-client';
import type { Case } from '@/domain/types';

const cfg = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434',
  apiKey: 'test-key',
  model: 'gpt-4'
};

const problem = {
  actual: '审批提交后报错',
  expected: '成功跳转',
  entry: 'POST /approve',
  environment: 'prod'
};

function makeCase(id: string, actual: string): Case {
  return {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'done',
    problem: { actual, expected: '正常', entry: '/x', environment: 'test' },
    evidenceLevel: 'L0',
    pipeline: {
      currentStep: 'reproduce',
      steps: [],
      runIds: []
    },
    summary: {
      status: 'resolved',
      headline: `Case ${id} 标题`,
      rootCause: `根因 ${id}`,
      fixApproach: `修复 ${id}`,
      updatedAt: new Date().toISOString(),
      updatedBy: 'llm'
    }
  };
}

async function* makeStream(text: string) {
  yield { type: 'text' as const, text };
  yield { type: 'done' as const };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('findSimilarCases', () => {
  it('候选 ≤ topK 时直接全部返回 score=1', async () => {
    const candidates = [makeCase('aaa', '审批相关问题')];
    const result = await findSimilarCases(cfg, { problem, candidateCases: candidates, topK: 3 });
    expect(result).toHaveLength(1);
    expect(result[0].caseId).toBe('aaa');
    expect(result[0].score).toBe(1);
    // streamLlm should NOT be called
    expect(vi.mocked(streamLlm)).not.toHaveBeenCalled();
  });

  it('候选 > topK 时调用 LLM 返回 top-3', async () => {
    const candidates = ['a', 'b', 'c', 'd'].map(id => makeCase(id, `问题${id}`));
    const json = JSON.stringify([
      { caseId: 'a', score: 0.9, reason: '最相似' },
      { caseId: 'c', score: 0.7, reason: '比较相似' },
      { caseId: 'b', score: 0.5, reason: '一般' }
    ]);
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await findSimilarCases(cfg, { problem, candidateCases: candidates, topK: 3 });
    expect(result).toHaveLength(3);
    expect(result[0].caseId).toBe('a');
    expect(result[0].score).toBe(0.9);
  });

  it('LLM 返回 malformed → fallback 前 topK 条 score=0.5，不抛错', async () => {
    const candidates = ['a', 'b', 'c', 'd'].map(id => makeCase(id, `问题${id}`));
    vi.mocked(streamLlm).mockImplementation(() => makeStream('not json'));

    const result = await findSimilarCases(cfg, { problem, candidateCases: candidates, topK: 3 });
    expect(result).toHaveLength(3);
    expect(result.every(r => r.score === 0.5)).toBe(true);
  });

  it('topK 默认为 3', async () => {
    const candidates = ['a', 'b', 'c', 'd', 'e'].map(id => makeCase(id, `问题${id}`));
    const json = JSON.stringify([
      { caseId: 'a', score: 0.9, reason: 'r' },
      { caseId: 'b', score: 0.8, reason: 'r' },
      { caseId: 'c', score: 0.7, reason: 'r' }
    ]);
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await findSimilarCases(cfg, { problem, candidateCases: candidates });
    expect(result).toHaveLength(3);
  });

  it('LLM 报错 → fallback 前 topK，不抛错', async () => {
    const candidates = ['a', 'b', 'c', 'd'].map(id => makeCase(id, `问题${id}`));
    async function* errorStream() {
      yield { type: 'error' as const, message: 'timeout' };
    }
    vi.mocked(streamLlm).mockImplementation(() => errorStream());

    const result = await findSimilarCases(cfg, { problem, candidateCases: candidates, topK: 3 });
    expect(result).toHaveLength(3);
    expect(result.every(r => r.score === 0.5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/server/similarity-search.test.ts 2>&1 | tail -10
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create similarity-search.ts**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/server/similarity-search.ts`:

```ts
import type { ModelConfig } from '@/domain/model-config';
import type { CaseProblem, Case } from '@/domain/types';
import { streamLlm } from './llm-client';

const DEFAULT_TOP_K = 3;

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export async function findSimilarCases(
  cfg: ModelConfig,
  input: {
    problem: CaseProblem;
    candidateCases: Case[];
    topK?: number;
  }
): Promise<{ caseId: string; score: number; reason: string }[]> {
  const { problem, candidateCases, topK = DEFAULT_TOP_K } = input;

  if (candidateCases.length <= topK) {
    return candidateCases.map(c => ({ caseId: c.id, score: 1, reason: '候选数量不超过 topK' }));
  }

  const fallback = () =>
    candidateCases.slice(0, topK).map(c => ({ caseId: c.id, score: 0.5, reason: 'fallback' }));

  const candidatesText = candidateCases.map((c, i) =>
    `${i + 1}. id=${c.id} | 标题=${c.summary?.headline ?? '无'} | 根因=${c.summary?.rootCause ?? '无'} | 现象=${c.problem.actual.slice(0, 200)}`
  ).join('\n');

  const userPrompt = `## 当前问题\n- 现象：${problem.actual}\n- 期望：${problem.expected}\n\n## 候选已解决 Bug（共 ${candidateCases.length} 条）\n${candidatesText}\n\n请从候选中找出最相似的 ${topK} 条，输出 JSON 数组（不要包裹在 markdown 代码块里）：\n[{"caseId":"...","score":0.0到1.0,"reason":"一句话"}]`;

  try {
    let fullText = '';
    for await (const chunk of streamLlm(cfg, {
      systemPrompt: '你是 bug 相似度分析器，根据问题描述找出最相关的历史案例。',
      userPrompt,
      maxTokens: 512,
      temperature: 0
    })) {
      if (chunk.type === 'text') fullText += chunk.text;
      if (chunk.type === 'done' || chunk.type === 'error') break;
    }

    const jsonStr = extractJsonArray(fullText);
    if (!jsonStr) return fallback();

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return fallback();

    const results = parsed
      .filter((r): r is { caseId: string; score: number; reason: string } =>
        typeof r === 'object' && r !== null &&
        typeof r.caseId === 'string' &&
        typeof r.score === 'number'
      )
      .slice(0, topK);

    if (results.length === 0) return fallback();
    return results;
  } catch {
    return fallback();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/server/similarity-search.test.ts 2>&1 | tail -10
```

Expected: all similarity-search tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && git add src/server/similarity-search.ts tests/server/similarity-search.test.ts && git commit -m "feat(features): add similarity search with LLM scoring and fallback"
```

---

## Task 5: Lesson extractor

**Files:**
- Create: `src/server/lesson-extractor.ts`
- Create: `tests/server/lesson-extractor.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/tests/server/lesson-extractor.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/llm-client', () => ({
  streamLlm: vi.fn()
}));

import { extractLesson } from '@/server/lesson-extractor';
import { streamLlm } from '@/server/llm-client';
import type { Case } from '@/domain/types';

const cfg = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434',
  apiKey: 'test-key',
  model: 'gpt-4'
};

const messages = [
  {
    id: '11111111-0000-0000-0000-000000000001',
    role: 'user' as const,
    createdAt: new Date().toISOString(),
    content: '审批单提交没反应'
  },
  {
    id: '11111111-0000-0000-0000-000000000002',
    role: 'assistant' as const,
    createdAt: new Date().toISOString(),
    content: '问题是字典未加载导致 NPE，修复方法是初始化时预加载字典'
  }
];

const kase: Case = {
  id: '22222222-2222-2222-2222-222222222222',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: 'done',
  problem: {
    actual: '审批单提交没反应',
    expected: '跳转成功页',
    entry: 'POST /approve',
    environment: 'prod'
  },
  evidenceLevel: 'L0',
  pipeline: { currentStep: 'reproduce', steps: [], runIds: [] },
  summary: {
    status: 'resolved',
    headline: '字典未加载导致 NPE',
    rootCause: '字典未初始化',
    fixApproach: '预加载字典',
    updatedAt: new Date().toISOString(),
    updatedBy: 'llm'
  }
};

async function* makeStream(text: string) {
  yield { type: 'text' as const, text };
  yield { type: 'done' as const };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('extractLesson', () => {
  it('成功解析 JSON → 返回 Lesson', async () => {
    const json = JSON.stringify({
      symptomPattern: '字段显示为数字而非中文',
      rootCause: '字典未加载',
      fix: '初始化时调用 dictService.loadAll()'
    });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await extractLesson(cfg, { kase, messages });
    expect(result).not.toBeNull();
    expect(result!.symptomPattern).toBe('字段显示为数字而非中文');
    expect(result!.rootCause).toBe('字典未加载');
    expect(result!.fix).toBe('初始化时调用 dictService.loadAll()');
    expect(result!.extractedAt).toBeTruthy();
  });

  it('malformed JSON → 返回 null，不抛错', async () => {
    vi.mocked(streamLlm).mockImplementation(() => makeStream('not json'));

    const result = await extractLesson(cfg, { kase, messages });
    expect(result).toBeNull();
  });

  it('LLM 报错 → 返回 null，不抛错', async () => {
    async function* errorStream() {
      yield { type: 'error' as const, message: 'timeout' };
    }
    vi.mocked(streamLlm).mockImplementation(() => errorStream());

    const result = await extractLesson(cfg, { kase, messages });
    expect(result).toBeNull();
  });

  it('缺少必要字段 → 返回 null', async () => {
    const json = JSON.stringify({ symptomPattern: '有症状描述' });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await extractLesson(cfg, { kase, messages });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/server/lesson-extractor.test.ts 2>&1 | tail -10
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create lesson-extractor.ts**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/server/lesson-extractor.ts`:

```ts
import type { ModelConfig } from '@/domain/model-config';
import type { Case, Message, Lesson } from '@/domain/types';
import { streamLlm } from './llm-client';

const SYSTEM_PROMPT = `从这个已 resolved 的 bug 的对话中，抽取一份简短「教训」。

输出严格遵循以下 JSON（不要输出任何其他内容，不要包裹在 markdown 代码块里）：
{
  "symptomPattern": "一行症状描述，≤40字",
  "rootCause": "根因，≤40字",
  "fix": "修复方案摘要，≤40字"
}`;

function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export async function extractLesson(
  cfg: ModelConfig,
  input: { kase: Case; messages: Message[] }
): Promise<Lesson | null> {
  const { kase, messages } = input;

  const convoText = messages
    .filter(m => m.role !== 'system-summary')
    .slice(-10)
    .map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content.slice(0, 400)}`)
    .join('\n\n');

  const userPrompt = `## Bug 描述\n${kase.problem.actual}\n\n## 最终结论\n${kase.summary?.rootCause ?? '无'}\n修复：${kase.summary?.fixApproach ?? '无'}\n\n## 关键对话\n${convoText || '（无对话记录）'}`;

  try {
    let fullText = '';
    for await (const chunk of streamLlm(cfg, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 256,
      temperature: 0
    })) {
      if (chunk.type === 'text') fullText += chunk.text;
      if (chunk.type === 'done' || chunk.type === 'error') break;
    }

    const jsonStr = extractJson(fullText);
    if (!jsonStr) return null;

    const parsed = JSON.parse(jsonStr);
    if (
      typeof parsed.symptomPattern !== 'string' || !parsed.symptomPattern ||
      typeof parsed.rootCause !== 'string' || !parsed.rootCause ||
      typeof parsed.fix !== 'string' || !parsed.fix
    ) return null;

    return {
      symptomPattern: parsed.symptomPattern,
      rootCause: parsed.rootCause,
      fix: parsed.fix,
      extractedAt: new Date().toISOString()
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/server/lesson-extractor.test.ts 2>&1 | tail -10
```

Expected: all lesson-extractor tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && git add src/server/lesson-extractor.ts tests/server/lesson-extractor.test.ts && git commit -m "feat(features): add lesson extractor from resolved case conversations"
```

---

## Task 6: Knowledge builder

**Files:**
- Create: `src/server/knowledge-builder.ts`
- Create: `tests/server/knowledge-builder.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/tests/server/knowledge-builder.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createFeature, updateFeature } from '@/server/feature-store';
import { createCase, updateCase } from '@/server/case-store';
import { refreshFeatureKnowledge } from '@/server/knowledge-builder';
import type { Lesson } from '@/domain/types';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-kb-'));
  process.env.AI_DEBUG_HOME = tmp;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

async function makeResolvedCase(featureId: string, lesson: Lesson) {
  const c = await createCase({
    problem: { actual: lesson.symptomPattern, expected: '正常', entry: '/x', environment: 'test' }
  });
  return await updateCase({
    ...c,
    featureId,
    summary: {
      status: 'resolved',
      rootCause: lesson.rootCause,
      fixApproach: lesson.fix,
      updatedAt: new Date().toISOString(),
      updatedBy: 'llm'
    },
    lessons: lesson
  });
}

describe('refreshFeatureKnowledge', () => {
  it('无 resolved case → knowledge 为空列表', async () => {
    const f = await createFeature({ name: '审批' });
    const updated = await refreshFeatureKnowledge(f.id);
    expect(updated.knowledge?.commonRootCauses).toEqual([]);
    expect(updated.knowledge?.verifiedFixes).toEqual([]);
    expect(updated.knowledge?.sourceCaseCount).toBe(0);
  });

  it('聚合根因去重（按频率）', async () => {
    const f = await createFeature({ name: '审批' });

    const lesson1: Lesson = {
      symptomPattern: '字段显示数字',
      rootCause: '字典未加载',
      fix: '预加载字典',
      extractedAt: new Date().toISOString()
    };
    const lesson2: Lesson = {
      symptomPattern: '审批卡住',
      rootCause: '字典未加载',
      fix: '预加载字典',
      extractedAt: new Date().toISOString()
    };
    const lesson3: Lesson = {
      symptomPattern: '500 错误',
      rootCause: '连接池耗尽',
      fix: '增大连接池',
      extractedAt: new Date().toISOString()
    };

    await makeResolvedCase(f.id, lesson1);
    await makeResolvedCase(f.id, lesson2);
    await makeResolvedCase(f.id, lesson3);

    const updated = await refreshFeatureKnowledge(f.id);
    expect(updated.knowledge?.sourceCaseCount).toBe(3);
    // 字典未加载 出现两次，应排在前面
    expect(updated.knowledge?.commonRootCauses[0]).toBe('字典未加载');
    expect(updated.knowledge?.commonRootCauses).toContain('连接池耗尽');
  });

  it('verifiedFixes 按 (symptomPattern+rootCause) 唯一', async () => {
    const f = await createFeature({ name: '审批' });

    const lesson1: Lesson = {
      symptomPattern: '字段显示数字',
      rootCause: '字典未加载',
      fix: '预加载字典',
      extractedAt: new Date().toISOString()
    };
    const lesson2: Lesson = {
      symptomPattern: '字段显示数字',
      rootCause: '字典未加载',
      fix: '预加载字典',
      extractedAt: new Date().toISOString()
    };

    const c1 = await makeResolvedCase(f.id, lesson1);
    const c2 = await makeResolvedCase(f.id, lesson2);

    const updated = await refreshFeatureKnowledge(f.id);
    expect(updated.knowledge?.verifiedFixes).toHaveLength(1);
    expect(updated.knowledge?.verifiedFixes[0].sourceCaseIds).toContain(c1.id);
    expect(updated.knowledge?.verifiedFixes[0].sourceCaseIds).toContain(c2.id);
  });

  it('只聚合同一 featureId 的 case', async () => {
    const f1 = await createFeature({ name: '审批' });
    const f2 = await createFeature({ name: '订单' });

    const lesson: Lesson = {
      symptomPattern: '症状',
      rootCause: '根因 A',
      fix: '修复 A',
      extractedAt: new Date().toISOString()
    };
    await makeResolvedCase(f2.id, lesson); // belongs to f2, not f1

    const updated = await refreshFeatureKnowledge(f1.id);
    expect(updated.knowledge?.sourceCaseCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/server/knowledge-builder.test.ts 2>&1 | tail -10
```

Expected: FAIL (module not found / case-store updateCase doesn't accept featureId yet — but that's OK, it will after Task 1).

- [ ] **Step 3: Create knowledge-builder.ts**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/server/knowledge-builder.ts`:

```ts
import type { Feature, FeatureKnowledge, VerifiedFix } from '@/domain/types';
import { getFeature, updateFeature } from './feature-store';
import { listCases } from './case-store';

export async function refreshFeatureKnowledge(featureId: string): Promise<Feature> {
  const feature = await getFeature(featureId);
  const allCases = await listCases();

  const resolvedWithLessons = allCases.filter(
    c => c.featureId === featureId && c.lessons != null
  );

  if (resolvedWithLessons.length === 0) {
    const emptyKnowledge: FeatureKnowledge = {
      commonRootCauses: [],
      verifiedFixes: [],
      updatedAt: new Date().toISOString(),
      sourceCaseCount: 0
    };
    return await updateFeature({ ...feature, knowledge: emptyKnowledge });
  }

  // Aggregate root causes by frequency
  const rootCauseFreq = new Map<string, number>();
  for (const c of resolvedWithLessons) {
    const rc = c.lessons!.rootCause;
    rootCauseFreq.set(rc, (rootCauseFreq.get(rc) ?? 0) + 1);
  }
  const commonRootCauses = [...rootCauseFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([rc]) => rc);

  // Aggregate verifiedFixes by (symptomPattern, rootCause) key
  const fixMap = new Map<string, VerifiedFix>();
  for (const c of resolvedWithLessons) {
    const l = c.lessons!;
    const key = `${l.symptomPattern}||${l.rootCause}`;
    const existing = fixMap.get(key);
    if (existing) {
      existing.sourceCaseIds.push(c.id);
    } else {
      fixMap.set(key, {
        symptomPattern: l.symptomPattern,
        rootCause: l.rootCause,
        fix: l.fix,
        sourceCaseIds: [c.id]
      });
    }
  }

  const knowledge: FeatureKnowledge = {
    commonRootCauses,
    verifiedFixes: Array.from(fixMap.values()),
    updatedAt: new Date().toISOString(),
    sourceCaseCount: resolvedWithLessons.length
  };

  return await updateFeature({ ...feature, knowledge });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/server/knowledge-builder.test.ts 2>&1 | tail -10
```

Expected: all knowledge-builder tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && git add src/server/knowledge-builder.ts tests/server/knowledge-builder.test.ts && git commit -m "feat(features): add pure-aggregation knowledge builder"
```

---

## Task 7: Extend prompt-builder with feature knowledge injection

**Files:**
- Modify: `src/server/prompt-builder.ts`
- Modify: `tests/server/prompt-builder.test.ts` (extend)

- [ ] **Step 1: Add tests for new injection sections**

Append to the end of `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/tests/server/prompt-builder.test.ts`:

```ts
import type { FeatureKnowledge } from '@/domain/types';

describe('buildConversationPrompt — feature knowledge injection', () => {
  it('featureKnowledge 存在时注入「已知模式」区块', () => {
    const featureKnowledge: FeatureKnowledge = {
      commonRootCauses: ['字典未加载', '连接池耗尽'],
      verifiedFixes: [
        {
          symptomPattern: '字段显示数字',
          rootCause: '字典未加载',
          fix: '预加载字典',
          sourceCaseIds: ['aaa']
        }
      ],
      updatedAt: new Date().toISOString(),
      sourceCaseCount: 2
    };
    const opts = buildConversationPrompt({
      problem: makeProblem(),
      evidences: [],
      messages: [],
      featureKnowledge
    });
    expect(opts.userPrompt).toContain('该功能的已知模式');
    expect(opts.userPrompt).toContain('字典未加载');
    expect(opts.userPrompt).toContain('预加载字典');
  });

  it('relatedCases 存在时注入「相似历史 bug」区块', () => {
    const relatedCases = [
      { headline: '审批 NPE', rootCause: '字典未加载', fix: '预加载字典' }
    ];
    const opts = buildConversationPrompt({
      problem: makeProblem(),
      evidences: [],
      messages: [],
      relatedCases
    });
    expect(opts.userPrompt).toContain('相似历史 bug');
    expect(opts.userPrompt).toContain('审批 NPE');
  });

  it('注入内容超过 4000 字时截断', () => {
    const featureKnowledge: FeatureKnowledge = {
      commonRootCauses: Array.from({ length: 50 }, (_, i) => `根因${i}：${'x'.repeat(100)}`),
      verifiedFixes: Array.from({ length: 20 }, (_, i) => ({
        symptomPattern: `症状${i}：${'y'.repeat(100)}`,
        rootCause: `根因${i}`,
        fix: `修复${i}`,
        sourceCaseIds: []
      })),
      updatedAt: new Date().toISOString(),
      sourceCaseCount: 70
    };
    const opts = buildConversationPrompt({
      problem: makeProblem(),
      evidences: [],
      messages: [],
      featureKnowledge
    });
    // Total should stay well-bounded
    expect(opts.userPrompt.length + opts.systemPrompt.length).toBeLessThan(50_000);
  });

  it('featureKnowledge 未提供时不出现「已知模式」区块', () => {
    const opts = buildConversationPrompt({
      problem: makeProblem(),
      evidences: [],
      messages: []
    });
    expect(opts.userPrompt).not.toContain('该功能的已知模式');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/server/prompt-builder.test.ts 2>&1 | tail -15
```

Expected: new tests fail (TypeScript error or assertion failure).

- [ ] **Step 3: Extend buildConversationPrompt in prompt-builder.ts**

In `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/server/prompt-builder.ts`:

1. Add import at top:
```ts
import type { FeatureKnowledge } from '@/domain/types';
```

2. Replace the `buildConversationPrompt` signature to add the two new optional params:
```ts
export function buildConversationPrompt(input: {
  problem: CaseProblem;
  meta?: CaseMeta;
  evidences: Evidence[];
  code?: CodeReadResult;
  messages: Message[];
  currentSummary?: BugSummary;
  featureKnowledge?: FeatureKnowledge;
  relatedCases?: { headline?: string; rootCause?: string; fix?: string }[];
}): LlmCallOptions {
```

3. Destructure the two new fields:
```ts
  const { problem, meta, evidences, code, messages, currentSummary, featureKnowledge, relatedCases } = input;
```

4. Build the injection sections before `summarySection`. Add this helper function (before `buildConversationPrompt`):

```ts
function buildFeatureInjection(
  featureKnowledge?: FeatureKnowledge,
  relatedCases?: { headline?: string; rootCause?: string; fix?: string }[]
): string {
  const MAX_INJECTION = 4000;
  const parts: string[] = [];

  if (featureKnowledge && (featureKnowledge.commonRootCauses.length > 0 || featureKnowledge.verifiedFixes.length > 0)) {
    const causesText = featureKnowledge.commonRootCauses.map(c => `- ${c}`).join('\n');
    const fixesText = featureKnowledge.verifiedFixes
      .map(v => `- 症状：${v.symptomPattern} → 根因：${v.rootCause} → 修复：${v.fix}`)
      .join('\n');
    parts.push(`## 该功能的已知模式\n常见根因：\n${causesText}\n\n已验证的修复模式：\n${fixesText}\n\n（这些来自本模块的历史 bug。如果新 bug 匹配某个模式，直接引用；否则说明为什么不适用。）`);
  }

  if (relatedCases && relatedCases.length > 0) {
    const lines = relatedCases
      .filter(r => r.headline)
      .map(r => `- ${r.headline}：${r.rootCause ?? '未知根因'} → ${r.fix ?? '未知修复'}`)
      .join('\n');
    if (lines) parts.push(`## 相似历史 bug（供参考）\n${lines}`);
  }

  const combined = parts.join('\n\n');
  if (combined.length > MAX_INJECTION) {
    return combined.slice(0, MAX_INJECTION) + '\n\n（已截断）';
  }
  return combined;
}
```

5. Inside `buildConversationPrompt`, after `const { ... } = input;`, build the injection string and account for it in the fixed chars budget:

```ts
  const featureInjection = buildFeatureInjection(featureKnowledge, relatedCases);
```

6. Update the `parts` array assembly to insert `featureInjection` before `summarySection` (when non-empty):

```ts
  const parts = featureInjection ? [featureInjection, summarySection, problemSection, evidenceSection, codePart] : [summarySection, problemSection, evidenceSection, codePart];
  if (historySection) parts.push(historySection);
  parts.push(taskPart);
```

Also update the `fixedChars` calculation to include `featureInjection.length`:

```ts
  const fixedChars =
    CONVERSATION_SYSTEM_PROMPT.length +
    featureInjection.length +
    summarySection.length +
    problemSection.length +
    codePart.length +
    taskPart.length +
    200;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/server/prompt-builder.test.ts 2>&1 | tail -15
```

Expected: all prompt-builder tests pass (old + new).

- [ ] **Step 5: Commit**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && git add src/server/prompt-builder.ts tests/server/prompt-builder.test.ts && git commit -m "feat(features): inject feature knowledge and related cases into conversation prompt"
```

---

## Task 8: Extend POST /cases — classification + similarity

**Files:**
- Modify: `src/app/api/cases/route.ts`
- Modify: `src/server/index-store.ts`
- Create: `tests/api/cases-feature.test.ts`

- [ ] **Step 1: Update index-store.ts to include featureId/featureName**

In `toEntry()` in `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/server/index-store.ts`, extend the returned object:

```ts
function toEntry(c: Case): CaseIndexEntry {
  const firstLine = c.problem.actual.split('\n')[0]?.trim() ?? '(untitled)';
  return {
    id: c.id,
    title: firstLine || '(untitled)',
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    repoPath: c.meta?.repoPath,
    status: c.status,
    bugStatus: c.summary?.status,
    headline: c.summary?.headline,
    featureId: c.featureId,
    featureName: undefined   // caller must enrich if needed
  };
}
```

Note: `featureName` cannot be set from Case alone. The POST route will upsert with feature name separately, or we pass the feature name as a second argument. A simpler approach: add an optional `featureName` param to `upsertIndexEntry`. Update the function signature:

```ts
export async function upsertIndexEntry(c: Case, featureName?: string): Promise<void> {
  const cur = await readIndex();
  const entry = { ...toEntry(c), featureName };
  const next = cur.filter(e => e.id !== c.id);
  next.push(entry);
  next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await writeIndex(next);
}
```

And remove the `featureName: undefined` from `toEntry` since it's now set externally:

```ts
function toEntry(c: Case): CaseIndexEntry {
  const firstLine = c.problem.actual.split('\n')[0]?.trim() ?? '(untitled)';
  return {
    id: c.id,
    title: firstLine || '(untitled)',
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    repoPath: c.meta?.repoPath,
    status: c.status,
    bugStatus: c.summary?.status,
    headline: c.summary?.headline,
    featureId: c.featureId
  };
}
```

- [ ] **Step 2: Write failing tests for POST /cases with classification**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/tests/api/cases-feature.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { writeSavedConfig } from '@/server/config-store';

vi.mock('@/server/feature-classifier', () => ({
  classifyFeature: vi.fn()
}));
vi.mock('@/server/similarity-search', () => ({
  findSimilarCases: vi.fn()
}));

import { POST as postCase } from '@/app/api/cases/route';
import { classifyFeature } from '@/server/feature-classifier';
import { findSimilarCases } from '@/server/similarity-search';

const cfg = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434',
  apiKey: 'test-key',
  model: 'gpt-4'
};

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-cases-feat-'));
  process.env.AI_DEBUG_HOME = tmp;
  vi.resetAllMocks();
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

function jsonReq(body: unknown): NextRequest {
  return new NextRequest('http://x/api/cases', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

const validInput = {
  problem: { actual: '审批提交报错', expected: '跳转成功页', entry: 'POST /approve', environment: 'prod' }
};

describe('POST /api/cases — feature classification', () => {
  it('无 config 时仍创建 case，featureId 为 undefined', async () => {
    // No config written
    const res = await postCase(jsonReq(validInput));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.case).toBeDefined();
    expect(body.case.featureId).toBeUndefined();
    expect(body.warnings).toBeDefined();
  });

  it('有 config + 分类成功 → case.featureId 设置为新创建的 feature', async () => {
    await writeSavedConfig(cfg);
    vi.mocked(classifyFeature).mockResolvedValue({
      featureName: '审批',
      matchedExistingId: undefined,
      confidence: 0.9,
      reasoning: '明显审批'
    });
    vi.mocked(findSimilarCases).mockResolvedValue([]);

    const res = await postCase(jsonReq(validInput));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.case.featureId).toBeDefined();
    expect(body.feature?.name).toBe('审批');
    expect(body.relatedCases).toEqual([]);
  });

  it('分类器返回已有模块 id → 使用该 id', async () => {
    await writeSavedConfig(cfg);
    // Pre-create a feature
    const { createFeature } = await import('@/server/feature-store');
    const f = await createFeature({ name: '审批' });

    vi.mocked(classifyFeature).mockResolvedValue({
      featureName: '审批',
      matchedExistingId: f.id,
      confidence: 0.95,
      reasoning: 'match'
    });
    vi.mocked(findSimilarCases).mockResolvedValue([]);

    const res = await postCase(jsonReq(validInput));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.case.featureId).toBe(f.id);
  });

  it('分类器抛错 → case 仍然创建，warnings 非空', async () => {
    await writeSavedConfig(cfg);
    vi.mocked(classifyFeature).mockRejectedValue(new Error('LLM unavailable'));

    const res = await postCase(jsonReq(validInput));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.case).toBeDefined();
    expect(body.warnings).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/api/cases-feature.test.ts 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 4: Rewrite POST /cases route to include classification flow**

Replace the content of `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/app/api/cases/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createCase, listCases, getCase, updateCase } from '@/server/case-store';
import { upsertIndexEntry, readIndex } from '@/server/index-store';
import { createCaseInputSchema } from '@/domain/schemas';
import { readSavedConfig } from '@/server/config-store';
import {
  createFeature,
  findFeatureByName,
  getFeature,
  incrementFeatureStats
} from '@/server/feature-store';
import { classifyFeature } from '@/server/feature-classifier';
import { findSimilarCases } from '@/server/similarity-search';
import type { Feature } from '@/domain/types';

export async function GET() {
  await listCases();
  const entries = await readIndex();
  return NextResponse.json({ cases: entries });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = createCaseInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const warnings: string[] = [];
  let feature: Feature | undefined;

  // Create the case first
  let c = await createCase(parsed.data);

  // Attempt classification if config is available
  const cfg = await readSavedConfig();
  if (!cfg) {
    warnings.push('model not configured — skipped feature classification');
  } else {
    try {
      const existingFeatures = await (await import('@/server/feature-store').then(m => m.listFeatures))();
      const classification = await classifyFeature(cfg, {
        problem: parsed.data.problem,
        meta: parsed.data.meta,
        existingFeatures
      });

      // Resolve or create the feature
      let featureId: string;
      if (classification.matchedExistingId) {
        featureId = classification.matchedExistingId;
        feature = await getFeature(featureId).catch(() => undefined);
        if (!feature) {
          feature = await createFeature({ name: classification.featureName });
          featureId = feature.id;
        }
      } else {
        const existing = await findFeatureByName(classification.featureName);
        if (existing) {
          featureId = existing.id;
          feature = existing;
        } else {
          feature = await createFeature({ name: classification.featureName });
          featureId = feature.id;
        }
      }

      // Increment bug count
      await incrementFeatureStats(featureId, { bug: 1 });
      feature = await getFeature(featureId);

      // Find similar resolved cases in the same feature
      const allCases = await listCases();
      const candidateCases = allCases.filter(
        cc => cc.featureId === featureId && cc.summary?.status === 'resolved'
      );

      let relatedCaseIds: string[] = [];
      if (candidateCases.length > 0) {
        const similar = await findSimilarCases(cfg, {
          problem: parsed.data.problem,
          candidateCases,
          topK: 3
        });
        relatedCaseIds = similar.map(s => s.caseId);
      }

      // Update the case with featureId + relatedCaseIds
      c = await updateCase({ ...c, featureId, relatedCaseIds: relatedCaseIds.length > 0 ? relatedCaseIds : undefined });
      await upsertIndexEntry(c, feature.name);

      // Build relatedCases response
      const relatedCases = await Promise.all(
        relatedCaseIds.map(async (id) => {
          try {
            const rc = await getCase(id);
            return { id, headline: rc.summary?.headline, rootCause: rc.summary?.rootCause };
          } catch {
            return { id };
          }
        })
      );

      return NextResponse.json({ case: c, feature, relatedCases, warnings }, { status: 201 });
    } catch (e) {
      warnings.push(`classification failed: ${(e as Error).message}`);
    }
  }

  await upsertIndexEntry(c);
  return NextResponse.json({ case: c, feature: undefined, relatedCases: [], warnings }, { status: 201 });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/api/cases-feature.test.ts 2>&1 | tail -15
```

Expected: all cases-feature tests pass.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test 2>&1 | tail -10
```

Expected: all prior 161 tests still pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && git add src/app/api/cases/route.ts src/server/index-store.ts tests/api/cases-feature.test.ts && git commit -m "feat(features): classify feature and find similar cases on case creation"
```

---

## Task 9: Extend PATCH /status — lesson extraction + knowledge refresh

**Files:**
- Modify: `src/app/api/cases/[id]/status/route.ts`
- Create: `tests/api/status-feature.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/tests/api/status-feature.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { createCase, updateCase, getCase } from '@/server/case-store';
import { createFeature, getFeature } from '@/server/feature-store';
import { writeSavedConfig } from '@/server/config-store';

vi.mock('@/server/lesson-extractor', () => ({
  extractLesson: vi.fn()
}));
vi.mock('@/server/knowledge-builder', () => ({
  refreshFeatureKnowledge: vi.fn()
}));

import { PATCH } from '@/app/api/cases/[id]/status/route';
import { extractLesson } from '@/server/lesson-extractor';
import { refreshFeatureKnowledge } from '@/server/knowledge-builder';

const cfg = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434',
  apiKey: 'test-key',
  model: 'gpt-4'
};

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-status-feat-'));
  process.env.AI_DEBUG_HOME = tmp;
  vi.resetAllMocks();
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

function patchReq(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://x/api/cases/${id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('PATCH /status — feature integration', () => {
  it('resolved 转换 → 调用 extractLesson + refreshFeatureKnowledge', async () => {
    await writeSavedConfig(cfg);
    const feature = await createFeature({ name: '审批' });
    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });
    await updateCase({ ...kase, featureId: feature.id });

    vi.mocked(extractLesson).mockResolvedValue({
      symptomPattern: '审批报错',
      rootCause: '字典未加载',
      fix: '预加载字典',
      extractedAt: new Date().toISOString()
    });
    vi.mocked(refreshFeatureKnowledge).mockResolvedValue({ ...feature, resolvedCount: 1 });

    const res = await PATCH(
      patchReq(kase.id, { status: 'resolved' }),
      { params: Promise.resolve({ id: kase.id }) }
    );
    expect(res.status).toBe(200);

    // Give fire-and-forget a tick to complete
    await new Promise(r => setTimeout(r, 50));
    expect(vi.mocked(extractLesson)).toHaveBeenCalled();
    expect(vi.mocked(refreshFeatureKnowledge)).toHaveBeenCalledWith(feature.id, cfg);
  });

  it('resolved 转换 → feature.resolvedCount 递增', async () => {
    await writeSavedConfig(cfg);
    const feature = await createFeature({ name: '审批' });
    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });
    await updateCase({ ...kase, featureId: feature.id });

    vi.mocked(extractLesson).mockResolvedValue(null);
    vi.mocked(refreshFeatureKnowledge).mockResolvedValue({ ...feature, resolvedCount: 1 });

    await PATCH(
      patchReq(kase.id, { status: 'resolved' }),
      { params: Promise.resolve({ id: kase.id }) }
    );
    await new Promise(r => setTimeout(r, 50));

    // incrementFeatureStats should have been called (resolvedCount goes up)
    const updatedFeature = await getFeature(feature.id);
    expect(updatedFeature.resolvedCount).toBe(1);
  });

  it('无 featureId 的 case resolved → 不调用 refreshFeatureKnowledge', async () => {
    await writeSavedConfig(cfg);
    const kase = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });

    vi.mocked(extractLesson).mockResolvedValue(null);

    await PATCH(
      patchReq(kase.id, { status: 'resolved' }),
      { params: Promise.resolve({ id: kase.id }) }
    );
    await new Promise(r => setTimeout(r, 50));

    expect(vi.mocked(refreshFeatureKnowledge)).not.toHaveBeenCalled();
  });

  it('extractLesson 抛错 → 状态仍然正确更新', async () => {
    await writeSavedConfig(cfg);
    const feature = await createFeature({ name: '审批' });
    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });
    await updateCase({ ...kase, featureId: feature.id });

    vi.mocked(extractLesson).mockRejectedValue(new Error('LLM failure'));
    vi.mocked(refreshFeatureKnowledge).mockResolvedValue(feature);

    const res = await PATCH(
      patchReq(kase.id, { status: 'resolved' }),
      { params: Promise.resolve({ id: kase.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.status).toBe('resolved');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/api/status-feature.test.ts 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 3: Extend the status route**

Replace the content of `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/app/api/cases/[id]/status/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCase, updateCase, updateCaseStatus, updateSummary } from '@/server/case-store';
import { bugStatusSchema } from '@/domain/schemas';
import { readSavedConfig } from '@/server/config-store';
import { incrementFeatureStats } from '@/server/feature-store';
import { extractLesson } from '@/server/lesson-extractor';
import { refreshFeatureKnowledge } from '@/server/knowledge-builder';

export const dynamic = 'force-dynamic';

const patchBodySchema = z.object({
  status: bugStatusSchema,
  verificationNotes: z.string().optional()
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const raw = await req.json().catch(() => null);
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) return new Response('bad request', { status: 400 });

  const { id } = await params;
  const kase = await getCase(id).catch(() => null);
  if (!kase) return new Response('case not found', { status: 404 });

  const prevStatus = kase.summary?.status;
  await updateCaseStatus(id, parsed.data.status);

  if (parsed.data.verificationNotes !== undefined) {
    const fresh = await getCase(id);
    if (fresh.summary) {
      await updateSummary(id, {
        ...fresh.summary,
        verificationNotes: parsed.data.verificationNotes,
        updatedAt: new Date().toISOString(),
        updatedBy: 'user'
      });
    }
  }

  const updated = await getCase(id);

  // Fire-and-forget: handle feature side effects
  if (kase.featureId) {
    const featureId = kase.featureId;
    const isTransitionToResolved = parsed.data.status === 'resolved' && prevStatus !== 'resolved';
    const isTransitionFromResolved = prevStatus === 'resolved' && parsed.data.status !== 'resolved';

    void (async () => {
      try {
        if (isTransitionToResolved) {
          await incrementFeatureStats(featureId, { resolved: 1 });
          const cfg = await readSavedConfig();
          if (cfg) {
            const freshCase = await getCase(id);
            const lesson = await extractLesson(cfg, {
              kase: freshCase,
              messages: freshCase.messages ?? []
            }).catch(() => null);
            if (lesson) {
              await updateCase({ ...freshCase, lessons: lesson });
            }
            await refreshFeatureKnowledge(featureId, cfg);
          }
        } else if (isTransitionFromResolved) {
          await incrementFeatureStats(featureId, { resolved: -1 });
          const cfg = await readSavedConfig();
          if (cfg) {
            await refreshFeatureKnowledge(featureId, cfg);
          }
        }
      } catch {
        // non-fatal — feature side effects never block status update
      }
    })();
  }

  return Response.json({ summary: updated.summary });
}
```

Note: `refreshFeatureKnowledge` needs to accept an optional `cfg` parameter. Update `knowledge-builder.ts` to accept and ignore it for now (Phase 4A uses pure aggregation):

In `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/server/knowledge-builder.ts`, change the function signature:

```ts
export async function refreshFeatureKnowledge(featureId: string, cfg?: unknown): Promise<Feature> {
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/api/status-feature.test.ts 2>&1 | tail -15
```

Expected: all status-feature tests pass.

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test 2>&1 | tail -10
```

Expected: all tests pass (original 161 + new tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && git add src/app/api/cases/\[id\]/status/route.ts src/server/knowledge-builder.ts tests/api/status-feature.test.ts && git commit -m "feat(features): extract lesson and refresh knowledge on case resolved transition"
```

---

## Task 10: Extend messages route with feature context

**Files:**
- Modify: `src/app/api/cases/[id]/messages/route.ts`

- [ ] **Step 1: Extend the messages route**

In `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/app/api/cases/[id]/messages/route.ts`, add these imports after the existing ones:

```ts
import { getFeature } from '@/server/feature-store';
import { getCase as getCaseById } from '@/server/case-store';
```

Note: `getCase` is already imported as `getCase`. The duplicate import is only needed if we reference a renamed version — use the existing `getCase` import.

Inside the `POST` handler, after `const freshCase = await getCase(id);` (before calling `buildConversationPrompt`), load feature context:

```ts
  // Load feature context for prompt enrichment
  let featureKnowledge: import('@/domain/types').FeatureKnowledge | undefined;
  let relatedCasesForPrompt: { headline?: string; rootCause?: string; fix?: string }[] = [];
  let featureName: string | undefined;

  if (freshCase.featureId) {
    try {
      const feat = await getFeature(freshCase.featureId);
      featureKnowledge = feat.knowledge;
      featureName = feat.name;
    } catch {
      // non-fatal
    }
  }

  if (freshCase.relatedCaseIds && freshCase.relatedCaseIds.length > 0) {
    for (const rcId of freshCase.relatedCaseIds) {
      try {
        const rc = await getCase(rcId);
        relatedCasesForPrompt.push({
          headline: rc.summary?.headline,
          rootCause: rc.summary?.rootCause,
          fix: rc.summary?.fixApproach
        });
      } catch {
        // skip missing
      }
    }
  }
```

Pass the new fields into `buildConversationPrompt`:

```ts
  const opts = buildConversationPrompt({
    problem: freshCase.problem,
    meta: freshCase.meta,
    evidences,
    code,
    messages: freshCase.messages ?? [],
    currentSummary: freshCase.summary,
    featureKnowledge,
    relatedCases: relatedCasesForPrompt
  });
```

Emit the `context` SSE chunk BEFORE the `meta` chunk:

```ts
        send({
          type: 'context',
          featureName,
          featureKnowledgeSize: featureKnowledge
            ? featureKnowledge.commonRootCauses.length + featureKnowledge.verifiedFixes.length
            : 0,
          relatedCases: relatedCasesForPrompt.map(r => r.headline).filter(Boolean)
        });

        send({
          type: 'meta',
          // ... existing meta fields
        });
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run typecheck 2>&1 | tail -15
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && git add src/app/api/cases/\[id\]/messages/route.ts && git commit -m "feat(features): inject feature knowledge into conversation context; emit context SSE chunk"
```

---

## Task 11: New Feature API routes

**Files:**
- Create: `src/app/api/features/route.ts`
- Create: `src/app/api/features/[id]/route.ts`
- Create: `src/app/api/features/[id]/refresh-knowledge/route.ts`
- Create: `src/app/api/cases/[id]/feature/route.ts`
- Create: `tests/api/features.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/tests/api/features.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { createFeature, getFeature } from '@/server/feature-store';
import { createCase, updateCase } from '@/server/case-store';

vi.mock('@/server/knowledge-builder', () => ({
  refreshFeatureKnowledge: vi.fn().mockImplementation(async (id: string) => {
    const { getFeature: gf } = await import('@/server/feature-store');
    return gf(id);
  })
}));

import { GET as listFeatures } from '@/app/api/features/route';
import {
  GET as getFeatureRoute,
  PATCH as patchFeatureRoute
} from '@/app/api/features/[id]/route';
import { POST as refreshKnowledge } from '@/app/api/features/[id]/refresh-knowledge/route';
import { PATCH as patchCaseFeature } from '@/app/api/cases/[id]/feature/route';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-feat-api-'));
  process.env.AI_DEBUG_HOME = tmp;
  vi.clearAllMocks();
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

function emptyReq(): NextRequest {
  return new NextRequest('http://x/api/features');
}

function jsonReq(method: string, url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('GET /api/features', () => {
  it('空列表', async () => {
    const res = await listFeatures();
    const body = await res.json();
    expect(body.features).toEqual([]);
  });

  it('返回所有 feature', async () => {
    await createFeature({ name: '审批' });
    await createFeature({ name: '订单' });
    const res = await listFeatures();
    const body = await res.json();
    expect(body.features).toHaveLength(2);
  });
});

describe('GET /api/features/:id', () => {
  it('返回 feature + resolvedCases', async () => {
    const f = await createFeature({ name: '审批' });
    const c = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });
    await updateCase({
      ...c,
      featureId: f.id,
      summary: {
        status: 'resolved',
        headline: 'Fixed',
        updatedAt: new Date().toISOString(),
        updatedBy: 'llm'
      }
    });

    const res = await getFeatureRoute(emptyReq(), { params: Promise.resolve({ id: f.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feature.name).toBe('审批');
    expect(body.resolvedCases).toHaveLength(1);
  });

  it('不存在 → 404', async () => {
    const res = await getFeatureRoute(
      emptyReq(),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) }
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/features/:id', () => {
  it('重命名成功', async () => {
    const f = await createFeature({ name: '审批' });
    const res = await patchFeatureRoute(
      jsonReq('PATCH', `http://x/api/features/${f.id}`, { name: '审批流' }),
      { params: Promise.resolve({ id: f.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feature.name).toBe('审批流');
  });

  it('更新 aliases', async () => {
    const f = await createFeature({ name: '审批' });
    const res = await patchFeatureRoute(
      jsonReq('PATCH', `http://x/api/features/${f.id}`, { aliases: ['approval'] }),
      { params: Promise.resolve({ id: f.id }) }
    );
    const body = await res.json();
    expect(body.feature.aliases).toEqual(['approval']);
  });

  it('空 body → 保持不变', async () => {
    const f = await createFeature({ name: '审批' });
    const res = await patchFeatureRoute(
      jsonReq('PATCH', `http://x/api/features/${f.id}`, {}),
      { params: Promise.resolve({ id: f.id }) }
    );
    const body = await res.json();
    expect(body.feature.name).toBe('审批');
  });
});

describe('POST /api/features/:id/refresh-knowledge', () => {
  it('调用 refreshFeatureKnowledge 并返回 feature', async () => {
    const f = await createFeature({ name: '审批' });
    const res = await refreshKnowledge(
      emptyReq(),
      { params: Promise.resolve({ id: f.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feature.id).toBe(f.id);
  });
});

describe('PATCH /api/cases/:id/feature', () => {
  it('成功改变 case 归属 feature', async () => {
    const f = await createFeature({ name: '订单' });
    const c = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });

    const res = await patchCaseFeature(
      jsonReq('PATCH', `http://x/api/cases/${c.id}/feature`, { featureId: f.id }),
      { params: Promise.resolve({ id: c.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.case.featureId).toBe(f.id);
  });

  it('featureId 不存在 → 404', async () => {
    const c = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });
    const res = await patchCaseFeature(
      jsonReq('PATCH', `http://x/api/cases/${c.id}/feature`, {
        featureId: '00000000-0000-0000-0000-000000000000'
      }),
      { params: Promise.resolve({ id: c.id }) }
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/api/features.test.ts 2>&1 | tail -15
```

Expected: FAIL (routes not found).

- [ ] **Step 3: Create GET /api/features**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/app/api/features/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { listFeatures } from '@/server/feature-store';

export async function GET() {
  const features = await listFeatures();
  return NextResponse.json({ features });
}
```

- [ ] **Step 4: Create GET + PATCH /api/features/:id**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/app/api/features/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFeature, updateFeature } from '@/server/feature-store';
import { listCases } from '@/server/case-store';

const patchBodySchema = z.object({
  name: z.string().min(1).optional(),
  aliases: z.array(z.string()).optional()
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const feature = await getFeature(id).catch(() => null);
  if (!feature) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const allCases = await listCases();
  const resolvedCases = allCases
    .filter(c => c.featureId === id && c.summary?.status === 'resolved')
    .map(c => ({ id: c.id, headline: c.summary?.headline }));

  return NextResponse.json({ feature, resolvedCases });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const feature = await getFeature(id).catch(() => null);
  if (!feature) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const raw = await req.json().catch(() => ({}));
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const updated = await updateFeature({
    ...feature,
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.aliases !== undefined ? { aliases: parsed.data.aliases } : {})
  });

  return NextResponse.json({ feature: updated });
}
```

- [ ] **Step 5: Create POST /api/features/:id/refresh-knowledge**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/app/api/features/[id]/refresh-knowledge/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getFeature } from '@/server/feature-store';
import { refreshFeatureKnowledge } from '@/server/knowledge-builder';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await getFeature(id).catch(() => null);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const feature = await refreshFeatureKnowledge(id);
  return NextResponse.json({ feature });
}
```

- [ ] **Step 6: Create PATCH /api/cases/:id/feature**

Create `/Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant/src/app/api/cases/[id]/feature/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCase, updateCase } from '@/server/case-store';
import { getFeature } from '@/server/feature-store';
import { upsertIndexEntry } from '@/server/index-store';

const patchBodySchema = z.object({
  featureId: z.string().uuid()
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const kase = await getCase(id).catch(() => null);
  if (!kase) return NextResponse.json({ error: 'case not found' }, { status: 404 });

  const raw = await req.json().catch(() => null);
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const feature = await getFeature(parsed.data.featureId).catch(() => null);
  if (!feature) return NextResponse.json({ error: 'feature not found' }, { status: 404 });

  const updated = await updateCase({ ...kase, featureId: feature.id });
  await upsertIndexEntry(updated, feature.name);

  return NextResponse.json({ case: updated });
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test -- tests/api/features.test.ts 2>&1 | tail -15
```

Expected: all features API tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && git add src/app/api/features src/app/api/cases/\[id\]/feature tests/api/features.test.ts && git commit -m "feat(features): add feature CRUD API routes and manual case reassignment"
```

---

## Task 12: Final verification, typecheck, and build

**Files:** none new

- [ ] **Step 1: Run full test suite and verify count > 161**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run test 2>&1 | tail -15
```

Expected: all tests pass, `Tests  N passed` where N > 161.

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run typecheck 2>&1
```

Expected: no errors.

- [ ] **Step 3: Run build**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && npm run build 2>&1 | tail -20
```

Expected: successful build.

- [ ] **Step 4: Stage and commit all remaining changes**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && git add src tests && git commit -m "feat(features): auto-classify bugs, similarity search, lessons + knowledge card"
```

- [ ] **Step 5: Record commit SHA**

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant && git log --oneline -1
```

---

## Summary of New Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/features` | List all features |
| GET | `/api/features/:id` | Feature detail + resolved cases |
| PATCH | `/api/features/:id` | Rename / edit aliases |
| POST | `/api/features/:id/refresh-knowledge` | Force knowledge recompute |
| PATCH | `/api/cases/:id/feature` | Manually reassign case to feature |

## Summary of New/Modified Server Modules

| File | Purpose |
|------|---------|
| `src/server/feature-store.ts` | CRUD + index for Feature entities |
| `src/server/feature-classifier.ts` | LLM classification → featureName + matchedId |
| `src/server/similarity-search.ts` | LLM top-K similarity across resolved cases |
| `src/server/lesson-extractor.ts` | LLM extraction of Lesson from resolved case |
| `src/server/knowledge-builder.ts` | Pure aggregation of lessons → FeatureKnowledge |

## Backward Compatibility Guarantees

- Old `case.json` without `featureId` / `lessons` / `relatedCaseIds` → Zod schemas have all fields `.optional()`, load fine
- Old features index missing → `listFeatures()` returns `[]`
- `CaseIndexEntry` new fields are optional → old index entries parse without `featureId`/`featureName`
