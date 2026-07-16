import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { createFeature } from '@/server/feature-store';
import { createCase, updateCase } from '@/server/case-store';

vi.mock('@/server/knowledge-builder', () => ({
  refreshFeatureKnowledge: vi.fn().mockImplementation(async (id: string) => {
    const { getFeature: gf } = await import('@/server/feature-store');
    return gf(id);
  })
}));

import { GET as listFeatures } from '@/app/api/features/route';
import {
  GET as getFeatureRoute,
  PATCH as patchFeatureRoute
} from '@/app/api/features/[id]/route';
import { POST as refreshKnowledge } from '@/app/api/features/[id]/refresh-knowledge/route';
import { PATCH as patchCaseFeature } from '@/app/api/cases/[id]/feature/route';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-feat-api-'));
  process.env.AI_DEBUG_HOME = tmp;
  vi.clearAllMocks();
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

function emptyReq(): NextRequest {
  return new NextRequest('http://x/api/features');
}

function jsonReq(method: string, url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('GET /api/features', () => {
  it('空列表', async () => {
    const res = await listFeatures();
    const body = await res.json();
    expect(body.features).toEqual([]);
  });

  it('返回所有 feature', async () => {
    await createFeature({ name: '审批' });
    await createFeature({ name: '订单' });
    const res = await listFeatures();
    const body = await res.json();
    expect(body.features).toHaveLength(2);
  });
});

describe('GET /api/features/:id', () => {
  it('返回 feature + resolvedCases', async () => {
    const f = await createFeature({ name: '审批' });
    const c = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });
    await updateCase({
      ...c,
      featureId: f.id,
      summary: {
        status: 'resolved',
        headline: 'Fixed',
        updatedAt: new Date().toISOString(),
        updatedBy: 'llm'
      }
    });

    const res = await getFeatureRoute(emptyReq(), { params: Promise.resolve({ id: f.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feature.name).toBe('审批');
    expect(body.resolvedCases).toHaveLength(1);
  });

  it('不存在 → 404', async () => {
    const res = await getFeatureRoute(
      emptyReq(),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) }
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/features/:id', () => {
  it('重命名成功', async () => {
    const f = await createFeature({ name: '审批' });
    const res = await patchFeatureRoute(
      jsonReq('PATCH', `http://x/api/features/${f.id}`, { name: '审批流' }),
      { params: Promise.resolve({ id: f.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feature.name).toBe('审批流');
  });

  it('更新 aliases', async () => {
    const f = await createFeature({ name: '审批' });
    const res = await patchFeatureRoute(
      jsonReq('PATCH', `http://x/api/features/${f.id}`, { aliases: ['approval'] }),
      { params: Promise.resolve({ id: f.id }) }
    );
    const body = await res.json();
    expect(body.feature.aliases).toEqual(['approval']);
  });

  it('空 body → 保持不变', async () => {
    const f = await createFeature({ name: '审批' });
    const res = await patchFeatureRoute(
      jsonReq('PATCH', `http://x/api/features/${f.id}`, {}),
      { params: Promise.resolve({ id: f.id }) }
    );
    const body = await res.json();
    expect(body.feature.name).toBe('审批');
  });
});

describe('POST /api/features/:id/refresh-knowledge', () => {
  it('调用 refreshFeatureKnowledge 并返回 feature', async () => {
    const f = await createFeature({ name: '审批' });
    const res = await refreshKnowledge(
      emptyReq(),
      { params: Promise.resolve({ id: f.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feature.id).toBe(f.id);
  });
});

describe('PATCH /api/cases/:id/feature', () => {
  it('成功改变 case 归属 feature', async () => {
    const f = await createFeature({ name: '订单' });
    const c = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });

    const res = await patchCaseFeature(
      jsonReq('PATCH', `http://x/api/cases/${c.id}/feature`, { featureId: f.id }),
      { params: Promise.resolve({ id: c.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.case.featureId).toBe(f.id);
  });

  it('featureId 不存在 → 404', async () => {
    const c = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });
    const res = await patchCaseFeature(
      jsonReq('PATCH', `http://x/api/cases/${c.id}/feature`, {
        featureId: '00000000-0000-0000-0000-000000000000'
      }),
      { params: Promise.resolve({ id: c.id }) }
    );
    expect(res.status).toBe(404);
  });
});
