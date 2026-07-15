import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';

// Mock llm-client before importing the route
vi.mock('@/server/llm-client', () => ({
  streamLlm: vi.fn()
}));

import { POST } from '@/app/api/analyze/route';
import { streamLlm } from '@/server/llm-client';
import { writeSavedConfig } from '@/server/config-store';
import { createCase } from '@/server/case-store';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-analyze-'));
  process.env.AI_DEBUG_HOME = tmp;
  vi.resetAllMocks();
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://x/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function readSseLines(res: Response): Promise<string[]> {
  const text = await res.text();
  return text
    .split('\n')
    .filter(l => l.startsWith('data: '))
    .map(l => l.slice(6).trim());
}

/** Fake async generator: yields text chunks then done */
async function* fakeStream() {
  yield { type: 'text' as const, text: '## 一句话结论\n' };
  yield { type: 'text' as const, text: '接口调用栈溢出。\n' };
  yield { type: 'text' as const, text: '## 已确认的事实\n' };
  yield { type: 'done' as const, inputTokens: 100, outputTokens: 50 };
}

describe('POST /api/analyze', () => {
  it('streams SSE with meta + text chunks + done', async () => {
    vi.mocked(streamLlm).mockImplementation(() => fakeStream());

    await writeSavedConfig({
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434',
      apiKey: 'test-key',
      model: 'gpt-4'
    });

    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });

    const res = await POST(postReq({ caseId: kase.id }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    const lines = await readSseLines(res);
    const parsed = lines.map(l => JSON.parse(l));

    const metaEvent = parsed.find((p: { type: string }) => p.type === 'meta');
    expect(metaEvent).toBeDefined();
    expect(metaEvent.evidences).toBe(0);

    const textEvents = parsed.filter((p: { type: string }) => p.type === 'text');
    expect(textEvents.length).toBeGreaterThanOrEqual(3);
    expect(textEvents.map((e: { text: string }) => e.text).join('')).toContain('一句话结论');

    const doneEvent = parsed.find((p: { type: string }) => p.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent.inputTokens).toBe(100);
    expect(doneEvent.outputTokens).toBe(50);
  });

  it('returns 400 when model not configured', async () => {
    const kase = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });

    const res = await POST(postReq({ caseId: kase.id }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('model not configured');
  });

  it('returns 400 for invalid request body', async () => {
    await writeSavedConfig({
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434',
      apiKey: 'key',
      model: 'gpt-4'
    });

    const res = await POST(postReq({ caseId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent caseId', async () => {
    await writeSavedConfig({
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434',
      apiKey: 'key',
      model: 'gpt-4'
    });

    const res = await POST(postReq({ caseId: '00000000-0000-0000-0000-000000000000' }));
    expect(res.status).toBe(404);
  });

  it('streamLlm is called with correct config', async () => {
    const mockFn = vi.mocked(streamLlm).mockImplementation(() => fakeStream());

    const cfg = {
      provider: 'anthropic-compatible',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-test',
      model: 'claude-3-opus-20240229'
    };
    await writeSavedConfig(cfg);

    const kase = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });

    await POST(postReq({ caseId: kase.id }));

    expect(mockFn).toHaveBeenCalledOnce();
    const [calledCfg] = mockFn.mock.calls[0];
    expect(calledCfg.provider).toBe('anthropic-compatible');
    expect(calledCfg.model).toBe('claude-3-opus-20240229');
  });

  it('meta event contains promptChars', async () => {
    vi.mocked(streamLlm).mockImplementation(() => fakeStream());

    await writeSavedConfig({
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434',
      apiKey: 'key',
      model: 'gpt-4'
    });

    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });

    const res = await POST(postReq({ caseId: kase.id }));
    const lines = await readSseLines(res);
    const parsed = lines.map(l => JSON.parse(l));
    const metaEvent = parsed.find((p: { type: string }) => p.type === 'meta');

    expect(metaEvent.promptChars).toBeGreaterThan(0);
  });
});
