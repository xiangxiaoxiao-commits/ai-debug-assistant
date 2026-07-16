import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/llm-client', () => ({
  streamLlm: vi.fn()
}));

import { findSimilarCases } from '@/server/similarity-search';
import { streamLlm } from '@/server/llm-client';
import type { Case } from '@/domain/types';

const cfg = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434',
  apiKey: 'test-key',
  model: 'gpt-4'
};

const problem = {
  actual: '审批提交后报错',
  expected: '成功跳转',
  entry: 'POST /approve',
  environment: 'prod'
};

function makeCase(id: string, actual: string): Case {
  return {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'done',
    problem: { actual, expected: '正常', entry: '/x', environment: 'test' },
    evidenceLevel: 'L0',
    pipeline: {
      currentStep: 'Normalize' as const,
      steps: [],
      runIds: []
    },
    summary: {
      status: 'resolved',
      headline: `Case ${id} 标题`,
      rootCause: `根因 ${id}`,
      fixApproach: `修复 ${id}`,
      updatedAt: new Date().toISOString(),
      updatedBy: 'llm'
    }
  };
}

async function* makeStream(text: string) {
  yield { type: 'text' as const, text };
  yield { type: 'done' as const };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('findSimilarCases', () => {
  it('候选 ≤ topK 时直接全部返回 score=1', async () => {
    const candidates = [makeCase('aaa', '审批相关问题')];
    const result = await findSimilarCases(cfg, { problem, candidateCases: candidates, topK: 3 });
    expect(result).toHaveLength(1);
    expect(result[0].caseId).toBe('aaa');
    expect(result[0].score).toBe(1);
    // streamLlm should NOT be called
    expect(vi.mocked(streamLlm)).not.toHaveBeenCalled();
  });

  it('候选 > topK 时调用 LLM 返回 top-3', async () => {
    const candidates = ['a', 'b', 'c', 'd'].map(id => makeCase(id, `问题${id}`));
    const json = JSON.stringify([
      { caseId: 'a', score: 0.9, reason: '最相似' },
      { caseId: 'c', score: 0.7, reason: '比较相似' },
      { caseId: 'b', score: 0.5, reason: '一般' }
    ]);
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await findSimilarCases(cfg, { problem, candidateCases: candidates, topK: 3 });
    expect(result).toHaveLength(3);
    expect(result[0].caseId).toBe('a');
    expect(result[0].score).toBe(0.9);
  });

  it('LLM 返回 malformed → fallback 前 topK 条 score=0.5，不抛错', async () => {
    const candidates = ['a', 'b', 'c', 'd'].map(id => makeCase(id, `问题${id}`));
    vi.mocked(streamLlm).mockImplementation(() => makeStream('not json'));

    const result = await findSimilarCases(cfg, { problem, candidateCases: candidates, topK: 3 });
    expect(result).toHaveLength(3);
    expect(result.every(r => r.score === 0.5)).toBe(true);
  });

  it('topK 默认为 3', async () => {
    const candidates = ['a', 'b', 'c', 'd', 'e'].map(id => makeCase(id, `问题${id}`));
    const json = JSON.stringify([
      { caseId: 'a', score: 0.9, reason: 'r' },
      { caseId: 'b', score: 0.8, reason: 'r' },
      { caseId: 'c', score: 0.7, reason: 'r' }
    ]);
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await findSimilarCases(cfg, { problem, candidateCases: candidates });
    expect(result).toHaveLength(3);
  });

  it('LLM 报错 → fallback 前 topK，不抛错', async () => {
    const candidates = ['a', 'b', 'c', 'd'].map(id => makeCase(id, `问题${id}`));
    async function* errorStream() {
      yield { type: 'error' as const, message: 'timeout' };
    }
    vi.mocked(streamLlm).mockImplementation(() => errorStream());

    const result = await findSimilarCases(cfg, { problem, candidateCases: candidates, topK: 3 });
    expect(result).toHaveLength(3);
    expect(result.every(r => r.score === 0.5)).toBe(true);
  });
});
