import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { POST as createCaseRoute } from '@/app/api/cases/route';
import { POST as quickIngestRoute } from '@/app/api/cases/[id]/quick-ingest/route';
import { listEvidence } from '@/server/evidence-store';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-qi-api-'));
  process.env.AI_DEBUG_HOME = tmp;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

function jsonReq(body: unknown): NextRequest {
  return new NextRequest('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function mkCase(): Promise<string> {
  const res = await createCaseRoute(jsonReq({
    problem: { actual: 'a', expected: 'b', entry: 'c', environment: 'd' }
  }));
  return (await res.json()).case.id;
}

describe('POST /api/cases/:id/quick-ingest', () => {
  it('returns 400 for missing text field', async () => {
    const caseId = await mkCase();
    const res = await quickIngestRoute(jsonReq({}), { params: Promise.resolve({ id: caseId }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty text', async () => {
    const caseId = await mkCase();
    const res = await quickIngestRoute(jsonReq({ text: '' }), { params: Promise.resolve({ id: caseId }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent case', async () => {
    const res = await quickIngestRoute(
      jsonReq({ text: 'some text' }),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) }
    );
    expect(res.status).toBe(404);
  });

  it('ingests large multiline text and creates N evidence items', async () => {
    const caseId = await mkCase();

    const text = `curl -X GET https://api.example.com/users

{"status":500,"error":"Internal Server Error"}

2024-01-01 ERROR NullPointerException at UserService.java:42

CREATE TABLE orders (id INT PRIMARY KEY, user_id INT);

https://example.com/admin/dashboard

用户点击按钮后出现白屏`;

    const res = await quickIngestRoute(jsonReq({ text }), { params: Promise.resolve({ id: caseId }) });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.createdIds).toHaveLength(6);

    const evs = await listEvidence(caseId);
    expect(evs).toHaveLength(6);

    const types = evs.map(e => e.type);
    expect(types).toContain('curl');
    expect(types).toContain('api-response');
    expect(types).toContain('log');
    expect(types).toContain('schema-sql');
    expect(types).toContain('page-url');
    expect(types).toContain('free-text');
  });

  it('returns 201 with createdIds array for single-block text', async () => {
    const caseId = await mkCase();
    const res = await quickIngestRoute(
      jsonReq({ text: 'ERROR Something went wrong at line 5' }),
      { params: Promise.resolve({ id: caseId }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.createdIds).toHaveLength(1);
  });

  it('all created evidence ids appear in listEvidence', async () => {
    const caseId = await mkCase();
    const text = `curl -X POST /api\n\n{"result":"ok"}`;
    const res = await quickIngestRoute(jsonReq({ text }), { params: Promise.resolve({ id: caseId }) });
    const { createdIds } = await res.json();

    const evs = await listEvidence(caseId);
    const evIds = evs.map(e => e.id);
    for (const id of createdIds) {
      expect(evIds).toContain(id);
    }
  });
});
