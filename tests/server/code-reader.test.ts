import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readCodeContext } from '@/server/code-reader';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.homedir(), '.ai-debug-cr-test-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function write(relPath: string, content: string) {
  const abs = path.join(tmp, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');
}

describe('readCodeContext', () => {
  it('finds files matching keywords', async () => {
    await write('src/UserController.java', 'public class UserController { getUserById() {} }');
    await write('src/OrderService.java', 'public class OrderService { createOrder() {} }');

    const result = await readCodeContext({
      repoPath: tmp,
      keywords: ['UserController', 'getUserById']
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.snippets.length).toBeGreaterThanOrEqual(1);
    const paths = result.snippets.map(s => s.path);
    expect(paths.some(p => p.includes('UserController'))).toBe(true);
  });

  it('ignores node_modules directory', async () => {
    await write('node_modules/some-lib/index.ts', 'export const foo = "getUserById"');
    await write('src/main.ts', 'getUserById();');

    const result = await readCodeContext({ repoPath: tmp, keywords: ['getUserById'] });

    const paths = result.snippets.map(s => s.path);
    expect(paths.every(p => !p.includes('node_modules'))).toBe(true);
  });

  it('ignores .git directory', async () => {
    await write('.git/COMMIT_EDITMSG', 'getUserById fix');
    await write('src/main.ts', 'getUserById();');

    const result = await readCodeContext({ repoPath: tmp, keywords: ['getUserById'] });

    const paths = result.snippets.map(s => s.path);
    expect(paths.every(p => !p.startsWith('.git'))).toBe(true);
  });

  it('ignores .env files', async () => {
    await write('.env', 'API_KEY=secret getUserById');
    await write('.env.local', 'DB_PASS=xxx getUserById');
    await write('src/main.ts', 'getUserById();');

    const result = await readCodeContext({ repoPath: tmp, keywords: ['getUserById'] });

    const paths = result.snippets.map(s => s.path);
    expect(paths.every(p => !p.startsWith('.env'))).toBe(true);
  });

  it('ignores .pem and .key files', async () => {
    await write('certs/server.pem', 'BEGIN CERTIFICATE getUserById');
    await write('certs/server.key', 'BEGIN PRIVATE KEY getUserById');
    await write('src/main.ts', 'getUserById();');

    const result = await readCodeContext({ repoPath: tmp, keywords: ['getUserById'] });

    const paths = result.snippets.map(s => s.path);
    expect(paths.every(p => !p.endsWith('.pem') && !p.endsWith('.key'))).toBe(true);
  });

  it('ignores credentials files', async () => {
    await write('config/credentials.json', '{"secret": "getUserById"}');
    await write('src/main.ts', 'getUserById();');

    const result = await readCodeContext({ repoPath: tmp, keywords: ['getUserById'] });

    const paths = result.snippets.map(s => s.path);
    expect(paths.every(p => !p.includes('credentials'))).toBe(true);
  });

  it('respects maxFiles limit', async () => {
    for (let i = 0; i < 10; i++) {
      await write(`src/File${i}.ts`, `keyword${i} sharedKeyword`);
    }

    const result = await readCodeContext({
      repoPath: tmp,
      keywords: ['sharedKeyword'],
      maxFiles: 3
    });

    expect(result.snippets.length).toBeLessThanOrEqual(3);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it('truncates files exceeding maxBytesPerFile', async () => {
    const bigContent = 'x'.repeat(20000) + ' targetKeyword ' + 'y'.repeat(20000);
    await write('src/big.ts', bigContent);

    const result = await readCodeContext({
      repoPath: tmp,
      keywords: ['targetKeyword'],
      maxBytesPerFile: 1000
    });

    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0].content).toContain('[truncated');
    expect(result.snippets[0].content.length).toBeLessThan(bigContent.length);
  });

  it('prefers files matching more keywords', async () => {
    await write('src/alpha.ts', 'keyA keyB keyC content here');
    await write('src/beta.ts', 'keyA content');

    const result = await readCodeContext({
      repoPath: tmp,
      keywords: ['keyA', 'keyB', 'keyC'],
      maxFiles: 1
    });

    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0].path).toContain('alpha');
  });

  it('returns warning and empty snippets for non-existent path', async () => {
    const result = await readCodeContext({
      repoPath: path.join(tmp, 'nonexistent'),
      keywords: ['anything']
    });

    expect(result.snippets).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('not found'))).toBe(true);
  });

  it('rejects /etc path for safety', async () => {
    const result = await readCodeContext({
      repoPath: '/etc',
      keywords: ['passwd']
    });

    expect(result.snippets).toHaveLength(0);
    expect(result.warnings.some(w => w.toLowerCase().includes('reject') || w.toLowerCase().includes('safe'))).toBe(true);
  });

  it('reads git branch and commit from .git dir', async () => {
    await write('.git/HEAD', 'ref: refs/heads/main\n');
    await write('.git/refs/heads/main', 'abc1234567890abcdef1234567890abcdef12345\n');
    await write('src/main.ts', 'branchKeyword();');

    const result = await readCodeContext({ repoPath: tmp, keywords: ['branchKeyword'] });

    expect(result.branch).toBe('main');
    expect(result.commit).toBe('abc1234567890abcdef1234567890abcdef12345');
  });

  it('handles detached HEAD (bare commit hash)', async () => {
    await write('.git/HEAD', 'deadbeef1234567890abcdef1234567890abcdef\n');
    await write('src/main.ts', 'detachedKeyword();');

    const result = await readCodeContext({ repoPath: tmp, keywords: ['detachedKeyword'] });

    expect(result.branch).toBeUndefined();
    expect(result.commit).toBe('deadbeef1234567890abcdef1234567890abcdef');
  });

  it('returns no git info when .git is absent', async () => {
    await write('src/main.ts', 'noGitKeyword();');

    const result = await readCodeContext({ repoPath: tmp, keywords: ['noGitKeyword'] });

    expect(result.branch).toBeUndefined();
    expect(result.commit).toBeUndefined();
  });
});
