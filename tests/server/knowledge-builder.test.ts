import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createFeature } from '@/server/feature-store';
import { createCase, updateCase } from '@/server/case-store';
import { refreshFeatureKnowledge } from '@/server/knowledge-builder';
import type { Lesson } from '@/domain/types';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-kb-'));
  process.env.AI_DEBUG_HOME = tmp;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

async function makeResolvedCase(featureId: string, lesson: Lesson) {
  const c = await createCase({
    problem: { actual: lesson.symptomPattern, expected: '正常', entry: '/x', environment: 'test' }
  });
  return await updateCase({
    ...c,
    featureId,
    summary: {
      status: 'resolved',
      rootCause: lesson.rootCause,
      fixApproach: lesson.fix,
      updatedAt: new Date().toISOString(),
      updatedBy: 'llm'
    },
    lessons: lesson
  });
}

describe('refreshFeatureKnowledge', () => {
  it('无 resolved case → knowledge 为空列表', async () => {
    const f = await createFeature({ name: '审批' });
    const updated = await refreshFeatureKnowledge(f.id);
    expect(updated.knowledge?.commonRootCauses).toEqual([]);
    expect(updated.knowledge?.verifiedFixes).toEqual([]);
    expect(updated.knowledge?.sourceCaseCount).toBe(0);
  });

  it('聚合根因去重（按频率）', async () => {
    const f = await createFeature({ name: '审批' });

    const lesson1: Lesson = {
      symptomPattern: '字段显示数字',
      rootCause: '字典未加载',
      fix: '预加载字典',
      extractedAt: new Date().toISOString()
    };
    const lesson2: Lesson = {
      symptomPattern: '审批卡住',
      rootCause: '字典未加载',
      fix: '预加载字典',
      extractedAt: new Date().toISOString()
    };
    const lesson3: Lesson = {
      symptomPattern: '500 错误',
      rootCause: '连接池耗尽',
      fix: '增大连接池',
      extractedAt: new Date().toISOString()
    };

    await makeResolvedCase(f.id, lesson1);
    await makeResolvedCase(f.id, lesson2);
    await makeResolvedCase(f.id, lesson3);

    const updated = await refreshFeatureKnowledge(f.id);
    expect(updated.knowledge?.sourceCaseCount).toBe(3);
    // 字典未加载 出现两次，应排在前面
    expect(updated.knowledge?.commonRootCauses[0]).toBe('字典未加载');
    expect(updated.knowledge?.commonRootCauses).toContain('连接池耗尽');
  });

  it('verifiedFixes 按 (symptomPattern+rootCause) 唯一', async () => {
    const f = await createFeature({ name: '审批' });

    const lesson1: Lesson = {
      symptomPattern: '字段显示数字',
      rootCause: '字典未加载',
      fix: '预加载字典',
      extractedAt: new Date().toISOString()
    };
    const lesson2: Lesson = {
      symptomPattern: '字段显示数字',
      rootCause: '字典未加载',
      fix: '预加载字典',
      extractedAt: new Date().toISOString()
    };

    const c1 = await makeResolvedCase(f.id, lesson1);
    const c2 = await makeResolvedCase(f.id, lesson2);

    const updated = await refreshFeatureKnowledge(f.id);
    expect(updated.knowledge?.verifiedFixes).toHaveLength(1);
    expect(updated.knowledge?.verifiedFixes[0].sourceCaseIds).toContain(c1.id);
    expect(updated.knowledge?.verifiedFixes[0].sourceCaseIds).toContain(c2.id);
  });

  it('只聚合同一 featureId 的 case', async () => {
    const f1 = await createFeature({ name: '审批' });
    const f2 = await createFeature({ name: '订单' });

    const lesson: Lesson = {
      symptomPattern: '症状',
      rootCause: '根因 A',
      fix: '修复 A',
      extractedAt: new Date().toISOString()
    };
    await makeResolvedCase(f2.id, lesson); // belongs to f2, not f1

    const updated = await refreshFeatureKnowledge(f1.id);
    expect(updated.knowledge?.sourceCaseCount).toBe(0);
  });
});
