import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeJsonAtomic, readJson, ensureDir } from '@/server/fs-atomic';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('writeJsonAtomic / readJson', () => {
  it('写入并回读', async () => {
    const file = path.join(tmp, 'x.json');
    await writeJsonAtomic(file, { a: 1 });
    expect(await readJson<{ a: number }>(file)).toEqual({ a: 1 });
  });

  it('目标目录不存在时自动创建', async () => {
    const file = path.join(tmp, 'sub/y.json');
    await writeJsonAtomic(file, { ok: true });
    expect(await readJson(file)).toEqual({ ok: true });
  });

  it('写入过程使用 .tmp 文件再 rename', async () => {
    const file = path.join(tmp, 'z.json');
    await writeJsonAtomic(file, { v: 'ok' });
    const entries = await fs.readdir(tmp);
    expect(entries).toContain('z.json');
    expect(entries.some(e => e.endsWith('.tmp'))).toBe(false);
  });
});

describe('ensureDir', () => {
  it('多级目录', async () => {
    const dir = path.join(tmp, 'a/b/c');
    await ensureDir(dir);
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });
});
