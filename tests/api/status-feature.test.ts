import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { createCase, updateCase } from '@/server/case-store';
import { createFeature, getFeature } from '@/server/feature-store';
import { writeSavedConfig } from '@/server/config-store';

vi.mock('@/server/lesson-extractor', () => ({
  extractLesson: vi.fn()
}));
vi.mock('@/server/knowledge-builder', () => ({
  refreshFeatureKnowledge: vi.fn()
}));

import { PATCH } from '@/app/api/cases/[id]/status/route';
import { extractLesson } from '@/server/lesson-extractor';
import { refreshFeatureKnowledge } from '@/server/knowledge-builder';

const cfg = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434',
  apiKey: 'test-key',
  model: 'gpt-4'
};

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-status-feat-'));
  process.env.AI_DEBUG_HOME = tmp;
  vi.resetAllMocks();
});
afterEach(async () => {
  // Retry a couple times: fire-and-forget lesson extraction may still be
  // touching features/ when cleanup starts.
  for (let i = 0; i < 3; i++) {
    try {
      await fs.rm(tmp, { recursive: true, force: true });
      break;
    } catch (e) {
      if (i === 2) throw e;
      await new Promise(r => setTimeout(r, 30));
    }
  }
  delete process.env.AI_DEBUG_HOME;
});

function patchReq(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://x/api/cases/${id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('PATCH /status — feature integration', () => {
  it('resolved 转换 → 调用 extractLesson + refreshFeatureKnowledge', async () => {
    await writeSavedConfig(cfg);
    const feature = await createFeature({ name: '审批' });
    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });
    await updateCase({ ...kase, featureId: feature.id });

    vi.mocked(extractLesson).mockResolvedValue({
      symptomPattern: '审批报错',
      rootCause: '字典未加载',
      fix: '预加载字典',
      extractedAt: new Date().toISOString()
    });
    vi.mocked(refreshFeatureKnowledge).mockResolvedValue({ ...feature, resolvedCount: 1 });

    const res = await PATCH(
      patchReq(kase.id, { status: 'resolved' }),
      { params: Promise.resolve({ id: kase.id }) }
    );
    expect(res.status).toBe(200);

    // Give fire-and-forget a tick to complete
    await new Promise(r => setTimeout(r, 50));
    expect(vi.mocked(extractLesson)).toHaveBeenCalled();
    expect(vi.mocked(refreshFeatureKnowledge)).toHaveBeenCalledWith(feature.id, cfg);
  });

  it('resolved 转换 → feature.resolvedCount 递增', async () => {
    await writeSavedConfig(cfg);
    const feature = await createFeature({ name: '审批' });
    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });
    await updateCase({ ...kase, featureId: feature.id });

    vi.mocked(extractLesson).mockResolvedValue(null);
    vi.mocked(refreshFeatureKnowledge).mockResolvedValue({ ...feature, resolvedCount: 1 });

    await PATCH(
      patchReq(kase.id, { status: 'resolved' }),
      { params: Promise.resolve({ id: kase.id }) }
    );
    await new Promise(r => setTimeout(r, 50));

    // incrementFeatureStats should have been called (resolvedCount goes up)
    const updatedFeature = await getFeature(feature.id);
    expect(updatedFeature.resolvedCount).toBe(1);
  });

  it('无 featureId 的 case resolved → 不调用 refreshFeatureKnowledge', async () => {
    await writeSavedConfig(cfg);
    const kase = await createCase({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
    });

    vi.mocked(extractLesson).mockResolvedValue(null);

    await PATCH(
      patchReq(kase.id, { status: 'resolved' }),
      { params: Promise.resolve({ id: kase.id }) }
    );
    await new Promise(r => setTimeout(r, 50));

    expect(vi.mocked(refreshFeatureKnowledge)).not.toHaveBeenCalled();
  });

  it('extractLesson 抛错 → 状态仍然正确更新', async () => {
    await writeSavedConfig(cfg);
    const feature = await createFeature({ name: '审批' });
    const kase = await createCase({
      problem: { actual: 'crash', expected: 'ok', entry: '/api', environment: 'prod' }
    });
    await updateCase({ ...kase, featureId: feature.id });

    vi.mocked(extractLesson).mockRejectedValue(new Error('LLM failure'));
    vi.mocked(refreshFeatureKnowledge).mockResolvedValue(feature);

    const res = await PATCH(
      patchReq(kase.id, { status: 'resolved' }),
      { params: Promise.resolve({ id: kase.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.status).toBe('resolved');

    // Let the fire-and-forget rejection settle before cleanup
    await new Promise(r => setTimeout(r, 50));
  });
});
