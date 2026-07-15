import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BugSummary } from '@/domain/types';

vi.mock('@/server/llm-client', () => ({
  streamLlm: vi.fn()
}));

import { extractSummary } from '@/server/summary-extractor';
import { streamLlm } from '@/server/llm-client';

const cfg = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434',
  apiKey: 'test-key',
  model: 'gpt-4'
};

const problem = {
  actual: 'NullPointerException in UserService',
  expected: 'return user list',
  entry: 'GET /api/users',
  environment: 'production'
};

async function* makeStream(text: string) {
  yield { type: 'text' as const, text };
  yield { type: 'done' as const };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('extractSummary', () => {
  it('成功解析 JSON → 返回完整 BugSummary', async () => {
    const json = JSON.stringify({
      status: 'investigating',
      headline: 'NPE in UserService',
      rootCause: '未做 null 检查',
      fixApproach: '在方法入口添加 null 检查',
      verified: false,
      verificationNotes: ''
    });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await extractSummary(cfg, {
      problem,
      latestAssistantReply: '## 一句话结论\nNPE in UserService'
    });

    expect(result.status).toBe('investigating');
    expect(result.headline).toBe('NPE in UserService');
    expect(result.rootCause).toBe('未做 null 检查');
    expect(result.fixApproach).toBe('在方法入口添加 null 检查');
    expect(result.verified).toBe(false);
    expect(result.updatedBy).toBe('llm');
    expect(result.updatedAt).toBeTruthy();
  });

  it('JSON 带有前缀文字 → 仍能提取', async () => {
    const text = '以下是摘要：\n' + JSON.stringify({
      status: 'resolved',
      headline: 'Fixed NPE'
    });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(text));

    const result = await extractSummary(cfg, {
      problem,
      latestAssistantReply: 'Fixed it'
    });

    expect(result.status).toBe('resolved');
    expect(result.headline).toBe('Fixed NPE');
  });

  it('malformed JSON → 回退到 fallback，不抛错', async () => {
    vi.mocked(streamLlm).mockImplementation(() => makeStream('not json at all'));

    const result = await extractSummary(cfg, {
      problem,
      latestAssistantReply: 'some reply'
    });

    // Should return fallback without throwing
    expect(result).toBeDefined();
    expect(['open', 'investigating', 'resolved', 'wont-fix']).toContain(result.status);
  });

  it('返回当前 summary 作为 fallback（JSON 解析失败时）', async () => {
    vi.mocked(streamLlm).mockImplementation(() => makeStream('{invalid'));

    const currentSummary: BugSummary = {
      status: 'open',
      headline: '已有结论',
      updatedAt: new Date().toISOString(),
      updatedBy: 'user'
    };

    const result = await extractSummary(cfg, {
      problem,
      latestAssistantReply: 'some reply',
      currentSummary
    });

    expect(result.status).toBe('open');
    expect(result.headline).toBe('已有结论');
    expect(result.updatedBy).toBe('user');
  });

  it('LLM 报错 → 回退到 fallback，不抛错', async () => {
    async function* errorStream() {
      yield { type: 'error' as const, message: 'timeout' };
    }
    vi.mocked(streamLlm).mockImplementation(() => errorStream());

    const result = await extractSummary(cfg, {
      problem,
      latestAssistantReply: 'x'
    });

    expect(result).toBeDefined();
    expect(['open', 'investigating', 'resolved', 'wont-fix']).toContain(result.status);
  });

  it('非法 status 值 → 降级为 investigating', async () => {
    vi.mocked(streamLlm).mockImplementation(() =>
      makeStream(JSON.stringify({ status: 'broken-status', headline: 'test' }))
    );

    const result = await extractSummary(cfg, {
      problem,
      latestAssistantReply: 'x'
    });

    expect(result.status).toBe('investigating');
  });
});
