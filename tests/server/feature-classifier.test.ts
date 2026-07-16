import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/llm-client', () => ({
  streamLlm: vi.fn()
}));

import { classifyFeature } from '@/server/feature-classifier';
import { streamLlm } from '@/server/llm-client';
import type { Feature } from '@/domain/types';

const cfg = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434',
  apiKey: 'test-key',
  model: 'gpt-4'
};

const problem = {
  actual: '审批单提交后无响应',
  expected: '跳转到成功页',
  entry: 'POST /api/approve',
  environment: 'production'
};

async function* makeStream(text: string) {
  yield { type: 'text' as const, text };
  yield { type: 'done' as const };
}

const existingFeatures: Feature[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: '审批',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    bugCount: 3,
    resolvedCount: 2
  }
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe('classifyFeature', () => {
  it('成功匹配已有模块 → 返回 matchedExistingId', async () => {
    const json = JSON.stringify({
      featureName: '审批',
      matchedExistingId: '11111111-1111-1111-1111-111111111111',
      confidence: 0.9,
      reasoning: '明显属于审批模块'
    });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await classifyFeature(cfg, { problem, existingFeatures });
    expect(result.featureName).toBe('审批');
    expect(result.matchedExistingId).toBe('11111111-1111-1111-1111-111111111111');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('提议新模块名 → matchedExistingId 为 undefined', async () => {
    const json = JSON.stringify({
      featureName: '订单支付',
      matchedExistingId: null,
      confidence: 0.8,
      reasoning: '和支付有关'
    });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await classifyFeature(cfg, { problem, existingFeatures });
    expect(result.featureName).toBe('订单支付');
    expect(result.matchedExistingId).toBeUndefined();
  });

  it('malformed JSON → fallback 未分类，不抛错', async () => {
    vi.mocked(streamLlm).mockImplementation(() => makeStream('not json'));

    const result = await classifyFeature(cfg, { problem, existingFeatures });
    expect(result.featureName).toBe('未分类');
    expect(result.confidence).toBe(0);
  });

  it('LLM 报错 → fallback 未分类，不抛错', async () => {
    async function* errorStream() {
      yield { type: 'error' as const, message: 'network error' };
    }
    vi.mocked(streamLlm).mockImplementation(() => errorStream());

    const result = await classifyFeature(cfg, { problem, existingFeatures });
    expect(result.featureName).toBe('未分类');
    expect(result.confidence).toBe(0);
  });

  it('空 existingFeatures → 仍然返回 featureName', async () => {
    const json = JSON.stringify({
      featureName: '登录',
      matchedExistingId: null,
      confidence: 0.75,
      reasoning: '登录相关'
    });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await classifyFeature(cfg, { problem, existingFeatures: [] });
    expect(result.featureName).toBe('登录');
  });
});
