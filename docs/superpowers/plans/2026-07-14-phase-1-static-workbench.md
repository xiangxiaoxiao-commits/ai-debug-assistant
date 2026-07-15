# Phase 1: 静态工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本地 8787 端口跑起来一个 Next.js 应用，能创建 Case、添加 5 类证据、看到证据级别与 Pipeline 骨架、刷新页面不丢，全部数据以 JSON 落盘。

**Architecture:** Next.js 15 App Router 单进程全栈。前端 React 18 + Tailwind + shadcn/ui 风格组件。后端 Route Handlers + 本地文件系统持久化（`~/.ai-debug-assistant/`）。前后端共享 Zod schema 与 TypeScript 类型。Phase 1 不接 LLM、不做规则匹配、不并发 Pipeline —— Pipeline 各步固定停在 `waiting`。

**Tech Stack:**
- Next.js 15.x + React 18 + TypeScript 5
- Zod 3 (schema validation, shared FE/BE)
- Tailwind CSS 3 + `class-variance-authority`
- Vitest 1.x + `@testing-library/react` + `msw` (for API testing)
- `uuid` v9 (case/evidence ids)
- `fs/promises` (原子写盘，无 SQLite 依赖)

**参考 Spec：** `../specs/2026-07-14-ai-debug-assistant-design.md`

---

## 目录结构（Phase 1 结束状态）

```
ai-debug-assistant/
├── DESIGN.md                          (原始设计，保留)
├── README.md                          (已存在)
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── vitest.config.ts
├── .gitignore
├── .env.local.example
├── docs/
│   └── superpowers/                   (spec + plan)
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                   # 主工作台
│   │   ├── globals.css
│   │   └── api/
│   │       ├── health/route.ts
│   │       ├── cases/
│   │       │   ├── route.ts           # POST 创建、GET 列表
│   │       │   └── [id]/
│   │       │       ├── route.ts       # GET 单个、PATCH 更新、DELETE
│   │       │       ├── evidence/
│   │       │       │   ├── route.ts   # POST 添加证据、GET 列表
│   │       │       │   └── [evidenceId]/route.ts   # DELETE
│   │       │       └── export/route.ts             # GET 导出 zip
│   ├── domain/
│   │   ├── types.ts                   # 全部 spec §5 类型
│   │   ├── schemas.ts                 # Zod schema 定义
│   │   ├── constants.ts               # STEP_NAMES / EVIDENCE_TYPES 等
│   │   └── evidence-level.ts          # spec §6.2 分级算法
│   ├── server/
│   │   ├── paths.ts                   # ~/.ai-debug-assistant 路径工具
│   │   ├── fs-atomic.ts               # 原子写盘
│   │   ├── case-store.ts              # Case CRUD
│   │   ├── evidence-store.ts          # Evidence CRUD
│   │   ├── index-store.ts             # cases/index.json 维护
│   │   └── pipeline-init.ts           # 生成 8 步初始 PipelineState
│   ├── client/
│   │   ├── api.ts                     # fetch 封装
│   │   └── hooks/
│   │       ├── use-cases.ts
│   │       └── use-current-case.ts
│   └── components/
│       ├── layout/
│       │   ├── header.tsx
│       │   └── three-column.tsx
│       ├── case/
│       │   ├── case-form.tsx
│       │   ├── case-list.tsx
│       │   └── model-config.tsx       # 只 UI + sessionStorage，不发请求
│       ├── evidence/
│       │   ├── evidence-panel.tsx
│       │   ├── evidence-add-dialog.tsx
│       │   └── evidence-card.tsx
│       └── pipeline/
│           ├── pipeline-bar.tsx
│           └── step-badge.tsx
└── tests/
    ├── domain/
    │   ├── schemas.test.ts
    │   └── evidence-level.test.ts
    ├── server/
    │   ├── case-store.test.ts
    │   ├── evidence-store.test.ts
    │   └── index-store.test.ts
    └── api/
        ├── cases.test.ts
        └── evidence.test.ts
```

Phase 1 不实现的：LLM Client、Rule Engine、Provider 层、Pipeline Runner、SSE、脱敏（`sanitized` 字段留空）、导出 zip（先做 JSON 单文件下载）。

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.local.example`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/api/health/route.ts`

- [ ] **Step 1: 初始化 git 并创建 .gitignore**

在项目根 `ai-debug-assistant/` 下执行：

```bash
cd /Users/xiangxiao/Documents/Codex/2026-07-13/ai/ai-debug-assistant
git init
git branch -M main
```

写入 `.gitignore`：

```
node_modules
.next
out
dist
coverage
*.log
.env
.env.local
.DS_Store
```

- [ ] **Step 2: 写 package.json**

```json
{
  "name": "ai-debug-assistant",
  "version": "0.1.0-dev",
  "private": true,
  "scripts": {
    "dev": "next dev -p 8787",
    "build": "next build",
    "start": "next start -p 8787",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "15.0.3",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zod": "3.23.8",
    "uuid": "9.0.1",
    "class-variance-authority": "0.7.0",
    "clsx": "2.1.1",
    "tailwind-merge": "2.5.4"
  },
  "devDependencies": {
    "@testing-library/react": "16.0.1",
    "@testing-library/jest-dom": "6.6.3",
    "@types/node": "20.16.10",
    "@types/react": "18.3.11",
    "@types/react-dom": "18.3.0",
    "@types/uuid": "9.0.8",
    "@vitejs/plugin-react": "4.3.3",
    "autoprefixer": "10.4.20",
    "eslint": "8.57.1",
    "eslint-config-next": "15.0.3",
    "jsdom": "25.0.1",
    "postcss": "8.4.47",
    "tailwindcss": "3.4.14",
    "typescript": "5.6.3",
    "vitest": "1.6.0"
  }
}
```

安装依赖：

```bash
npm install
```

Expected: `node_modules/` 生成，无 ERR 级别报错。

