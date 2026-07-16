import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { TraceRecorder } from '@/server/trace-recorder';
import { createCase, getCase } from '@/server/case-store';
import { traceFile } from '@/server/paths';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-trace-'));
  process.env.AI_DEBUG_HOME = tmp;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

describe('TraceRecorder', () => {
  it('step() 成功 → status ok，返回原函数值', async () => {
    const kase = await createCase({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    });
    const recorder = new TraceRecorder(kase.id, 'create-case');
    const result = await recorder.step('classify-feature', '分类', async () => 42);
    expect(result).toBe(42);
    expect(recorder.lastStep?.status).toBe('ok');
    expect(recorder.lastStep?.kind).toBe('classify-feature');
  });

  it('step() 失败 → status failed，重新抛出', async () => {
    const kase = await createCase({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    });
    const recorder = new TraceRecorder(kase.id, 'create-case');
    await expect(
      recorder.step('llm-call', '调用', async () => { throw new Error('timeout'); })
    ).rejects.toThrow('timeout');
    expect(recorder.lastStep?.status).toBe('failed');
    expect(recorder.lastStep?.error).toBe('timeout');
  });

  it('add() 记录 skipped 步骤', async () => {
    const kase = await createCase({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    });
    const recorder = new TraceRecorder(kase.id, 'create-case');
    recorder.add({ kind: 'find-similar', label: '跳过', status: 'skipped' });
    expect(recorder.lastStep?.status).toBe('skipped');
    expect(recorder.lastStep?.durationMs).toBe(0);
  });

  it('finalize() 写入 trace 文件', async () => {
    const kase = await createCase({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    });
    const recorder = new TraceRecorder(kase.id, 'create-case');
    await recorder.step('classify-feature', '分类', async () => 'done');
    const trace = await recorder.finalize();

    expect(trace.id).toBeTruthy();
    expect(trace.caseId).toBe(kase.id);
    expect(trace.triggeredBy).toBe('create-case');
    expect(trace.steps).toHaveLength(1);
    expect(trace.totalMs).toBeGreaterThanOrEqual(0);

    const file = traceFile(kase.id, trace.id);
    const exists = await fs.access(file).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('finalize() appends traceId to case.traceIds', async () => {
    const kase = await createCase({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    });
    const recorder = new TraceRecorder(kase.id, 'create-case');
    recorder.add({ kind: 'find-similar', label: '无', status: 'skipped' });
    const trace = await recorder.finalize();

    const updated = await getCase(kase.id);
    expect(updated.traceIds).toContain(trace.id);
  });

  it('finalize() 两次 → traceIds 不重复', async () => {
    const kase = await createCase({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    });
    const r1 = new TraceRecorder(kase.id, 'create-case');
    r1.add({ kind: 'find-similar', label: '无', status: 'skipped' });
    const t1 = await r1.finalize();

    const r2 = new TraceRecorder(kase.id, 'send-message');
    r2.add({ kind: 'llm-call', label: '调用', status: 'ok' });
    const t2 = await r2.finalize();

    const updated = await getCase(kase.id);
    expect(updated.traceIds).toHaveLength(2);
    expect(updated.traceIds).toContain(t1.id);
    expect(updated.traceIds).toContain(t2.id);
  });

  it('step() 记录 durationMs > 0 (timing)', async () => {
    const kase = await createCase({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    });
    const recorder = new TraceRecorder(kase.id, 'create-case');
    await recorder.step('build-prompt', '构建', async () => {
      await new Promise(r => setTimeout(r, 5));
    });
    expect(recorder.lastStep?.durationMs).toBeGreaterThanOrEqual(0);
  });
});
