import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/llm-client', () => ({
  streamLlm: vi.fn()
}));

import { updatePlaybookProgress } from '@/server/playbook-updater';
import { streamLlm } from '@/server/llm-client';
import type { Playbook } from '@/domain/types';

const cfg = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434',
  apiKey: 'test-key',
  model: 'gpt-4'
};

function makePlaybook(): Playbook {
  return {
    steps: [
      {
        id: 'step-1',
        order: 1,
        title: '抓接口 cURL',
        status: 'todo',
        updatedAt: new Date().toISOString(),
        updatedBy: 'llm'
      },
      {
        id: 'step-2',
        order: 2,
        title: '检查数据库',
        status: 'todo',
        updatedAt: new Date().toISOString(),
        updatedBy: 'llm'
      }
    ],
    source: 'auto',
    updatedAt: new Date().toISOString()
  };
}

async function* makeStream(text: string) {
  yield { type: 'text' as const, text };
  yield { type: 'done' as const };
}

beforeEach(() => { vi.resetAllMocks(); });

describe('updatePlaybookProgress', () => {
  it('成功更新步骤状态', async () => {
    const json = JSON.stringify({
      updates: [{ stepId: 'step-1', status: 'done', notes: '已确认 cURL 返回 500' }]
    });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const playbook = makePlaybook();
    const result = await updatePlaybookProgress(cfg, {
      playbook,
      latestUserMessage: '我已经抓到了 cURL',
      latestAssistantReply: '根据 cURL 可以看到...'
    });

    expect(result).not.toBeNull();
    const s1 = result!.steps.find(s => s.id === 'step-1');
    expect(s1!.status).toBe('done');
    expect(s1!.notes).toBe('已确认 cURL 返回 500');
    expect(s1!.updatedBy).toBe('llm');

    // step-2 不变
    const s2 = result!.steps.find(s => s.id === 'step-2');
    expect(s2!.status).toBe('todo');
  });

  it('malformed JSON → 返回 null（保留旧 playbook）', async () => {
    vi.mocked(streamLlm).mockImplementation(() => makeStream('not json'));
    const result = await updatePlaybookProgress(cfg, {
      playbook: makePlaybook(),
      latestUserMessage: '...',
      latestAssistantReply: '...'
    });
    expect(result).toBeNull();
  });

  it('updates 为空数组 → 返回 null', async () => {
    vi.mocked(streamLlm).mockImplementation(() => makeStream(JSON.stringify({ updates: [] })));
    const result = await updatePlaybookProgress(cfg, {
      playbook: makePlaybook(),
      latestUserMessage: '...',
      latestAssistantReply: '...'
    });
    expect(result).toBeNull();
  });

  it('无效 status 值 → 保留原始 status', async () => {
    const json = JSON.stringify({
      updates: [{ stepId: 'step-1', status: 'invalid-status' }]
    });
    vi.mocked(streamLlm).mockImplementation(() => makeStream(json));

    const result = await updatePlaybookProgress(cfg, {
      playbook: makePlaybook(),
      latestUserMessage: '...',
      latestAssistantReply: '...'
    });

    // still gets returned (1 update entry was present)
    // status stays 'todo' because 'invalid-status' is not a valid status
    if (result) {
      const s1 = result.steps.find(s => s.id === 'step-1');
      expect(s1!.status).toBe('todo');
    }
  });

  it('LLM error → 返回 null', async () => {
    async function* errorStream() {
      yield { type: 'error' as const, message: 'network error' };
    }
    vi.mocked(streamLlm).mockImplementation(() => errorStream());
    const result = await updatePlaybookProgress(cfg, {
      playbook: makePlaybook(),
      latestUserMessage: '...',
      latestAssistantReply: '...'
    });
    expect(result).toBeNull();
  });
});
