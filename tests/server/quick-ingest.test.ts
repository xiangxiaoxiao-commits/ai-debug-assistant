import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { quickIngest } from '@/server/quick-ingest';
import { addEvidence, listEvidence } from '@/server/evidence-store';
import { createCase } from '@/server/case-store';

let tmp: string;
let caseId: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-qi-'));
  process.env.AI_DEBUG_HOME = tmp;

  const kase = await createCase({
    problem: { actual: 'x', expected: 'y', entry: 'z', environment: 'test' }
  });
  caseId = kase.id;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

describe('quickIngest — type detection', () => {
  it('detects curl block', async () => {
    const { createdIds } = await quickIngest(caseId, 'curl -X POST https://api.example.com/users -H "Content-Type: application/json"');
    const evs = await listEvidence(caseId);
    const ev = evs.find(e => createdIds.includes(e.id))!;
    expect(ev.type).toBe('curl');
  });

  it('detects JSON api-response', async () => {
    const { createdIds } = await quickIngest(caseId, '{"status":500,"error":"Internal Server Error","path":"/api/users"}');
    const evs = await listEvidence(caseId);
    const ev = evs.find(e => createdIds.includes(e.id))!;
    expect(ev.type).toBe('api-response');
  });

  it('detects SQL schema', async () => {
    const { createdIds } = await quickIngest(caseId, 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(255));');
    const evs = await listEvidence(caseId);
    const ev = evs.find(e => createdIds.includes(e.id))!;
    expect(ev.type).toBe('schema-sql');
  });

  it('detects ALTER TABLE as schema-sql', async () => {
    const { createdIds } = await quickIngest(caseId, 'ALTER TABLE users ADD COLUMN email VARCHAR(255);');
    const evs = await listEvidence(caseId);
    const ev = evs.find(e => createdIds.includes(e.id))!;
    expect(ev.type).toBe('schema-sql');
  });

  it('detects log with ERROR keyword', async () => {
    const { createdIds } = await quickIngest(caseId, '2024-01-01 12:00:00 ERROR UserService.java:42 NullPointerException');
    const evs = await listEvidence(caseId);
    const ev = evs.find(e => createdIds.includes(e.id))!;
    expect(ev.type).toBe('log');
  });

  it('detects Java stacktrace as log', async () => {
    const text = `java.lang.NullPointerException: Cannot invoke method
\tat com.example.UserService.getUser(UserService.java:42)
\tat com.example.Controller.handle(Controller.java:18)`;
    const { createdIds } = await quickIngest(caseId, text);
    const evs = await listEvidence(caseId);
    const ev = evs.find(e => createdIds.includes(e.id))!;
    expect(ev.type).toBe('log');
  });

  it('detects URL alone on first line as page-url', async () => {
    const { createdIds } = await quickIngest(caseId, 'https://example.com/admin/users?page=2');
    const evs = await listEvidence(caseId);
    const ev = evs.find(e => createdIds.includes(e.id))!;
    expect(ev.type).toBe('page-url');
  });

  it('falls back to free-text for Chinese text', async () => {
    const { createdIds } = await quickIngest(caseId, '用户登录后点击保存按钮，系统提示"保存失败"');
    const evs = await listEvidence(caseId);
    const ev = evs.find(e => createdIds.includes(e.id))!;
    expect(ev.type).toBe('free-text');
  });

  it('falls back to free-text for ambiguous content', async () => {
    const { createdIds } = await quickIngest(caseId, 'some random text without clear signals');
    const evs = await listEvidence(caseId);
    const ev = evs.find(e => createdIds.includes(e.id))!;
    expect(ev.type).toBe('free-text');
  });
});

describe('quickIngest — splitting', () => {
  it('splits on blank lines and creates multiple evidence items', async () => {
    const text = `curl -X GET https://api.example.com/users

{"status":200,"data":[]}

ERROR NullPointerException at line 42`;

    const { createdIds } = await quickIngest(caseId, text);
    expect(createdIds).toHaveLength(3);

    const evs = await listEvidence(caseId);
    const types = evs.map(e => e.type);
    expect(types).toContain('curl');
    expect(types).toContain('api-response');
    expect(types).toContain('log');
  });

  it('ignores blank-only chunks', async () => {
    const text = `curl -X GET https://api.example.com\n\n\n   \n\n{"status":200}`;
    const { createdIds } = await quickIngest(caseId, text);
    expect(createdIds).toHaveLength(2);
  });

  it('returns empty array for blank text', async () => {
    const { createdIds } = await quickIngest(caseId, '   \n\n   ');
    expect(createdIds).toHaveLength(0);
  });
});
