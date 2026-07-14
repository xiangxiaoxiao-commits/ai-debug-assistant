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
