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
    expect(idx[0].title).toBe('a');
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
