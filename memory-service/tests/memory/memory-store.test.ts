import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createProject, getProject } from '@/memory/project-store';
import {
  remember,
  recall,
  listMemories,
  updateMemory,
  forget,
  getMemory,
  topByStrength
} from '@/memory/memory-store';

let tmp: string;
let projectId: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-mem-store-'));
  process.env.AI_DEBUG_HOME = tmp;
  const p = await createProject({ name: 'demo' });
  projectId = p.id;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

describe('memory-store', () => {
  it('remember + listMemories + getMemory', async () => {
    const { entry, reinforced } = await remember(projectId, {
      kind: 'semantic',
      content: '所有 DTO 转换在 assembler 层',
      tags: ['convention']
    });
    expect(reinforced).toBe(false);
    expect(entry.strength).toBe(1);

    const list = await listMemories(projectId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(entry.id);

    const back = await getMemory(projectId, entry.id);
    expect(back.content).toBe(entry.content);

    const proj = await getProject(projectId);
    expect(proj.memoryCount).toBe(1);
  });

  it('reinforceIfSimilar bumps strength instead of adding duplicate', async () => {
    await remember(projectId, {
      kind: 'semantic',
      content: '所有 DTO 转换在 assembler 层完成',
      tags: ['convention']
    });
    const { entry, reinforced } = await remember(projectId, {
      kind: 'semantic',
      content: '所有 DTO 转换都在 assembler 层完成',   // very similar
      tags: ['backend'],
      reinforceIfSimilar: true
    });
    expect(reinforced).toBe(true);
    expect(entry.strength).toBe(2);
    expect(entry.tags).toContain('convention');
    expect(entry.tags).toContain('backend');

    const list = await listMemories(projectId);
    expect(list).toHaveLength(1);   // no duplicate
  });

  it('reinforceIfSimilar creates new when nothing similar', async () => {
    await remember(projectId, {
      kind: 'semantic',
      content: '订单接口用 POST'
    });
    const { entry, reinforced } = await remember(projectId, {
      kind: 'semantic',
      content: '登录用 CSRF token',
      reinforceIfSimilar: true
    });
    expect(reinforced).toBe(false);
    expect(entry.strength).toBe(1);
  });

  it('listMemories filters by kind', async () => {
    await remember(projectId, { kind: 'semantic', content: 'A' });
    await remember(projectId, { kind: 'procedural', content: 'B' });
    await remember(projectId, { kind: 'core', content: 'C' });

    expect((await listMemories(projectId, { kinds: ['semantic'] })).length).toBe(1);
    expect((await listMemories(projectId, { kinds: ['semantic', 'core'] })).length).toBe(2);
  });

  it('listMemories filters by tags (AND)', async () => {
    await remember(projectId, { kind: 'semantic', content: 'a', tags: ['backend', 'java'] });
    await remember(projectId, { kind: 'semantic', content: 'b', tags: ['backend'] });
    await remember(projectId, { kind: 'semantic', content: 'c', tags: ['java'] });

    expect((await listMemories(projectId, { tags: ['backend'] })).length).toBe(2);
    expect((await listMemories(projectId, { tags: ['backend', 'java'] })).length).toBe(1);
  });

  it('recall returns relevant hits with score', async () => {
    await remember(projectId, {
      kind: 'semantic',
      content: '审批模块字段显示为数字应该是中文'
    });
    await remember(projectId, {
      kind: 'semantic',
      content: '订单接口偶发 500'
    });
    const { entry } = await remember(projectId, {
      kind: 'semantic',
      content: '登录页面 CSRF token 过期'
    });

    const hits = await recall(projectId, { query: '登录 CSRF', topK: 2 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].entry.id).toBe(entry.id);
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('recall filters by kind + tags', async () => {
    await remember(projectId, { kind: 'semantic', content: '订单 500', tags: ['backend'] });
    await remember(projectId, { kind: 'procedural', content: '订单 500 排查', tags: ['backend'] });

    const hits = await recall(projectId, {
      query: '订单 500',
      kinds: ['procedural']
    });
    expect(hits.every(h => h.entry.kind === 'procedural')).toBe(true);
  });

  it('updateMemory + forget', async () => {
    const { entry } = await remember(projectId, { kind: 'semantic', content: 'old' });
    const updated = await updateMemory(projectId, entry.id, { content: 'new', strength: 5 });
    expect(updated.content).toBe('new');
    expect(updated.strength).toBe(5);
    expect(updated.updatedBy).toBe('user');

    await forget(projectId, entry.id);
    expect(await listMemories(projectId)).toHaveLength(0);
    expect((await getProject(projectId)).memoryCount).toBe(0);
  });

  it('topByStrength returns highest-strength entries first', async () => {
    const { entry: a } = await remember(projectId, { kind: 'semantic', content: 'x' });
    const { entry: b } = await remember(projectId, { kind: 'semantic', content: 'y' });
    await updateMemory(projectId, a.id, { strength: 10 });
    await updateMemory(projectId, b.id, { strength: 3 });

    const top = await topByStrength(projectId, 'semantic', 5);
    expect(top[0].id).toBe(a.id);
    expect(top[1].id).toBe(b.id);
  });

  it('operations against missing project throw', async () => {
    await expect(listMemories('00000000-0000-0000-0000-000000000000')).rejects.toThrow();
  });
});
