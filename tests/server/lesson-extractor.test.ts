import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/llm-client', () => ({
  streamLlm: vi.fn()
}));

import { extractLesson } from '@/server/lesson-extractor';
import { streamLlm } from '@/server/llm-client';
import type { Case } from '@/domain/types';

const cfg = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434',
  apiKey: 'test-key',
  model: 'gpt-4'
};

const messages = [
  {
    id: '11111111-0000-0000-0000-000000000001',
    role: 'user' as const,
    createdAt: new Date().toISOString(),
    content: '审批单提交没反应'
  },
  {
    id: '11111111-0000-0000-0000-000000000002',
    role: 'assistant' as const,
    createdAt: new Date().toISOString(),
    content: '问题是字典未加载导致 NPE，修复方法是初始化时预加载字典'
  }
];

const kase: Case = {
  id: '22222222-2222-2222-2222-222222222222',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: 'done',
  problem: {
    actual: '审批单提交没反应',
    expected: '跳转成功页',
    entry: 'POST /approve',
    environment: 'prod'
  },
  evidenceLevel: 'L0',
  pipeline: { currentStep: 'Normalize' as const, steps: [], runIds: [] },
  summary: {
    status: 'resolved',
    headline: '字典未加载导致 NPE',
    rootCause: '字典未初始化',
    fixApproach: '预加载字典',
    updatedAt: new Date().toISOString(),
    updatedBy: 'llm'
  }
};

async function* makeStream(text: string) {
  yield { type: 'text' as const, text };
  yield { type: 'done' as const };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('extractLesson', () => {
  it('成功解析 JSON → 返回 Lesson', async () => {
    const json = JSON.stringify({
      symptomPattern: '字段显示为数字而非中文',
      rootCause: '字典未加载',
      fix: '初始化时调用 dictService.loadAll()'
    });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await extractLesson(cfg, { kase, messages });
    expect(result).not.toBeNull();
    expect(result!.symptomPattern).toBe('字段显示为数字而非中文');
    expect(result!.rootCause).toBe('字典未加载');
    expect(result!.fix).toBe('初始化时调用 dictService.loadAll()');
    expect(result!.extractedAt).toBeTruthy();
  });

  it('malformed JSON → 返回 null，不抛错', async () => {
    vi.mocked(streamLlm).mockImplementation(() => makeStream('not json'));

    const result = await extractLesson(cfg, { kase, messages });
    expect(result).toBeNull();
  });

  it('LLM 报错 → 返回 null，不抛错', async () => {
    async function* errorStream() {
      yield { type: 'error' as const, message: 'timeout' };
    }
    vi.mocked(streamLlm).mockImplementation(() => errorStream());

    const result = await extractLesson(cfg, { kase, messages });
    expect(result).toBeNull();
  });

  it('缺少必要字段 → 返回 null', async () => {
    const json = JSON.stringify({ symptomPattern: '有症状描述' });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await extractLesson(cfg, { kase, messages });
    expect(result).toBeNull();
  });
});
