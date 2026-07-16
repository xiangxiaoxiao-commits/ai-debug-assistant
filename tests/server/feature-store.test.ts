import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  createFeature,
  getFeature,
  listFeatures,
  updateFeature,
  deleteFeature,
  findFeatureByName,
  incrementFeatureStats
} from '@/server/feature-store';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-feat-'));
  process.env.AI_DEBUG_HOME = tmp;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

describe('feature-store — CRUD', () => {
  it('createFeature 生成 uuid + 落盘', async () => {
    const f = await createFeature({ name: '审批' });
    expect(f.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.name).toBe('审批');
    expect(f.bugCount).toBe(0);
    expect(f.resolvedCount).toBe(0);
    const raw = await fs.readFile(
      path.join(tmp, 'features', f.id + '.json'), 'utf8'
    );
    expect(JSON.parse(raw).id).toBe(f.id);
  });

  it('getFeature 回读', async () => {
    const f = await createFeature({ name: '订单' });
    const back = await getFeature(f.id);
    expect(back.id).toBe(f.id);
    expect(back.name).toBe('订单');
  });

  it('getFeature 不存在 → 抛错', async () => {
    await expect(getFeature('00000000-0000-0000-0000-000000000000')).rejects.toThrow();
  });

  it('listFeatures 返回全部', async () => {
    const a = await createFeature({ name: '审批' });
    const b = await createFeature({ name: '登录' });
    const list = await listFeatures();
    const ids = list.map(x => x.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
  });

  it('listFeatures 目录不存在时返回空数组', async () => {
    const list = await listFeatures();
    expect(list).toEqual([]);
  });

  it('updateFeature 修改名称 + 更新 updatedAt', async () => {
    const f = await createFeature({ name: '审批' });
    const updated = await updateFeature({ ...f, name: '审批流' });
    expect(updated.name).toBe('审批流');
    const back = await getFeature(f.id);
    expect(back.name).toBe('审批流');
  });

  it('deleteFeature 移除文件', async () => {
    const f = await createFeature({ name: '审批' });
    await deleteFeature(f.id);
    await expect(getFeature(f.id)).rejects.toThrow();
  });

  it('findFeatureByName 精确匹配', async () => {
    await createFeature({ name: '审批' });
    const found = await findFeatureByName('审批');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('审批');
  });

  it('findFeatureByName 不存在 → null', async () => {
    await createFeature({ name: '审批' });
    const found = await findFeatureByName('不存在');
    expect(found).toBeNull();
  });

  it('aliases 选填，存储后回读', async () => {
    const f = await createFeature({ name: '审批', aliases: ['approval', 'audit'] });
    const back = await getFeature(f.id);
    expect(back.aliases).toEqual(['approval', 'audit']);
  });
});

describe('feature-store — index maintenance', () => {
  it('createFeature 写入 features/index.json', async () => {
    const f = await createFeature({ name: '审批' });
    const raw = await fs.readFile(path.join(tmp, 'features', 'index.json'), 'utf8');
    const idx = JSON.parse(raw);
    expect(Array.isArray(idx)).toBe(true);
    expect(idx[0].id).toBe(f.id);
    expect(idx[0].name).toBe('审批');
  });

  it('deleteFeature 从 index 移除', async () => {
    const f = await createFeature({ name: '审批' });
    await deleteFeature(f.id);
    const raw = await fs.readFile(path.join(tmp, 'features', 'index.json'), 'utf8');
    const idx = JSON.parse(raw);
    expect(idx.find((e: { id: string }) => e.id === f.id)).toBeUndefined();
  });
});

describe('feature-store — incrementFeatureStats', () => {
  it('bug delta 累加', async () => {
    const f = await createFeature({ name: '审批' });
    await incrementFeatureStats(f.id, { bug: 1 });
    await incrementFeatureStats(f.id, { bug: 1 });
    const back = await getFeature(f.id);
    expect(back.bugCount).toBe(2);
  });

  it('resolved delta 累加', async () => {
    const f = await createFeature({ name: '审批' });
    await incrementFeatureStats(f.id, { bug: 1, resolved: 1 });
    const back = await getFeature(f.id);
    expect(back.bugCount).toBe(1);
    expect(back.resolvedCount).toBe(1);
  });

  it('负数 delta 不低于 0', async () => {
    const f = await createFeature({ name: '审批' });
    await incrementFeatureStats(f.id, { resolved: -1 });
    const back = await getFeature(f.id);
    expect(back.resolvedCount).toBe(0);
  });
});
