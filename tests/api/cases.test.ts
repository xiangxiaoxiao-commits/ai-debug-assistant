import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { POST as postCase, GET as listCasesRoute } from '@/app/api/cases/route';
import { GET as getCaseRoute, DELETE as deleteCaseRoute } from '@/app/api/cases/[id]/route';

vi.mock('@/server/llm-client', () => ({
  streamLlm: vi.fn(),
  modelSupportsVision: () => false
}));

import { streamLlm } from '@/server/llm-client';
import { writeSavedConfig } from '@/server/config-store';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-api-'));
  process.env.AI_DEBUG_HOME = tmp;
  vi.resetAllMocks();
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
    const res = await getCaseRoute(emptyReq(), { params: Promise.resolve({ id: created.case.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.case.id).toBe(created.case.id);
    expect(body.evidence).toEqual([]);
  });

  it('DELETE /:id', async () => {
    const created = await (await postCase(jsonReq({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    }))).json();
    const res = await deleteCaseRoute(emptyReq(), { params: Promise.resolve({ id: created.case.id }) });
    expect(res.status).toBe(200);

    const after = await getCaseRoute(emptyReq(), { params: Promise.resolve({ id: created.case.id }) });
    expect(after.status).toBe(404);
  });

  it('POST 成功（有 LLM config） → 响应包含 trace.id 且 case 有 playbook', async () => {
    async function* classifyStream() {
      yield { type: 'text' as const, text: JSON.stringify({ featureName: '审批', matchedExistingId: null, confidence: 0.9, reasoning: '...' }) };
      yield { type: 'done' as const };
    }
    async function* playbookStream() {
      yield { type: 'text' as const, text: JSON.stringify({ steps: [{ title: '抓接口 cURL' }, { title: '检查数据库' }] }) };
      yield { type: 'done' as const };
    }

    // No resolved similar cases exist, so only 2 LLM calls: classify + generatePlaybook
    vi.mocked(streamLlm)
      .mockImplementationOnce(() => classifyStream())
      .mockImplementationOnce(() => playbookStream());

    await writeSavedConfig({
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434',
      apiKey: 'k',
      model: 'gpt-4'
    });

    const res = await postCase(jsonReq({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.trace).toBeDefined();
    expect(body.trace.id).toBeTruthy();
    expect(body.case.playbook).toBeDefined();
    expect(body.case.playbook.steps.length).toBeGreaterThan(0);
  });
});
