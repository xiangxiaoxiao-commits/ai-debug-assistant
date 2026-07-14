import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { POST as createCaseRoute } from '@/app/api/cases/route';
import { POST as addEvidenceRoute } from '@/app/api/cases/[id]/evidence/route';
import { DELETE as delEvidenceRoute } from '@/app/api/cases/[id]/evidence/[evidenceId]/route';
import { GET as exportRoute } from '@/app/api/cases/[id]/export/route';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-evapi-'));
  process.env.AI_DEBUG_HOME = tmp;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

function ejsonReq(body: unknown): NextRequest {
  return new NextRequest('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function emptyReq(): NextRequest {
  return new NextRequest('http://x/api');
}

async function mkCase() {
  const res = await createCaseRoute(ejsonReq({ problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' } }));
  return (await res.json()).case;
}

describe('evidence API', () => {
  it('POST 添加 curl 后 evidenceLevel → L2', async () => {
    const c = await mkCase();
    const res = await addEvidenceRoute(ejsonReq({ type: 'curl', content: 'curl x' }), { params: Promise.resolve({ id: c.id }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.evidence.type).toBe('curl');
    expect(body.case.evidenceLevel).toBe('L2');
  });

  it('POST 添加 ticket 后 evidenceLevel → L1', async () => {
    const c = await mkCase();
    const res = await addEvidenceRoute(ejsonReq({ type: 'ticket-text', content: 'PLJI-1' }), { params: Promise.resolve({ id: c.id }) });
    const body = await res.json();
    expect(body.case.evidenceLevel).toBe('L1');
  });

  it('DELETE 后级别回落', async () => {
    const c = await mkCase();
    const added = await (await addEvidenceRoute(ejsonReq({ type: 'curl', content: 'x' }), { params: Promise.resolve({ id: c.id }) })).json();
    const res = await delEvidenceRoute(emptyReq(), { params: Promise.resolve({ id: c.id, evidenceId: added.evidence.id }) });
    const body = await res.json();
    expect(body.case.evidenceLevel).toBe('L0');
  });

  it('导出 JSON 包含 case + evidence', async () => {
    const c = await mkCase();
    await addEvidenceRoute(ejsonReq({ type: 'log', content: 'ERROR foo' }), { params: Promise.resolve({ id: c.id }) });
    const res = await exportRoute(emptyReq(), { params: Promise.resolve({ id: c.id }) });
    const body = await res.json();
    expect(body.schemaVersion).toBe('1.0');
    expect(body.case.id).toBe(c.id);
    expect(body.evidence).toHaveLength(1);
  });
});