- [ ] **Step 3: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@tests/*": ["./tests/*"]
    }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts", "tests/**/*.ts", "tests/**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: 写 next.config.mjs / tailwind / postcss**

`next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { typedRoutes: true },
  reactStrictMode: true
};
export default nextConfig;
```

`postcss.config.mjs`:

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} }
};
```

`tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'step-waiting': '#94a3b8',
        'step-ready': '#3b82f6',
        'step-running': '#eab308',
        'step-blocked': '#f97316',
        'step-done': '#22c55e',
        'step-skipped': '#64748b'
      }
    }
  },
  plugins: []
};
export default config;
```

- [ ] **Step 5: 写 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  }
});
```

创建 `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: 写最小 app 骨架**

`src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { height: 100%; margin: 0; background: #0b1020; color: #e2e8f0; font-family: system-ui, -apple-system, sans-serif; }
```

`src/app/layout.tsx`:

```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'AI Debug Assistant', description: 'Local troubleshooting workbench' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">AI Debug Assistant</h1>
      <p className="text-sm text-slate-400">Phase 1 骨架已启动</p>
    </main>
  );
}
```

`src/app/api/health/route.ts`:

```ts
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok', version: '0.1.0-dev' });
}
```

`.env.local.example`:

```
# Phase 1 暂无环境变量；Phase 2 才需要 LLM 配置
```

- [ ] **Step 7: 验证 dev server**

```bash
npm run dev
```

Expected: 控制台打印 `▲ Next.js 15.0.3 ... Local: http://localhost:8787`；浏览器访问 `http://localhost:8787` 看到「AI Debug Assistant / Phase 1 骨架已启动」；`curl -s http://localhost:8787/api/health` 返回 `{"status":"ok","version":"0.1.0-dev"}`。

停止 dev server（Ctrl+C）。

```bash
npm run typecheck
npm run test -- --reporter=verbose
```

Expected: typecheck 无错；test 因还没 test 文件退出码 0 或提示 "No test files found"（Vitest 允许空运行）。

- [ ] **Step 8: 首次提交**

```bash
git add .
git commit -m "chore: scaffold Next.js + Tailwind + Vitest"
```

### Task 2: 领域类型 + Zod Schema

**Files:**
- Create: `src/domain/constants.ts`
- Create: `src/domain/types.ts`
- Create: `src/domain/schemas.ts`
- Test: `tests/domain/schemas.test.ts`

- [ ] **Step 1: 写常量文件**

`src/domain/constants.ts`:

```ts
export const STEP_NAMES = [
  'Normalize',
  'Classify',
  'CollectEvidence',
  'InspectAPI',
  'AnalyzeCode',
  'AnalyzeSchema',
  'Diagnose',
  'ProposeFix'
] as const;

export const STEP_STATUSES = ['waiting', 'ready', 'running', 'blocked', 'done', 'skipped'] as const;

export const CASE_STATUSES = ['draft', 'running', 'blocked', 'done', 'error'] as const;

export const EVIDENCE_TYPES = [
  'curl', 'har', 'log', 'schema-sql',
  'ticket-text', 'page-url', 'api-response',
  'repo-path', 'screenshot-note', 'free-text'
] as const;

export const EVIDENCE_LEVELS = ['L0', 'L1', 'L2', 'L3'] as const;

export const SCHEMA_VERSION = '1.0';
```

- [ ] **Step 2: 写 TypeScript 类型**

`src/domain/types.ts`（严格对应 spec §5）：

```ts
import type { STEP_NAMES, STEP_STATUSES, CASE_STATUSES, EVIDENCE_TYPES, EVIDENCE_LEVELS } from './constants';

export type StepName = (typeof STEP_NAMES)[number];
export type StepStatus = (typeof STEP_STATUSES)[number];
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export interface PipelineStep {
  step: StepName;
  status: StepStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  inputHash?: string;
  outputRef?: string;
  blockedReason?: {
    kind: 'need-evidence' | 'provider-error';
    detail: string;
    suggestedActions: string[];
  };
  error?: { code: string; message: string };
}

export interface PipelineState {
  currentStep: StepName;
  steps: PipelineStep[];
  runIds: string[];
}

export interface CaseProblem {
  actual: string;
  expected: string;
  entry: string;
  environment: string;
}

export interface CaseMeta {
  occurredAt?: string;
  affectedUser?: string;
  module?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  branch?: string;
  commit?: string;
  repoPath?: string;
}

export interface Case {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: CaseStatus;
  problem: CaseProblem;
  meta?: CaseMeta;
  classification?: {
    category: string;
    subCategory?: string;
    confidence: 'low' | 'medium' | 'high';
    matchedRuleIds: string[];
  };
  evidenceLevel: EvidenceLevel;
  pipeline: PipelineState;
  reportId?: string;
  modelSnapshot?: { provider: string; baseUrl: string; model: string };
}

export interface Evidence {
  id: string;
  caseId: string;
  type: EvidenceType;
  createdAt: string;
  source: 'user-paste' | 'user-upload' | 'provider' | 'llm-generated';
  raw: { content: string; filename?: string; sizeBytes: number };
  parsed?: unknown;                        // Phase 3 才填
  summary: { oneLine: string; keywords: string[]; tokensEstimate: number };
  sanitized?: { content: string; redactedKeys: string[] };  // Phase 3 才填
}

export interface CaseIndexEntry {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  repoPath?: string;
  status: CaseStatus;
}
```

- [ ] **Step 3: 写 Zod schema**

`src/domain/schemas.ts`:

```ts
import { z } from 'zod';
import { STEP_NAMES, STEP_STATUSES, CASE_STATUSES, EVIDENCE_TYPES, EVIDENCE_LEVELS } from './constants';

export const stepNameSchema = z.enum(STEP_NAMES);
export const stepStatusSchema = z.enum(STEP_STATUSES);
export const caseStatusSchema = z.enum(CASE_STATUSES);
export const evidenceTypeSchema = z.enum(EVIDENCE_TYPES);
export const evidenceLevelSchema = z.enum(EVIDENCE_LEVELS);

export const pipelineStepSchema = z.object({
  step: stepNameSchema,
  status: stepStatusSchema,
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  inputHash: z.string().optional(),
  outputRef: z.string().optional(),
  blockedReason: z.object({
    kind: z.enum(['need-evidence', 'provider-error']),
    detail: z.string(),
    suggestedActions: z.array(z.string())
  }).optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional()
});

export const pipelineStateSchema = z.object({
  currentStep: stepNameSchema,
  steps: z.array(pipelineStepSchema).length(STEP_NAMES.length),
  runIds: z.array(z.string())
});

export const caseProblemSchema = z.object({
  actual: z.string().min(1, '必填'),
  expected: z.string().min(1, '必填'),
  entry: z.string().min(1, '必填'),
  environment: z.string().min(1, '必填')
});

export const caseMetaSchema = z.object({
  occurredAt: z.string().optional(),
  affectedUser: z.string().optional(),
  module: z.string().optional(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
  branch: z.string().optional(),
  commit: z.string().optional(),
  repoPath: z.string().optional()
});

export const caseSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: caseStatusSchema,
  problem: caseProblemSchema,
  meta: caseMetaSchema.optional(),
  classification: z.object({
    category: z.string(),
    subCategory: z.string().optional(),
    confidence: z.enum(['low', 'medium', 'high']),
    matchedRuleIds: z.array(z.string())
  }).optional(),
  evidenceLevel: evidenceLevelSchema,
  pipeline: pipelineStateSchema,
  reportId: z.string().optional(),
  modelSnapshot: z.object({
    provider: z.string(), baseUrl: z.string(), model: z.string()
  }).optional()
});

export const evidenceSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  type: evidenceTypeSchema,
  createdAt: z.string(),
  source: z.enum(['user-paste', 'user-upload', 'provider', 'llm-generated']),
  raw: z.object({
    content: z.string(),
    filename: z.string().optional(),
    sizeBytes: z.number().nonnegative()
  }),
  parsed: z.unknown().optional(),
  summary: z.object({
    oneLine: z.string(),
    keywords: z.array(z.string()),
    tokensEstimate: z.number().nonnegative()
  }),
  sanitized: z.object({
    content: z.string(),
    redactedKeys: z.array(z.string())
  }).optional()
});

export const createCaseInputSchema = z.object({
  problem: caseProblemSchema,
  meta: caseMetaSchema.optional()
});

export const addEvidenceInputSchema = z.object({
  type: evidenceTypeSchema,
  content: z.string().min(1),
  filename: z.string().optional()
});

export const caseIndexEntrySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  repoPath: z.string().optional(),
  status: caseStatusSchema
});
```

- [ ] **Step 4: 写 schema 测试**

`tests/domain/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  caseProblemSchema,
  createCaseInputSchema,
  addEvidenceInputSchema,
  pipelineStateSchema
} from '@/domain/schemas';
import { STEP_NAMES } from '@/domain/constants';

describe('caseProblemSchema', () => {
  it('拒绝空必填字段', () => {
    const r = caseProblemSchema.safeParse({ actual: '', expected: 'x', entry: 'x', environment: 'x' });
    expect(r.success).toBe(false);
  });
  it('接受完整四要素', () => {
    const r = caseProblemSchema.safeParse({
      actual: '页面显示数字', expected: '显示中文', entry: 'PLJI-1', environment: 'dev'
    });
    expect(r.success).toBe(true);
  });
});

describe('createCaseInputSchema', () => {
  it('meta 可选', () => {
    const r = createCaseInputSchema.safeParse({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    });
    expect(r.success).toBe(true);
  });
});

describe('addEvidenceInputSchema', () => {
  it('拒绝非法证据类型', () => {
    const r = addEvidenceInputSchema.safeParse({ type: 'unknown-type', content: 'x' });
    expect(r.success).toBe(false);
  });
  it('接受 curl 类型', () => {
    const r = addEvidenceInputSchema.safeParse({ type: 'curl', content: 'curl http://x' });
    expect(r.success).toBe(true);
  });
});

describe('pipelineStateSchema', () => {
  it('要求 steps 长度 = 8', () => {
    const short = { currentStep: 'Normalize', steps: [], runIds: [] };
    expect(pipelineStateSchema.safeParse(short).success).toBe(false);
  });
  it('接受完整 8 步 waiting 状态', () => {
    const state = {
      currentStep: 'Normalize' as const,
      steps: STEP_NAMES.map((step) => ({ step, status: 'waiting' as const })),
      runIds: []
    };
    expect(pipelineStateSchema.safeParse(state).success).toBe(true);
  });
});
```

- [ ] **Step 5: 运行测试**

```bash
npm run test -- tests/domain/schemas.test.ts
```

Expected: 4 个 describe 内 6 个 it 全部 PASS。

- [ ] **Step 6: typecheck + commit**

```bash
npm run typecheck
git add src/domain tests/domain
git commit -m "feat(domain): add spec types and Zod schemas"
```

---

### Task 3: 证据分级算法

**Files:**
- Create: `src/domain/evidence-level.ts`
- Test: `tests/domain/evidence-level.test.ts`

- [ ] **Step 1: 先写测试（TDD）**

`tests/domain/evidence-level.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { v4 as uuid } from 'uuid';
import { calculateEvidenceLevel } from '@/domain/evidence-level';
import type { Evidence, EvidenceType } from '@/domain/types';

function mkEvidence(type: EvidenceType, id: string = uuid()): Evidence {
  return {
    id, caseId: '00000000-0000-0000-0000-000000000000', type,
    createdAt: new Date().toISOString(), source: 'user-paste',
    raw: { content: 'x', sizeBytes: 1 },
    summary: { oneLine: 'x', keywords: [], tokensEstimate: 1 }
  };
}

describe('calculateEvidenceLevel', () => {
  it('无证据 → L0', () => {
    expect(calculateEvidenceLevel([])).toBe('L0');
  });
  it('仅 ticket-text → L1', () => {
    expect(calculateEvidenceLevel([mkEvidence('ticket-text')])).toBe('L1');
  });
  it('仅 page-url → L1', () => {
    expect(calculateEvidenceLevel([mkEvidence('page-url')])).toBe('L1');
  });
  it('ticket + curl → L2', () => {
    expect(calculateEvidenceLevel([mkEvidence('ticket-text'), mkEvidence('curl')])).toBe('L2');
  });
  it('仅 curl（跳过 L1）→ L2', () => {
    expect(calculateEvidenceLevel([mkEvidence('curl')])).toBe('L2');
  });
  it('curl + repo-path + schema-sql → L3', () => {
    expect(calculateEvidenceLevel([
      mkEvidence('curl'), mkEvidence('repo-path'), mkEvidence('schema-sql')
    ])).toBe('L3');
  });
  it('curl + repo-path 无 schema → L2', () => {
    expect(calculateEvidenceLevel([mkEvidence('curl'), mkEvidence('repo-path')])).toBe('L2');
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npm run test -- tests/domain/evidence-level.test.ts
```

Expected: FAIL，`Cannot find module '@/domain/evidence-level'`。

- [ ] **Step 3: 实现**

`src/domain/evidence-level.ts`:

```ts
import type { Evidence, EvidenceLevel, EvidenceType } from './types';

const L1_TYPES: EvidenceType[] = ['ticket-text', 'page-url', 'screenshot-note'];
const L2_TYPES: EvidenceType[] = ['curl', 'har', 'api-response'];
const CODE_TYPES: EvidenceType[] = ['repo-path'];
const SCHEMA_TYPES: EvidenceType[] = ['schema-sql'];

function has(evs: Evidence[], types: EvidenceType[]): boolean {
  return evs.some((e) => types.includes(e.type));
}

export function calculateEvidenceLevel(evidences: Evidence[]): EvidenceLevel {
  const hasL2 = has(evidences, L2_TYPES);
  const hasL1 = has(evidences, L1_TYPES);
  const hasCode = has(evidences, CODE_TYPES);
  const hasSchema = has(evidences, SCHEMA_TYPES);

  if (hasL2 && hasCode && hasSchema) return 'L3';
  if (hasL2) return 'L2';
  if (hasL1) return 'L1';
  return 'L0';
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npm run test -- tests/domain/evidence-level.test.ts
```

Expected: 7 个 it 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/domain/evidence-level.ts tests/domain/evidence-level.test.ts
git commit -m "feat(domain): implement evidence level L0-L3 calculator"
```

### Task 4: Pipeline 初始状态生成器

**Files:**
- Create: `src/server/pipeline-init.ts`
- Test: `tests/server/pipeline-init.test.ts`

- [ ] **Step 1: 写测试**

`tests/server/pipeline-init.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialPipelineState } from '@/server/pipeline-init';
import { STEP_NAMES } from '@/domain/constants';

describe('createInitialPipelineState', () => {
  it('生成 8 步 waiting 状态', () => {
    const s = createInitialPipelineState();
    expect(s.currentStep).toBe('Normalize');
    expect(s.steps).toHaveLength(8);
    expect(s.steps.map(x => x.step)).toEqual([...STEP_NAMES]);
    expect(s.steps.every(x => x.status === 'waiting')).toBe(true);
    expect(s.runIds).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npm run test -- tests/server/pipeline-init.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现**

`src/server/pipeline-init.ts`:

```ts
import type { PipelineState } from '@/domain/types';
import { STEP_NAMES } from '@/domain/constants';

export function createInitialPipelineState(): PipelineState {
  return {
    currentStep: 'Normalize',
    runIds: [],
    steps: STEP_NAMES.map((step) => ({ step, status: 'waiting' as const }))
  };
}
```

- [ ] **Step 4: 运行 + commit**

```bash
npm run test -- tests/server/pipeline-init.test.ts
git add src/server/pipeline-init.ts tests/server/pipeline-init.test.ts
git commit -m "feat(server): initial pipeline state factory"
```

---

### Task 5: 原子写盘工具

**Files:**
- Create: `src/server/paths.ts`
- Create: `src/server/fs-atomic.ts`
- Test: `tests/server/fs-atomic.test.ts`

- [ ] **Step 1: 写路径工具**

`src/server/paths.ts`:

```ts
import path from 'node:path';
import os from 'node:os';

const DEFAULT_ROOT = path.join(os.homedir(), '.ai-debug-assistant');

export function getRoot(): string {
  return process.env.AI_DEBUG_HOME ?? DEFAULT_ROOT;
}

export function casesDir(): string {
  return path.join(getRoot(), 'cases');
}

export function caseDir(caseId: string): string {
  return path.join(casesDir(), caseId);
}

export function caseFile(caseId: string): string {
  return path.join(caseDir(caseId), 'case.json');
}

export function evidenceDir(caseId: string): string {
  return path.join(caseDir(caseId), 'evidence');
}

export function evidenceFile(caseId: string, evidenceId: string): string {
  return path.join(evidenceDir(caseId), `${evidenceId}.json`);
}

export function indexFile(): string {
  return path.join(casesDir(), 'index.json');
}
```

- [ ] **Step 2: 写原子写盘测试**

`tests/server/fs-atomic.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeJsonAtomic, readJson, ensureDir } from '@/server/fs-atomic';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('writeJsonAtomic / readJson', () => {
  it('写入并回读', async () => {
    const file = path.join(tmp, 'x.json');
    await writeJsonAtomic(file, { a: 1 });
    expect(await readJson<{ a: number }>(file)).toEqual({ a: 1 });
  });

  it('目标目录不存在时自动创建', async () => {
    const file = path.join(tmp, 'sub/y.json');
    await writeJsonAtomic(file, { ok: true });
    expect(await readJson(file)).toEqual({ ok: true });
  });

  it('写入过程使用 .tmp 文件再 rename', async () => {
    const file = path.join(tmp, 'z.json');
    await writeJsonAtomic(file, { v: 'ok' });
    const entries = await fs.readdir(tmp);
    expect(entries).toContain('z.json');
    expect(entries.some(e => e.endsWith('.tmp'))).toBe(false);
  });
});

describe('ensureDir', () => {
  it('多级目录', async () => {
    const dir = path.join(tmp, 'a/b/c');
    await ensureDir(dir);
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });
});
```

- [ ] **Step 3: 运行确认失败**

```bash
npm run test -- tests/server/fs-atomic.test.ts
```

Expected: FAIL，模块未找到。

- [ ] **Step 4: 实现**

`src/server/fs-atomic.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const body = JSON.stringify(data, null, 2);
  await fs.writeFile(tmp, body, 'utf8');
  await fs.rename(tmp, file);
}

export async function readJson<T>(file: string): Promise<T> {
  const body = await fs.readFile(file, 'utf8');
  return JSON.parse(body) as T;
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function removeIfExists(file: string): Promise<void> {
  await fs.rm(file, { force: true });
}
```

- [ ] **Step 5: 运行 + commit**

```bash
npm run test -- tests/server/fs-atomic.test.ts
git add src/server/paths.ts src/server/fs-atomic.ts tests/server/fs-atomic.test.ts
git commit -m "feat(server): atomic file write utilities and path helpers"
```

### Task 6: Case Store（CRUD）

**Files:**
- Create: `src/server/case-store.ts`
- Test: `tests/server/case-store.test.ts`

- [ ] **Step 1: 写测试**

`tests/server/case-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCase, getCase, listCases, deleteCase } from '@/server/case-store';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-store-'));
  process.env.AI_DEBUG_HOME = tmp;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

describe('case-store', () => {
  const input = {
    problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' },
    meta: { module: 'billing', repoPath: '/tmp/repo' }
  };

  it('createCase 生成 uuid + 落盘', async () => {
    const c = await createCase(input);
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.status).toBe('draft');
    expect(c.evidenceLevel).toBe('L0');
    expect(c.pipeline.steps).toHaveLength(8);
    expect(c.pipeline.steps.every(s => s.status === 'waiting')).toBe(true);

    const raw = await fs.readFile(path.join(tmp, 'cases', c.id, 'case.json'), 'utf8');
    expect(JSON.parse(raw).id).toBe(c.id);
  });

  it('getCase 回读', async () => {
    const c = await createCase(input);
    const back = await getCase(c.id);
    expect(back.id).toBe(c.id);
    expect(back.problem.actual).toBe('a');
  });

  it('getCase 不存在 → 抛错', async () => {
    await expect(getCase('00000000-0000-0000-0000-000000000000')).rejects.toThrow();
  });

  it('listCases 返回全部 draft', async () => {
    const a = await createCase(input);
    const b = await createCase(input);
    const list = await listCases();
    const ids = list.map(x => x.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
  });

  it('deleteCase 移除目录', async () => {
    const c = await createCase(input);
    await deleteCase(c.id);
    await expect(getCase(c.id)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npm run test -- tests/server/case-store.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现**

`src/server/case-store.ts`:

```ts
import fs from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import type { Case } from '@/domain/types';
import { caseSchema, createCaseInputSchema } from '@/domain/schemas';
import { caseDir, caseFile, casesDir } from './paths';
import { writeJsonAtomic, readJson, fileExists } from './fs-atomic';
import { createInitialPipelineState } from './pipeline-init';
import { z } from 'zod';

type CreateCaseInput = z.infer<typeof createCaseInputSchema>;

export async function createCase(input: CreateCaseInput): Promise<Case> {
  const parsed = createCaseInputSchema.parse(input);
  const now = new Date().toISOString();
  const c: Case = {
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    problem: parsed.problem,
    meta: parsed.meta,
    evidenceLevel: 'L0',
    pipeline: createInitialPipelineState()
  };
  caseSchema.parse(c);
  await writeJsonAtomic(caseFile(c.id), c);
  return c;
}

export async function getCase(id: string): Promise<Case> {
  const file = caseFile(id);
  if (!(await fileExists(file))) throw new Error(`Case not found: ${id}`);
  const raw = await readJson<Case>(file);
  return caseSchema.parse(raw);
}

export async function updateCase(c: Case): Promise<Case> {
  const next = { ...c, updatedAt: new Date().toISOString() };
  caseSchema.parse(next);
  await writeJsonAtomic(caseFile(next.id), next);
  return next;
}

export async function listCases(): Promise<Case[]> {
  const dir = casesDir();
  if (!(await fileExists(dir))) return [];
  const entries = await fs.readdir(dir);
  const cases: Case[] = [];
  for (const e of entries) {
    if (!/^[0-9a-f-]{36}$/.test(e)) continue;
    try {
      cases.push(await getCase(e));
    } catch {
      // 跳过损坏的 case
    }
  }
  return cases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteCase(id: string): Promise<void> {
  await fs.rm(caseDir(id), { recursive: true, force: true });
}
```

- [ ] **Step 4: 运行 + commit**

```bash
npm run test -- tests/server/case-store.test.ts
git add src/server/case-store.ts tests/server/case-store.test.ts
git commit -m "feat(server): case CRUD backed by JSON files"
```

### Task 7: Evidence Store + 摘要计算

**Files:**
- Create: `src/server/evidence-store.ts`
- Test: `tests/server/evidence-store.test.ts`

Phase 1 只填 `summary`（oneLine / keywords / tokensEstimate 用 `chars/4` 估算），`parsed` 与 `sanitized` 留待 Phase 3。

- [ ] **Step 1: 写测试**

`tests/server/evidence-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCase } from '@/server/case-store';
import { addEvidence, listEvidence, deleteEvidence } from '@/server/evidence-store';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-ev-'));
  process.env.AI_DEBUG_HOME = tmp;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

async function mkCase() {
  return createCase({
    problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
  });
}

describe('evidence-store', () => {
  it('addEvidence 生成 id + 摘要 + tokensEstimate', async () => {
    const c = await mkCase();
    const e = await addEvidence(c.id, { type: 'curl', content: 'curl -X GET http://example.com/api' });
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(e.type).toBe('curl');
    expect(e.summary.tokensEstimate).toBeGreaterThan(0);
    expect(e.raw.sizeBytes).toBe(Buffer.byteLength('curl -X GET http://example.com/api', 'utf8'));
    expect(e.summary.oneLine.length).toBeGreaterThan(0);
  });

  it('addEvidence 落盘', async () => {
    const c = await mkCase();
    const e = await addEvidence(c.id, { type: 'log', content: 'ERROR foo' });
    const raw = await fs.readFile(path.join(tmp, 'cases', c.id, 'evidence', `${e.id}.json`), 'utf8');
    expect(JSON.parse(raw).id).toBe(e.id);
  });

  it('listEvidence 按 createdAt 升序', async () => {
    const c = await mkCase();
    const a = await addEvidence(c.id, { type: 'curl', content: 'a' });
    await new Promise(r => setTimeout(r, 5));
    const b = await addEvidence(c.id, { type: 'log', content: 'b' });
    const list = await listEvidence(c.id);
    expect(list.map(e => e.id)).toEqual([a.id, b.id]);
  });

  it('deleteEvidence 移除文件', async () => {
    const c = await mkCase();
    const e = await addEvidence(c.id, { type: 'curl', content: 'x' });
    await deleteEvidence(c.id, e.id);
    const list = await listEvidence(c.id);
    expect(list).toHaveLength(0);
  });

  it('page-url 类型摘要含 URL 前缀', async () => {
    const c = await mkCase();
    const e = await addEvidence(c.id, { type: 'page-url', content: 'https://example.com/detail/123' });
    expect(e.summary.oneLine).toContain('example.com');
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npm run test -- tests/server/evidence-store.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现**

`src/server/evidence-store.ts`:

```ts
import fs from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import type { Evidence, EvidenceType } from '@/domain/types';
import { addEvidenceInputSchema, evidenceSchema } from '@/domain/schemas';
import { z } from 'zod';
import { caseFile, evidenceDir, evidenceFile } from './paths';
import { fileExists, readJson, writeJsonAtomic } from './fs-atomic';

type AddEvidenceInput = z.infer<typeof addEvidenceInputSchema>;

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function extractKeywords(type: EvidenceType, content: string): string[] {
  const kws = new Set<string>();
  const urlRe = /https?:\/\/[^\s'"<>]+/g;
  for (const m of content.match(urlRe) ?? []) kws.add(m);
  const upperTokens = content.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [];
  for (const t of upperTokens.slice(0, 10)) kws.add(t);
  const httpVerbs = content.match(/\b(GET|POST|PUT|DELETE|PATCH)\b/g) ?? [];
  for (const v of httpVerbs) kws.add(v);
  return Array.from(kws).slice(0, 20);
}

function makeOneLine(type: EvidenceType, content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  const preview = trimmed.slice(0, 80);
  return `[${type}] ${preview}${trimmed.length > 80 ? '…' : ''}`;
}

export async function addEvidence(caseId: string, input: AddEvidenceInput): Promise<Evidence> {
  const parsed = addEvidenceInputSchema.parse(input);
  if (!(await fileExists(caseFile(caseId)))) {
    throw new Error(`Case not found: ${caseId}`);
  }
  const evidence: Evidence = {
    id: uuid(),
    caseId,
    type: parsed.type,
    createdAt: new Date().toISOString(),
    source: 'user-paste',
    raw: {
      content: parsed.content,
      filename: parsed.filename,
      sizeBytes: Buffer.byteLength(parsed.content, 'utf8')
    },
    summary: {
      oneLine: makeOneLine(parsed.type, parsed.content),
      keywords: extractKeywords(parsed.type, parsed.content),
      tokensEstimate: estimateTokens(parsed.content)
    }
  };
  evidenceSchema.parse(evidence);
  await writeJsonAtomic(evidenceFile(caseId, evidence.id), evidence);
  return evidence;
}

export async function listEvidence(caseId: string): Promise<Evidence[]> {
  const dir = evidenceDir(caseId);
  if (!(await fileExists(dir))) return [];
  const entries = await fs.readdir(dir);
  const list: Evidence[] = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    try {
      list.push(evidenceSchema.parse(await readJson(`${dir}/${name}`)));
    } catch {
      // 跳过损坏文件
    }
  }
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function deleteEvidence(caseId: string, evidenceId: string): Promise<void> {
  await fs.rm(evidenceFile(caseId, evidenceId), { force: true });
}
```

- [ ] **Step 4: 运行 + commit**

```bash
npm run test -- tests/server/evidence-store.test.ts
git add src/server/evidence-store.ts tests/server/evidence-store.test.ts
git commit -m "feat(server): evidence CRUD with summary + keywords"
```

### Task 8: Index Store（cases/index.json 维护）

**Files:**
- Create: `src/server/index-store.ts`
- Test: `tests/server/index-store.test.ts`

- [ ] **Step 1: 写测试**

`tests/server/index-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCase } from '@/server/case-store';
import { rebuildIndex, readIndex, upsertIndexEntry, removeIndexEntry } from '@/server/index-store';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-idx-'));
  process.env.AI_DEBUG_HOME = tmp;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

describe('index-store', () => {
  it('upsertIndexEntry 新增', async () => {
    const c = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    await upsertIndexEntry(c);
    const idx = await readIndex();
    expect(idx).toHaveLength(1);
    expect(idx[0].id).toBe(c.id);
    expect(idx[0].title).toBe('a');  // 用 actual 首行
  });

  it('upsertIndexEntry 覆盖已有', async () => {
    const c = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    await upsertIndexEntry(c);
    await upsertIndexEntry({ ...c, status: 'running' });
    const idx = await readIndex();
    expect(idx).toHaveLength(1);
    expect(idx[0].status).toBe('running');
  });

  it('removeIndexEntry', async () => {
    const c = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    await upsertIndexEntry(c);
    await removeIndexEntry(c.id);
    expect(await readIndex()).toHaveLength(0);
  });

  it('rebuildIndex 扫描所有 case', async () => {
    const a = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    const b = await createCase({ problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'w' } });
    await rebuildIndex();
    const idx = await readIndex();
    expect(idx.map(e => e.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('readIndex 未初始化时返回空数组', async () => {
    expect(await readIndex()).toEqual([]);
  });
});
```

- [ ] **Step 2: 实现**

`src/server/index-store.ts`:

```ts
import type { Case, CaseIndexEntry } from '@/domain/types';
import { caseIndexEntrySchema } from '@/domain/schemas';
import { z } from 'zod';
import { indexFile } from './paths';
import { fileExists, readJson, writeJsonAtomic } from './fs-atomic';
import { listCases } from './case-store';

const indexArraySchema = z.array(caseIndexEntrySchema);

export async function readIndex(): Promise<CaseIndexEntry[]> {
  if (!(await fileExists(indexFile()))) return [];
  try {
    return indexArraySchema.parse(await readJson(indexFile()));
  } catch {
    return [];
  }
}

async function writeIndex(entries: CaseIndexEntry[]): Promise<void> {
  await writeJsonAtomic(indexFile(), entries);
}

function toEntry(c: Case): CaseIndexEntry {
  const firstLine = c.problem.actual.split('\n')[0]?.trim() ?? '(untitled)';
  return {
    id: c.id,
    title: firstLine || '(untitled)',
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    repoPath: c.meta?.repoPath,
    status: c.status
  };
}

export async function upsertIndexEntry(c: Case): Promise<void> {
  const cur = await readIndex();
  const entry = toEntry(c);
  const next = cur.filter(e => e.id !== c.id);
  next.push(entry);
  next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await writeIndex(next);
}

export async function removeIndexEntry(id: string): Promise<void> {
  const cur = await readIndex();
  await writeIndex(cur.filter(e => e.id !== id));
}

export async function rebuildIndex(): Promise<CaseIndexEntry[]> {
  const cases = await listCases();
  const entries = cases.map(toEntry).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await writeIndex(entries);
  return entries;
}
```

- [ ] **Step 3: 运行 + commit**

```bash
npm run test -- tests/server/index-store.test.ts
git add src/server/index-store.ts tests/server/index-store.test.ts
git commit -m "feat(server): case index maintenance"
```

### Task 9: Case API Routes

**Files:**
- Create: `src/app/api/cases/route.ts`
- Create: `src/app/api/cases/[id]/route.ts`
- Test: `tests/api/cases.test.ts`

- [ ] **Step 1: 写路由**

`src/app/api/cases/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createCase, listCases } from '@/server/case-store';
import { upsertIndexEntry, readIndex } from '@/server/index-store';
import { createCaseInputSchema } from '@/domain/schemas';

export async function GET() {
  await listCases();  // ensure directory scan (harmless if empty)
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
  const c = await createCase(parsed.data);
  await upsertIndexEntry(c);
  return NextResponse.json({ case: c }, { status: 201 });
}
```

`src/app/api/cases/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getCase, deleteCase, updateCase } from '@/server/case-store';
import { listEvidence } from '@/server/evidence-store';
import { removeIndexEntry, upsertIndexEntry } from '@/server/index-store';
import { calculateEvidenceLevel } from '@/domain/evidence-level';
import { caseMetaSchema } from '@/domain/schemas';
import { z } from 'zod';

const patchSchema = z.object({
  meta: caseMetaSchema.optional(),
  status: z.enum(['draft', 'running', 'blocked', 'done', 'error']).optional()
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const c = await getCase(params.id);
    const evidence = await listEvidence(params.id);
    const evidenceLevel = calculateEvidenceLevel(evidence);
    if (evidenceLevel !== c.evidenceLevel) {
      const updated = await updateCase({ ...c, evidenceLevel });
      await upsertIndexEntry(updated);
      return NextResponse.json({ case: updated, evidence });
    }
    return NextResponse.json({ case: c, evidence });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const existing = await getCase(params.id);
  const updated = await updateCase({
    ...existing,
    meta: parsed.data.meta ?? existing.meta,
    status: parsed.data.status ?? existing.status
  });
  await upsertIndexEntry(updated);
  return NextResponse.json({ case: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await deleteCase(params.id);
  await removeIndexEntry(params.id);
  return NextResponse.json({ deleted: params.id });
}
```

- [ ] **Step 2: 写 API 集成测试**

`tests/api/cases.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { POST as postCase, GET as listCasesRoute } from '@/app/api/cases/route';
import { GET as getCaseRoute, DELETE as deleteCaseRoute } from '@/app/api/cases/[id]/route';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-api-'));
  process.env.AI_DEBUG_HOME = tmp;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

function jsonReq(body: unknown): NextRequest {
  return new NextRequest('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function emptyReq(): NextRequest {
  return new NextRequest('http://x/api');
}

describe('cases API', () => {
  it('POST 校验失败 → 400', async () => {
    const res = await postCase(jsonReq({ problem: { actual: '', expected: 'b', entry: 'c', environment: 'd' } }));
    expect(res.status).toBe(400);
  });

  it('POST 成功 → 201 + case + 写入 index', async () => {
    const res = await postCase(jsonReq({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.case.id).toMatch(/^[0-9a-f-]{36}$/);

    const listRes = await listCasesRoute();
    const listBody = await listRes.json();
    expect(listBody.cases).toHaveLength(1);
    expect(listBody.cases[0].id).toBe(body.case.id);
  });

  it('GET /:id 返回 case + evidence', async () => {
    const created = await (await postCase(jsonReq({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    }))).json();
    const res = await getCaseRoute(emptyReq(), { params: { id: created.case.id } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.case.id).toBe(created.case.id);
    expect(body.evidence).toEqual([]);
  });

  it('DELETE /:id', async () => {
    const created = await (await postCase(jsonReq({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    }))).json();
    const res = await deleteCaseRoute(emptyReq(), { params: { id: created.case.id } });
    expect(res.status).toBe(200);

    const after = await getCaseRoute(emptyReq(), { params: { id: created.case.id } });
    expect(after.status).toBe(404);
  });
});
```

- [ ] **Step 3: 运行 + commit**

```bash
npm run test -- tests/api/cases.test.ts
npm run typecheck
git add src/app/api/cases tests/api/cases.test.ts
git commit -m "feat(api): case CRUD routes"
```

### Task 10: Evidence API Routes

**Files:**
- Create: `src/app/api/cases/[id]/evidence/route.ts`
- Create: `src/app/api/cases/[id]/evidence/[evidenceId]/route.ts`
- Create: `src/app/api/cases/[id]/export/route.ts`
- Test: `tests/api/evidence.test.ts`

- [ ] **Step 1: 写 evidence 路由**

`src/app/api/cases/[id]/evidence/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { addEvidence, listEvidence } from '@/server/evidence-store';
import { getCase, updateCase } from '@/server/case-store';
import { upsertIndexEntry } from '@/server/index-store';
import { calculateEvidenceLevel } from '@/domain/evidence-level';
import { addEvidenceInputSchema } from '@/domain/schemas';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const list = await listEvidence(params.id);
  return NextResponse.json({ evidence: list });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const parsed = addEvidenceInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const evidence = await addEvidence(params.id, parsed.data);
  const all = await listEvidence(params.id);
  const c = await getCase(params.id);
  const level = calculateEvidenceLevel(all);
  const updated = await updateCase({ ...c, evidenceLevel: level });
  await upsertIndexEntry(updated);

  return NextResponse.json({ evidence, case: updated }, { status: 201 });
}
```

`src/app/api/cases/[id]/evidence/[evidenceId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteEvidence, listEvidence } from '@/server/evidence-store';
import { getCase, updateCase } from '@/server/case-store';
import { upsertIndexEntry } from '@/server/index-store';
import { calculateEvidenceLevel } from '@/domain/evidence-level';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; evidenceId: string } }
) {
  await deleteEvidence(params.id, params.evidenceId);
  const remaining = await listEvidence(params.id);
  const c = await getCase(params.id);
  const level = calculateEvidenceLevel(remaining);
  const updated = await updateCase({ ...c, evidenceLevel: level });
  await upsertIndexEntry(updated);
  return NextResponse.json({ case: updated });
}
```

- [ ] **Step 2: 写导出路由（JSON 单文件，非 zip）**

`src/app/api/cases/[id]/export/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getCase } from '@/server/case-store';
import { listEvidence } from '@/server/evidence-store';
import { SCHEMA_VERSION } from '@/domain/constants';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const c = await getCase(params.id);
  const evidence = await listEvidence(params.id);
  const body = { schemaVersion: SCHEMA_VERSION, case: c, evidence };
  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="case-${c.id}.json"`
    }
  });
}
```

- [ ] **Step 3: 写测试**

`tests/api/evidence.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { POST as createCaseRoute } from '@/app/api/cases/route';
import { POST as addEvidenceRoute } from '@/app/api/cases/[id]/evidence/route';
import { DELETE as delEvidenceRoute } from '@/app/api/cases/[id]/evidence/[evidenceId]/route';
import { GET as exportRoute } from '@/app/api/cases/[id]/export/route';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-evapi-'));
  process.env.AI_DEBUG_HOME = tmp;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

function ejsonReq(body: unknown): NextRequest {
  return new NextRequest('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function emptyReq(): NextRequest {
  return new NextRequest('http://x/api');
}

async function mkCase() {
  const res = await createCaseRoute(ejsonReq({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } }));
  return (await res.json()).case;
}

describe('evidence API', () => {
  it('POST 添加 curl 后 evidenceLevel → L2', async () => {
    const c = await mkCase();
    const res = await addEvidenceRoute(ejsonReq({ type: 'curl', content: 'curl x' }), { params: { id: c.id } });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.evidence.type).toBe('curl');
    expect(body.case.evidenceLevel).toBe('L2');
  });

  it('POST 添加 ticket 后 evidenceLevel → L1', async () => {
    const c = await mkCase();
    const res = await addEvidenceRoute(ejsonReq({ type: 'ticket-text', content: 'PLJI-1' }), { params: { id: c.id } });
    const body = await res.json();
    expect(body.case.evidenceLevel).toBe('L1');
  });

  it('DELETE 后级别回落', async () => {
    const c = await mkCase();
    const added = await (await addEvidenceRoute(ejsonReq({ type: 'curl', content: 'x' }), { params: { id: c.id } })).json();
    const res = await delEvidenceRoute(emptyReq(), { params: { id: c.id, evidenceId: added.evidence.id } });
    const body = await res.json();
    expect(body.case.evidenceLevel).toBe('L0');
  });

  it('导出 JSON 包含 case + evidence', async () => {
    const c = await mkCase();
    await addEvidenceRoute(ejsonReq({ type: 'log', content: 'ERROR foo' }), { params: { id: c.id } });
    const res = await exportRoute(emptyReq(), { params: { id: c.id } });
    const body = await res.json();
    expect(body.schemaVersion).toBe('1.0');
    expect(body.case.id).toBe(c.id);
    expect(body.evidence).toHaveLength(1);
  });
});
```

- [ ] **Step 4: 运行 + commit**

```bash
npm run test -- tests/api/evidence.test.ts
npm run typecheck
git add src/app/api tests/api/evidence.test.ts
git commit -m "feat(api): evidence CRUD + case export"
```

### Task 11: 前端 API 客户端

**Files:**
- Create: `src/client/api.ts`
- Create: `src/lib/cn.ts`

- [ ] **Step 1: 写工具函数**

`src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: 写 API 客户端**

`src/client/api.ts`:

```ts
'use client';
import type { Case, Evidence, CaseIndexEntry, EvidenceType } from '@/domain/types';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error?.formErrors?.[0] ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface CreateCasePayload {
  problem: { actual: string; expected: string; entry: string; environment: string };
  meta?: { module?: string; repoPath?: string; priority?: 'P0' | 'P1' | 'P2' | 'P3' };
}

export const api = {
  listCases: () => fetch('/api/cases').then(j<{ cases: CaseIndexEntry[] }>),
  createCase: (payload: CreateCasePayload) =>
    fetch('/api/cases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      .then(j<{ case: Case }>),
  getCase: (id: string) => fetch(`/api/cases/${id}`).then(j<{ case: Case; evidence: Evidence[] }>),
  deleteCase: (id: string) => fetch(`/api/cases/${id}`, { method: 'DELETE' }).then(j<{ deleted: string }>),
  addEvidence: (id: string, body: { type: EvidenceType; content: string; filename?: string }) =>
    fetch(`/api/cases/${id}/evidence`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    }).then(j<{ evidence: Evidence; case: Case }>),
  deleteEvidence: (caseId: string, evidenceId: string) =>
    fetch(`/api/cases/${caseId}/evidence/${evidenceId}`, { method: 'DELETE' }).then(j<{ case: Case }>),
  exportCase: (id: string) => `/api/cases/${id}/export`
};
```

- [ ] **Step 3: Commit**

```bash
git add src/client src/lib
git commit -m "feat(client): API wrapper"
```

---

### Task 12: 布局与 Header

**Files:**
- Create: `src/components/layout/header.tsx`
- Create: `src/components/layout/three-column.tsx`

- [ ] **Step 1: 写 Header**

`src/components/layout/header.tsx`:

```tsx
'use client';
import { cn } from '@/lib/cn';

interface HeaderProps {
  modelConfigured: boolean;
  currentCaseTitle?: string;
  onExport?: () => void;
}

export function Header({ modelConfigured, currentCaseTitle, onExport }: HeaderProps) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-4 py-2 flex items-center gap-4">
      <div className="text-base font-semibold">AI Debug Assistant</div>
      <div className={cn('text-xs px-2 py-0.5 rounded', modelConfigured ? 'bg-emerald-900/60 text-emerald-300' : 'bg-slate-700 text-slate-300')}>
        {modelConfigured ? '● 模型已配置' : '○ 未配置模型'}
      </div>
      <div className="flex-1 text-sm text-slate-400 truncate">
        {currentCaseTitle ?? '未选择 Case'}
      </div>
      {onExport && (
        <button onClick={onExport} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">
          导出 JSON
        </button>
      )}
    </header>
  );
}
```

- [ ] **Step 2: 写三栏布局**

`src/components/layout/three-column.tsx`:

```tsx
import type { ReactNode } from 'react';

interface Props {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

export function ThreeColumn({ left, center, right }: Props) {
  return (
    <div className="grid grid-cols-[320px_1fr_360px] gap-3 p-3 h-[calc(100vh-49px)] overflow-hidden">
      <aside className="overflow-y-auto rounded border border-slate-800 bg-slate-900/40 p-3">{left}</aside>
      <section className="overflow-y-auto rounded border border-slate-800 bg-slate-900/40 p-3">{center}</section>
      <aside className="overflow-y-auto rounded border border-slate-800 bg-slate-900/40 p-3">{right}</aside>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout
git commit -m "feat(ui): header + three-column layout"
```

### Task 13: Case 表单 + 模型配置 + Case 列表

**Files:**
- Create: `src/components/case/case-form.tsx`
- Create: `src/components/case/case-list.tsx`
- Create: `src/components/case/model-config.tsx`

- [ ] **Step 1: Model Config（仅 UI + sessionStorage，不发请求）**

`src/components/case/model-config.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';

const KEY = 'ada:model-config';

interface Config {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function ModelConfig({ onChange }: { onChange: (configured: boolean) => void }) {
  const [cfg, setCfg] = useState<Config>({ provider: 'openai-compatible', baseUrl: '', apiKey: '', model: '' });

  useEffect(() => {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Config;
        setCfg(parsed);
        onChange(Boolean(parsed.baseUrl && parsed.apiKey && parsed.model));
      } catch { /* ignore */ }
    }
  }, [onChange]);

  const update = (patch: Partial<Config>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    sessionStorage.setItem(KEY, JSON.stringify(next));
    onChange(Boolean(next.baseUrl && next.apiKey && next.model));
  };

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">模型配置</div>
      <input
        className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
        placeholder="Base URL (e.g. https://api.example.com/v1)"
        value={cfg.baseUrl}
        onChange={e => update({ baseUrl: e.target.value })}
      />
      <input
        className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
        type="password"
        placeholder="API Key (仅本会话保留)"
        value={cfg.apiKey}
        onChange={e => update({ apiKey: e.target.value })}
      />
      <input
        className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
        placeholder="Model name"
        value={cfg.model}
        onChange={e => update({ model: e.target.value })}
      />
      <p className="text-[10px] text-slate-500">Key 仅存于本会话 sessionStorage，Phase 2 才连通模型。</p>
    </div>
  );
}
```

- [ ] **Step 2: Case Form**

`src/components/case/case-form.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { api, type CreateCasePayload } from '@/client/api';

