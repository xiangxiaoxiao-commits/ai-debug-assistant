import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { writeSavedConfig } from '@/server/config-store';

vi.mock('@/server/feature-classifier', () => ({
  classifyFeature: vi.fn()
}));
vi.mock('@/server/similarity-search', () => ({
  findSimilarCases: vi.fn()
}));

import { POST as postCase } from '@/app/api/cases/route';
import { classifyFeature } from '@/server/feature-classifier';
import { findSimilarCases } from '@/server/similarity-search';

const cfg = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434',
  apiKey: 'test-key',
  model: 'gpt-4'
};

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-cases-feat-'));
  process.env.AI_DEBUG_HOME = tmp;
  vi.resetAllMocks();
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

function jsonReq(body: unknown): NextRequest {
  return new NextRequest('http://x/api/cases', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

const validInput = {
  problem: { actual: '审批提交报错', expected: '跳转成功页', entry: 'POST /approve', environment: 'prod' }
};

describe('POST /api/cases — feature classification', () => {
  it('无 config 时仍创建 case，featureId 为 undefined', async () => {
    // No config written
    const res = await postCase(jsonReq(validInput));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.case).toBeDefined();
    expect(body.case.featureId).toBeUndefined();
    expect(body.warnings).toBeDefined();
  });

  it('有 config + 分类成功 → case.featureId 设置为新创建的 feature', async () => {
    await writeSavedConfig(cfg);
    vi.mocked(classifyFeature).mockResolvedValue({
      featureName: '审批',
      matchedExistingId: undefined,
      confidence: 0.9,
      reasoning: '明显审批'
    });
    vi.mocked(findSimilarCases).mockResolvedValue([]);

    const res = await postCase(jsonReq(validInput));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.case.featureId).toBeDefined();
    expect(body.feature?.name).toBe('审批');
    expect(body.relatedCases).toEqual([]);
  });

  it('分类器返回已有模块 id → 使用该 id', async () => {
    await writeSavedConfig(cfg);
    // Pre-create a feature
    const { createFeature } = await import('@/server/feature-store');
    const f = await createFeature({ name: '审批' });

    vi.mocked(classifyFeature).mockResolvedValue({
      featureName: '审批',
      matchedExistingId: f.id,
      confidence: 0.95,
      reasoning: 'match'
    });
    vi.mocked(findSimilarCases).mockResolvedValue([]);

    const res = await postCase(jsonReq(validInput));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.case.featureId).toBe(f.id);
  });

  it('分类器抛错 → case 仍然创建，warnings 非空', async () => {
    await writeSavedConfig(cfg);
    vi.mocked(classifyFeature).mockRejectedValue(new Error('LLM unavailable'));

    const res = await postCase(jsonReq(validInput));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.case).toBeDefined();
    expect(body.warnings).toHaveLength(1);
  });
});
