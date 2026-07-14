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