export function CaseForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [problem, setProblem] = useState({ actual: '', expected: '', entry: '', environment: '' });
  const [meta, setMeta] = useState({ module: '', repoPath: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const payload: CreateCasePayload = {
        problem,
        meta: {
          ...(meta.module ? { module: meta.module } : {}),
          ...(meta.repoPath ? { repoPath: meta.repoPath } : {})
        }
      };
      const { case: created } = await api.createCase(payload);
      onCreated(created.id);
      setProblem({ actual: '', expected: '', entry: '', environment: '' });
      setMeta({ module: '', repoPath: '' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const Row = ({ label, value, onChange, textarea = false }: {
    label: string; value: string; onChange: (v: string) => void; textarea?: boolean;
  }) => (
    <label className="block space-y-1">
      <span className="text-xs text-slate-400">{label}</span>
      {textarea ? (
        <textarea rows={2} className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          value={value} onChange={e => onChange(e.target.value)} />
      ) : (
        <input className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          value={value} onChange={e => onChange(e.target.value)} />
      )}
    </label>
  );

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">新建 Case</div>
      <Row label="Actual behavior *" value={problem.actual} onChange={v => setProblem({ ...problem, actual: v })} textarea />
      <Row label="Expected behavior *" value={problem.expected} onChange={v => setProblem({ ...problem, expected: v })} textarea />
      <Row label="Entry *" value={problem.entry} onChange={v => setProblem({ ...problem, entry: v })} />
      <Row label="Environment *" value={problem.environment} onChange={v => setProblem({ ...problem, environment: v })} />
      <Row label="Module (可选)" value={meta.module} onChange={v => setMeta({ ...meta, module: v })} />
      <Row label="Repo path (可选)" value={meta.repoPath} onChange={v => setMeta({ ...meta, repoPath: v })} />
      {error && <div className="text-xs text-rose-400">{error}</div>}
      <button disabled={submitting}
        onClick={submit}
        className="w-full text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded px-3 py-1.5">
        {submitting ? '创建中...' : '创建 Case'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Case List**

`src/components/case/case-list.tsx`:

```tsx
'use client';
import type { CaseIndexEntry } from '@/domain/types';

interface Props {
  cases: CaseIndexEntry[];
  activeId?: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function CaseList({ cases, activeId, onSelect, onDelete }: Props) {
  if (cases.length === 0) {
    return <p className="text-xs text-slate-500">还没有 Case</p>;
  }
  return (
    <ul className="space-y-1">
      {cases.map(c => (
        <li key={c.id}
          className={`group flex items-center gap-1 rounded px-2 py-1 cursor-pointer ${activeId === c.id ? 'bg-slate-700/60' : 'hover:bg-slate-800/60'}`}
          onClick={() => onSelect(c.id)}>
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{c.title}</div>
            <div className="text-[10px] text-slate-500">{c.status} · {new Date(c.createdAt).toLocaleString()}</div>
          </div>
          <button
            className="opacity-0 group-hover:opacity-100 text-[10px] text-rose-400 hover:text-rose-300"
            onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}>删除</button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/case
git commit -m "feat(ui): case form, list, model config"
```

### Task 14: 证据面板

**Files:**
- Create: `src/components/evidence/evidence-panel.tsx`
- Create: `src/components/evidence/evidence-add-dialog.tsx`
- Create: `src/components/evidence/evidence-card.tsx`

- [ ] **Step 1: Evidence Card**

`src/components/evidence/evidence-card.tsx`:

```tsx
'use client';
import { useState } from 'react';
import type { Evidence } from '@/domain/types';

interface Props {
  evidence: Evidence;
  onDelete: (id: string) => void;
}

export function EvidenceCard({ evidence, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-slate-800 rounded p-2 space-y-1 bg-slate-900/60">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-700 text-slate-200">{evidence.type}</span>
        <span className="text-xs text-slate-400">{new Date(evidence.createdAt).toLocaleTimeString()}</span>
        <span className="text-[10px] text-slate-500">~{evidence.summary.tokensEstimate} tok</span>
        <div className="flex-1" />
        <button className="text-[10px] text-slate-400 hover:text-slate-200"
          onClick={() => setExpanded(v => !v)}>{expanded ? '折叠' : '展开'}</button>
        <button className="text-[10px] text-rose-400 hover:text-rose-300"
          onClick={() => onDelete(evidence.id)}>删除</button>
      </div>
      <div className="text-xs text-slate-300 truncate">{evidence.summary.oneLine}</div>
      {evidence.summary.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {evidence.summary.keywords.slice(0, 8).map(k => (
            <span key={k} className="text-[10px] px-1 py-0.5 rounded bg-slate-800 text-slate-400">{k}</span>
          ))}
        </div>
      )}
      {expanded && (
        <pre className="mt-1 text-[11px] bg-slate-950/70 border border-slate-800 rounded p-2 whitespace-pre-wrap max-h-64 overflow-y-auto">
          {evidence.raw.content}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add Dialog**

`src/components/evidence/evidence-add-dialog.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { EVIDENCE_TYPES } from '@/domain/constants';
import type { EvidenceType } from '@/domain/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (type: EvidenceType, content: string) => Promise<void>;
}

export function EvidenceAddDialog({ open, onClose, onSubmit }: Props) {
  const [type, setType] = useState<EvidenceType>('curl');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    if (!content.trim()) { setError('内容不能为空'); return; }
    setSubmitting(true);
    try {
      await onSubmit(type, content);
      setContent('');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-10 flex items-center justify-center">
      <div className="bg-slate-900 border border-slate-700 rounded p-4 w-[560px] space-y-2">
        <div className="text-sm font-semibold">添加证据</div>
        <select
          className="w-full bg-slate-800 rounded px-2 py-1 text-sm"
          value={type} onChange={e => setType(e.target.value as EvidenceType)}>
          {EVIDENCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <textarea
          rows={12}
          className="w-full bg-slate-800 rounded px-2 py-1 text-xs font-mono"
          placeholder={type === 'curl' ? 'curl -X GET ...' : '粘贴内容'}
          value={content} onChange={e => setContent(e.target.value)} />
        {error && <div className="text-xs text-rose-400">{error}</div>}
        <div className="flex justify-end gap-2">
          <button className="text-xs px-3 py-1 rounded bg-slate-700 hover:bg-slate-600" onClick={onClose}>取消</button>
          <button disabled={submitting}
            className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            onClick={submit}>{submitting ? '添加中...' : '添加'}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Evidence Panel**

`src/components/evidence/evidence-panel.tsx`:

```tsx
'use client';
import { useState } from 'react';
import type { Case, Evidence, EvidenceType } from '@/domain/types';
import { EvidenceCard } from './evidence-card';
import { EvidenceAddDialog } from './evidence-add-dialog';

interface Props {
  currentCase: Case;
  evidence: Evidence[];
  onAdd: (type: EvidenceType, content: string) => Promise<void>;
  onDelete: (evidenceId: string) => Promise<void>;
}

const LEVEL_COLOR: Record<Case['evidenceLevel'], string> = {
  L0: 'text-slate-400',
  L1: 'text-blue-400',
  L2: 'text-emerald-400',
  L3: 'text-emerald-300'
};

export function EvidencePanel({ currentCase, evidence, onAdd, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-xs uppercase tracking-wide text-slate-400">证据</div>
        <span className={`text-xs font-semibold ${LEVEL_COLOR[currentCase.evidenceLevel]}`}>
          Level {currentCase.evidenceLevel}
        </span>
        <div className="flex-1" />
        <button className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500"
          onClick={() => setOpen(true)}>+ 添加证据</button>
      </div>
      <p className="text-[10px] text-slate-500">
        L0 描述 → L1 工单/页面 → L2 API 证据 → L3 API + 代码 + Schema
      </p>
      {evidence.length === 0
        ? <div className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-800 rounded">
            尚无证据。点「添加证据」开始收集。
          </div>
        : <div className="space-y-2">
            {evidence.map(e => <EvidenceCard key={e.id} evidence={e} onDelete={onDelete} />)}
          </div>}
      <EvidenceAddDialog open={open} onClose={() => setOpen(false)} onSubmit={onAdd} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/evidence
git commit -m "feat(ui): evidence panel with add dialog and cards"
```

### Task 15: Pipeline 可视化（骨架版）

**Files:**
- Create: `src/components/pipeline/step-badge.tsx`
- Create: `src/components/pipeline/pipeline-bar.tsx`

Phase 1 全部步骤都是 `waiting`。UI 展示 8 个色块 + 名字 + 状态徽标。点击某步展开该步的 input/output/error 详情（Phase 1 全空，只显示占位）。

- [ ] **Step 1: Step Badge**

`src/components/pipeline/step-badge.tsx`:

```tsx
'use client';
import type { PipelineStep, StepStatus } from '@/domain/types';
import { cn } from '@/lib/cn';

const STATUS_STYLE: Record<StepStatus, string> = {
  waiting: 'bg-slate-800 text-slate-400 border-slate-700',
  ready: 'bg-blue-900/60 text-blue-200 border-blue-700',
  running: 'bg-yellow-900/60 text-yellow-200 border-yellow-700 animate-pulse',
  blocked: 'bg-orange-900/60 text-orange-200 border-orange-700',
  done: 'bg-emerald-900/60 text-emerald-200 border-emerald-700',
  skipped: 'bg-slate-800/60 text-slate-500 border-slate-800'
};

interface Props {
  step: PipelineStep;
  active: boolean;
  onClick: () => void;
}

export function StepBadge({ step, active, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-start rounded border px-2 py-1.5 text-left transition',
        STATUS_STYLE[step.status],
        active ? 'ring-2 ring-blue-400' : 'hover:brightness-110'
      )}>
      <span className="text-[10px] uppercase tracking-wide opacity-70">{step.status}</span>
      <span className="text-xs font-medium">{step.step}</span>
    </button>
  );
}
```

- [ ] **Step 2: Pipeline Bar**

`src/components/pipeline/pipeline-bar.tsx`:

```tsx
'use client';
import { useState } from 'react';
import type { PipelineState } from '@/domain/types';
import { StepBadge } from './step-badge';

export function PipelineBar({ pipeline }: { pipeline: PipelineState }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = pipeline.steps[activeIdx];

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">Pipeline</div>
      <div className="grid grid-cols-4 gap-2">
        {pipeline.steps.map((s, i) => (
          <StepBadge key={s.step} step={s} active={i === activeIdx} onClick={() => setActiveIdx(i)} />
        ))}
      </div>
      <div className="border border-slate-800 rounded p-2 text-xs space-y-1 bg-slate-950/60">
        <div className="text-slate-300 font-medium">{active.step}</div>
        <div className="text-slate-500">
          Status: <span className="text-slate-300">{active.status}</span>
        </div>
        {active.blockedReason && (
          <div className="text-orange-300">
            Blocked ({active.blockedReason.kind}): {active.blockedReason.detail}
          </div>
        )}
        {active.error && (
          <div className="text-rose-300">Error {active.error.code}: {active.error.message}</div>
        )}
        {active.status === 'waiting' && (
          <div className="text-slate-500">Phase 1：Pipeline 尚未启动。Phase 2 接入 LLM 后此处才会有内容。</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline
git commit -m "feat(ui): pipeline bar and step badges (skeleton)"
```

### Task 16: 主页组装 + 端到端手动验收

**Files:**
- Modify: `src/app/page.tsx`（完全重写）

- [ ] **Step 1: 改造 page.tsx 组合全部组件**

`src/app/page.tsx`:

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Case, CaseIndexEntry, Evidence, EvidenceType } from '@/domain/types';
import { api } from '@/client/api';
import { Header } from '@/components/layout/header';
import { ThreeColumn } from '@/components/layout/three-column';
import { ModelConfig } from '@/components/case/model-config';
import { CaseForm } from '@/components/case/case-form';
import { CaseList } from '@/components/case/case-list';
import { EvidencePanel } from '@/components/evidence/evidence-panel';
import { PipelineBar } from '@/components/pipeline/pipeline-bar';

const ACTIVE_KEY = 'ada:active-case';

export default function HomePage() {
  const [modelConfigured, setModelConfigured] = useState(false);
  const [cases, setCases] = useState<CaseIndexEntry[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [current, setCurrent] = useState<{ case: Case; evidence: Evidence[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshCases = useCallback(async () => {
    const { cases } = await api.listCases();
    setCases(cases);
  }, []);

  const loadCase = useCallback(async (id: string) => {
    try {
      const data = await api.getCase(id);
      setCurrent(data);
      setActiveId(id);
      sessionStorage.setItem(ACTIVE_KEY, id);
    } catch (e) {
      setError((e as Error).message);
      setCurrent(null);
      setActiveId(undefined);
      sessionStorage.removeItem(ACTIVE_KEY);
    }
  }, []);

  useEffect(() => {
    refreshCases().catch(e => setError((e as Error).message));
    const stored = sessionStorage.getItem(ACTIVE_KEY);
    if (stored) loadCase(stored);
  }, [refreshCases, loadCase]);

  const handleCreated = async (id: string) => {
    await refreshCases();
    await loadCase(id);
  };

  const handleDelete = async (id: string) => {
    await api.deleteCase(id);
    if (activeId === id) {
      setActiveId(undefined);
      setCurrent(null);
      sessionStorage.removeItem(ACTIVE_KEY);
    }
    await refreshCases();
  };

  const handleAddEvidence = async (type: EvidenceType, content: string) => {
    if (!activeId) return;
    await api.addEvidence(activeId, { type, content });
    await loadCase(activeId);
    await refreshCases();
  };

  const handleDeleteEvidence = async (evidenceId: string) => {
    if (!activeId) return;
    await api.deleteEvidence(activeId, evidenceId);
    await loadCase(activeId);
    await refreshCases();
  };

  return (
    <>
      <Header
        modelConfigured={modelConfigured}
        currentCaseTitle={current?.case.problem.actual.split('\n')[0]}
        onExport={activeId ? () => window.open(api.exportCase(activeId), '_blank') : undefined}
      />
      <ThreeColumn
        left={
          <div className="space-y-4">
            <ModelConfig onChange={setModelConfigured} />
            <CaseForm onCreated={handleCreated} />
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">历史 Case</div>
              <CaseList cases={cases} activeId={activeId} onSelect={loadCase} onDelete={handleDelete} />
            </div>
          </div>
        }
        center={
          current ? (
            <div className="space-y-4">
              <PipelineBar pipeline={current.case.pipeline} />
              <EvidencePanel
                currentCase={current.case}
                evidence={current.evidence}
                onAdd={handleAddEvidence}
                onDelete={handleDeleteEvidence}
              />
            </div>
          ) : (
            <div className="text-center text-slate-500 py-16 text-sm">
              选择左侧一个 Case，或新建 Case 开始。
            </div>
          )
        }
        right={
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-400">报告</div>
            <div className="text-xs text-slate-500">
              Phase 1 未接入 LLM。Phase 2 完成后此处将展示结构化诊断报告。
            </div>
            {error && <div className="text-xs text-rose-400">{error}</div>}
          </div>
        }
      />
    </>
  );
}
```

- [ ] **Step 2: typecheck + build + 启动 dev server**

```bash
npm run typecheck
npm run build
```

Expected: 均无报错。

```bash
npm run dev
```

- [ ] **Step 3: 手动端到端验收（对齐 §16.1 前 4 条）**

浏览器打开 `http://localhost:8787`，依次完成：

1. 左栏「模型配置」输入 baseUrl / apiKey / model 任意值 → Header 状态从「○ 未配置模型」变「● 模型已配置」
2. 左栏「新建 Case」填 Actual / Expected / Entry / Environment（任意留空 → 点创建应看到红色错误）
3. 全部填齐后点「创建 Case」→ 左栏「历史 Case」出现一条 → 中栏出现 8 个 waiting 步骤的 Pipeline + 「Level L0」 + 「尚无证据」提示
4. 点「+ 添加证据」→ 选 `curl` → 粘贴任意 curl 命令 → 添加成功后 Level 变为 L2、卡片出现在下方
5. 再添加 `repo-path` 和 `schema-sql` 各一条 → Level 变为 L3
6. 点某条证据的「展开」→ 显示 raw content；点「删除」→ Level 回落
7. 刷新页面 → 「历史 Case」保留、当前 Case 与证据全部还在
8. 完全关闭浏览器 → 手动执行 `ls ~/.ai-debug-assistant/cases/` 应看到目录、`cat ~/.ai-debug-assistant/cases/index.json` 应看到条目
9. 点 Header「导出 JSON」→ 浏览器下载 `case-<id>.json`，打开确认包含 `schemaVersion: "1.0"` / `case` / `evidence` 三段
10. 停 dev server（Ctrl+C）

- [ ] **Step 4: 记录验收结果 + commit**

如果全部通过：

```bash
git add src/app/page.tsx
git commit -m "feat(ui): wire up main page with case + evidence + pipeline"
```

如果哪一步不通过，记录失败点，回到相关 Task 修复，重跑手动验收，再提交。

---

### Task 17: README 更新 + 版本打 tag

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README**

```markdown
# AI Debug Assistant

Local-first visual web workbench for engineering troubleshooting.

## Phase 1 已完成

- 本地 Web UI，端口 8787
- Case 表单 + 证据面板 + Pipeline 骨架
- 证据分级 L0–L3 实时计算
- 本地 JSON 持久化（`~/.ai-debug-assistant/`）
- 模型配置 UI（Key 仅本会话 sessionStorage）
- Case 导出 JSON

## 快速开始

```bash
npm install
npm run dev
open http://localhost:8787
```

## 数据位置

`~/.ai-debug-assistant/`（可用环境变量 `AI_DEBUG_HOME` 覆盖）

## 测试

```bash
npm run test        # 一次运行
npm run test:watch  # 监听模式
npm run typecheck
```

## 参考文档

- 设计规格：[docs/superpowers/specs/2026-07-14-ai-debug-assistant-design.md](./docs/superpowers/specs/2026-07-14-ai-debug-assistant-design.md)
- Phase 1 计划：[docs/superpowers/plans/2026-07-14-phase-1-static-workbench.md](./docs/superpowers/plans/2026-07-14-phase-1-static-workbench.md)

## 下一步（Phase 2）

- 接 OpenAI-compatible LLM
- Rule Engine 骨架
- Report JSON schema 校验
- Pipeline Runner 状态推进
```

- [ ] **Step 2: 打 tag + commit**

```bash
git add README.md
git commit -m "docs: update README for Phase 1 completion"
git tag -a v0.1.0 -m "Phase 1: static workbench"
```

- [ ] **Step 3: 最终全量校验**

```bash
npm run test
npm run typecheck
npm run build
```

Expected: 全绿。

---

## 完成清单（Phase 1 Done 判据）

- [x] 能创建 Case（四要素校验）
- [x] 能添加 5 类以上证据（`curl`/`log`/`schema-sql`/`ticket-text`/`repo-path` 等 10 类全支持）
- [x] 刷新页面数据不丢
- [x] `~/.ai-debug-assistant/cases/{caseId}/case.json` 落盘
- [x] `cases/index.json` 索引维护
- [x] Case 可导出、可删除
- [x] 证据级别 L0–L3 实时计算并展示
- [x] Pipeline 8 步骨架可见（全部 waiting）
- [x] 单元 + API 测试全绿
- [x] typecheck + build 无报错

Phase 2 起接入 LLM、Rule Engine、Pipeline Runner。

