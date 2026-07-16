import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { GET as getTraces } from '@/app/api/cases/[id]/traces/route';
import { GET as getTrace } from '@/app/api/cases/[id]/traces/[traceId]/route';
import { createCase } from '@/server/case-store';
import { TraceRecorder } from '@/server/trace-recorder';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-traces-'));
  process.env.AI_DEBUG_HOME = tmp;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

describe('GET /api/cases/:id/traces', () => {
  it('case 不存在 → 404', async () => {
    const res = await getTraces(
      new NextRequest('http://x'),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) }
    );
    expect(res.status).toBe(404);
  });

  it('无 traces → 返回空数组', async () => {
    const kase = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    const res = await getTraces(
      new NextRequest('http://x'),
      { params: Promise.resolve({ id: kase.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.traces).toEqual([]);
  });

  it('返回已记录的 traces，按时间升序', async () => {
    const kase = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });

    const r1 = new TraceRecorder(kase.id, 'create-case');
    r1.add({ kind: 'classify-feature', label: '分类', status: 'ok' });
    await r1.finalize();

    const r2 = new TraceRecorder(kase.id, 'send-message');
    r2.add({ kind: 'llm-call', label: '调用', status: 'ok' });
    await r2.finalize();

    const res = await getTraces(
      new NextRequest('http://x'),
      { params: Promise.resolve({ id: kase.id }) }
    );
    const body = await res.json();
    expect(body.traces).toHaveLength(2);
    expect(body.traces[0].triggeredBy).toBe('create-case');
    expect(body.traces[1].triggeredBy).toBe('send-message');
  });
});

describe('GET /api/cases/:id/traces/:traceId', () => {
  it('trace 不存在 → 404', async () => {
    const kase = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    const res = await getTrace(
      new NextRequest('http://x'),
      { params: Promise.resolve({ id: kase.id, traceId: 'nonexistent' }) }
    );
    expect(res.status).toBe(404);
  });

  it('返回单条 trace', async () => {
    const kase = await createCase({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } });
    const recorder = new TraceRecorder(kase.id, 'create-case');
    recorder.add({ kind: 'classify-feature', label: '分类', status: 'ok' });
    const trace = await recorder.finalize();

    const res = await getTrace(
      new NextRequest('http://x'),
      { params: Promise.resolve({ id: kase.id, traceId: trace.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trace.id).toBe(trace.id);
    expect(body.trace.steps).toHaveLength(1);
    expect(body.trace.steps[0].kind).toBe('classify-feature');
  });
});
