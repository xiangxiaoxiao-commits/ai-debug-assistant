import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/llm-client', () => ({
  streamLlm: vi.fn()
}));

import { generatePlaybook } from '@/server/playbook-generator';
import { streamLlm } from '@/server/llm-client';

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

beforeEach(() => { vi.resetAllMocks(); });

describe('generatePlaybook', () => {
  it('正常返回 playbook 含 steps', async () => {
    const json = JSON.stringify({
      steps: [
        { title: '抓接口 cURL', hint: '从浏览器 Network 面板复制' },
        { title: '检查数据库字典表' }
      ]
    });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await generatePlaybook(cfg, { problem });
    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(2);
    expect(result!.steps[0].title).toBe('抓接口 cURL');
    expect(result!.steps[0].hint).toBe('从浏览器 Network 面板复制');
    expect(result!.steps[0].order).toBe(1);
    expect(result!.steps[0].status).toBe('todo');
    expect(result!.steps[0].updatedBy).toBe('llm');
    expect(result!.steps[1].hint).toBeUndefined();
    expect(result!.source).toBe('auto');
  });

  it('malformed JSON → 返回 null', async () => {
    vi.mocked(streamLlm).mockImplementation(() => makeStream('not json'));
    const result = await generatePlaybook(cfg, { problem });
    expect(result).toBeNull();
  });

  it('empty steps array → 返回 null', async () => {
    vi.mocked(streamLlm).mockImplementation(() => makeStream(JSON.stringify({ steps: [] })));
    const result = await generatePlaybook(cfg, { problem });
    expect(result).toBeNull();
  });

  it('steps 超过 6 条 → 截断为 6', async () => {
    const steps = Array.from({ length: 8 }, (_, i) => ({ title: `步骤${i + 1}` }));
    vi.mocked(streamLlm).mockImplementation(() => makeStream(JSON.stringify({ steps })));
    const result = await generatePlaybook(cfg, { problem });
    expect(result!.steps).toHaveLength(6);
  });

  it('LLM error chunk → 返回 null', async () => {
    async function* errorStream() {
      yield { type: 'error' as const, message: 'network error' };
    }
    vi.mocked(streamLlm).mockImplementation(() => errorStream());
    const result = await generatePlaybook(cfg, { problem });
    expect(result).toBeNull();
  });

  it('包含 featureKnowledge 时正常调用', async () => {
    const json = JSON.stringify({ steps: [{ title: '检查根因' }] });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await generatePlaybook(cfg, {
      problem,
      featureKnowledge: {
        commonRootCauses: ['前端字段映射错误'],
        verifiedFixes: [],
        updatedAt: new Date().toISOString(),
        sourceCaseCount: 1
      }
    });
    expect(result).not.toBeNull();
    expect(result!.steps[0].title).toBe('检查根因');
  });
});
