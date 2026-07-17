import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';

vi.mock('@/server/llm-client', () => ({
  streamLlm: vi.fn(),
  modelSupportsVision: () => false
}));

import { POST, GET } from '@/app/api/cases/[id]/messages/route';
import { streamLlm } from '@/server/llm-client';
import { writeSavedConfig } from '@/server/config-store';
import { createCase, getCase } from '@/server/case-store';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-msgs-'));
  process.env.AI_DEBUG_HOME = tmp;
  vi.resetAllMocks();
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

async function* fakeStream() {
  yield { type: 'text' as const, text: '## 一句话结论\n' };
  yield { type: 'text' as const, text: '服务崩溃由 NPE 引起。\n' };
  yield { type: 'done' as const, inputTokens: 100, outputTokens: 40 };
}

async function* fakeSummaryStream() {
  yield { type: 'text' as const, text: JSON.stringify({ status: 'investigating', headline: 'NPE' }) };
  yield { type: 'done' as const };
}

function postReq(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://x/api/cases/${id}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function getReq(id: string): NextRequest {
  return new NextRequest(`http://x/api/cases/${id}/messages`, { method: 'GET' });
}

async function readSseEvents(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .split('\n')
    .filter(l => l.startsWith('data: '))
    .map(l => JSON.parse(l.slice(6).trim()));
}

describe('POST /api/cases/:id/messages', () => {
  it('返回 400 当 model 未配置', async () => {
    const kase = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });
    const res = await POST(postReq(kase.id, { text: 'hello' }), { params: Promise.resolve({ id: kase.id }) });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('model not configured');
  });

  it('返回 404 当 case 不存在', async () => {
    await writeSavedConfig({
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434',
      apiKey: 'k',
      model: 'gpt-4'
    });
    const res = await POST(
      postReq('00000000-0000-0000-0000-000000000000', { text: 'hi' }),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) }
    );
    expect(res.status).toBe(404);
  });

  it('返回 400 when bad request body', async () => {
    await writeSavedConfig({
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434',
      apiKey: 'k',
      model: 'gpt-4'
    });
    const kase = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });
    const res = await POST(
      new NextRequest(`http://x/api/cases/${kase.id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json'
      }),
      { params: Promise.resolve({ id: kase.id }) }
    );
    expect(res.status).toBe(400);
  });

  it('SSE 流包含 meta + text + done + summary 事件', async () => {
    // streamLlm called twice: once for conversation, once for summary extraction
    vi.mocked(streamLlm)
      .mockImplementationOnce(() => fakeStream())
      .mockImplementationOnce(() => fakeSummaryStream());

    await writeSavedConfig({
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434',
      apiKey: 'key',
      model: 'gpt-4'
    });

    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });

    const res = await POST(postReq(kase.id, { text: 'what is the root cause?' }), { params: Promise.resolve({ id: kase.id }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    const events = await readSseEvents(res);

    const metaEvent = events.find(e => e.type === 'meta');
    expect(metaEvent).toBeDefined();
    expect(metaEvent!.userMessageId).toBeTruthy();

    const textEvents = events.filter(e => e.type === 'text');
    expect(textEvents.length).toBeGreaterThan(0);
    expect(textEvents.map(e => e.text).join('')).toContain('一句话结论');

    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent!.assistantMessageId).toBeTruthy();
    expect(doneEvent!.inputTokens).toBe(100);
    expect(doneEvent!.outputTokens).toBe(40);

    const summaryEvent = events.find(e => e.type === 'summary');
    expect(summaryEvent).toBeDefined();
    expect((summaryEvent!.summary as Record<string, unknown>).status).toBe('investigating');
  });

  it('用户消息和助手消息均持久化到 case', async () => {
    vi.mocked(streamLlm)
      .mockImplementationOnce(() => fakeStream())
      .mockImplementationOnce(() => fakeSummaryStream());

    await writeSavedConfig({
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434',
      apiKey: 'key',
      model: 'gpt-4'
    });

    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });

    const res = await POST(postReq(kase.id, { text: 'tell me more' }), { params: Promise.resolve({ id: kase.id }) });
    await res.text(); // drain

    const updated = await getCase(kase.id);
    expect(updated.messages).toHaveLength(2);
    expect(updated.messages![0].role).toBe('user');
    expect(updated.messages![0].content).toBe('tell me more');
    expect(updated.messages![1].role).toBe('assistant');
    expect(updated.messages![1].content).toContain('一句话结论');
    expect(updated.messages![1].meta?.inputTokens).toBe(100);
  });

  it('SSE 流包含 trace-step 和 trace-done 事件', async () => {
    vi.mocked(streamLlm)
      .mockImplementationOnce(() => fakeStream())
      .mockImplementationOnce(() => fakeSummaryStream());

    await writeSavedConfig({
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434',
      apiKey: 'key',
      model: 'gpt-4'
    });

    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });

    const res = await POST(postReq(kase.id, { text: 'what is the root cause?' }), { params: Promise.resolve({ id: kase.id }) });
    const events = await readSseEvents(res);

    const traceStepEvents = events.filter(e => e.type === 'trace-step');
    expect(traceStepEvents.length).toBeGreaterThan(0);
    const stepKinds = traceStepEvents.map(e => (e as Record<string, unknown>).step as Record<string, unknown>).map(s => s.kind);
    expect(stepKinds).toContain('llm-call');

    const traceDoneEvent = events.find(e => e.type === 'trace-done');
    expect(traceDoneEvent).toBeDefined();
    expect((traceDoneEvent as Record<string, unknown>).traceId).toBeTruthy();
    expect(typeof (traceDoneEvent as Record<string, unknown>).totalMs).toBe('number');
    expect(typeof (traceDoneEvent as Record<string, unknown>).stepCount).toBe('number');
  });
});

describe('GET /api/cases/:id/messages', () => {
  it('返回 404 当 case 不存在', async () => {
    const res = await GET(getReq('00000000-0000-0000-0000-000000000000'), {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' })
    });
    expect(res.status).toBe(404);
  });

  it('返回空消息列表（新 case）', async () => {
    const kase = await createCase({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    });

    const res = await GET(getReq(kase.id), { params: Promise.resolve({ id: kase.id }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.messages).toEqual([]);
    expect(body.summary).toBeDefined();
    expect(body.summary.status).toBe('open');
  });

  it('返回已有消息和 summary', async () => {
    vi.mocked(streamLlm)
      .mockImplementationOnce(() => fakeStream())
      .mockImplementationOnce(() => fakeSummaryStream());

    await writeSavedConfig({
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434',
      apiKey: 'key',
      model: 'gpt-4'
    });

    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });

    const postRes = await POST(postReq(kase.id, { text: 'what happened?' }), { params: Promise.resolve({ id: kase.id }) });
    await postRes.text(); // drain

    const getRes = await GET(getReq(kase.id), { params: Promise.resolve({ id: kase.id }) });
    const body = await getRes.json();

    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[1].role).toBe('assistant');
    expect(body.summary.status).toBe('investigating');
  });
});
