import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';

vi.mock('@/server/llm-client', () => ({
  streamLlm: vi.fn(),
  modelSupportsVision: () => false
}));

import { POST as postCase } from '@/app/api/cases/route';
import { streamLlm } from '@/server/llm-client';
import { writeSavedConfig } from '@/server/config-store';
import { getCase } from '@/server/case-store';
import { findProjectByRepoPath, listProjects } from '@/memory/project-store';
import { listMemories } from '@/memory/memory-store';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-cm-'));
  process.env.AI_DEBUG_HOME = tmp;
  vi.resetAllMocks();
});

afterEach(async () => {
  // Give any fire-and-forget writes time to settle.
  await new Promise(r => setTimeout(r, 100));
  for (let i = 0; i < 3; i++) {
    try {
      await fs.rm(tmp, { recursive: true, force: true });
      break;
    } catch (e) {
      if (i === 2) throw e;
      await new Promise(r => setTimeout(r, 50));
    }
  }
  delete process.env.AI_DEBUG_HOME;
});

function jsonReq(body: unknown): NextRequest {
  return new NextRequest('http://x/api/cases', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// Never-yielding generator — so classify/similarity/playbook all fail fast
// and the test focuses on the Project resolution path (which is pure local).
async function* emptyStream() {
  yield { type: 'done' as const };
}

describe('POST /api/cases — memory integration', () => {
  it('无配置时也会挂 projectId（若给了 repoPath）', async () => {
    const res = await postCase(jsonReq({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' },
      meta: { repoPath: '/tmp/my-repo' }
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.case.projectId).toBeTruthy();

    // Project got created under that repoPath
    const project = await findProjectByRepoPath('/tmp/my-repo');
    expect(project).toBeTruthy();
    expect(body.case.projectId).toBe(project!.id);
  });

  it('无 repoPath 但有 module → 也建 project', async () => {
    const res = await postCase(jsonReq({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' },
      meta: { module: 'billing' }
    }));
    const body = await res.json();
    expect(body.case.projectId).toBeTruthy();
    const projects = await listProjects();
    expect(projects.some(p => p.name === 'billing')).toBe(true);
  });

  it('无 repoPath 无 module → 归入默认「未归属」项目', async () => {
    const res = await postCase(jsonReq({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
    }));
    const body = await res.json();
    expect(body.case.projectId).toBeTruthy();
    const projects = await listProjects();
    expect(projects.some(p => p.name === '未归属')).toBe(true);
  });

  it('相同 repoPath 的第二个 case 复用同一 project', async () => {
    const r1 = await postCase(jsonReq({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' },
      meta: { repoPath: '/tmp/shared-repo' }
    }));
    const r2 = await postCase(jsonReq({
      problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'w' },
      meta: { repoPath: '/tmp/shared-repo' }
    }));
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.case.projectId).toBe(b2.case.projectId);
    // memory-count starts at 0 (no memory has been remembered yet)
    const projects = await listProjects();
    expect(projects.length).toBe(1);
  });

  it('有 config 时也不阻塞 case 创建（LLM 完全 fail 也照样返回 case + projectId）', async () => {
    await writeSavedConfig({ provider: 'openai-compatible', baseUrl: 'http://x', apiKey: 'k', model: 'm' });
    vi.mocked(streamLlm).mockImplementation(() => emptyStream());

    const res = await postCase(jsonReq({
      problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' },
      meta: { repoPath: '/tmp/with-cfg' }
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.case.projectId).toBeTruthy();

    const kase = await getCase(body.case.id);
    expect(kase.projectId).toBe(body.case.projectId);

    // No memories written just because a case was created — memories only
    // arrive via explicit remember() or via resolved-status promotion.
    const mems = await listMemories(body.case.projectId!);
    expect(mems).toHaveLength(0);
  });
});
