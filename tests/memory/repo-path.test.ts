import { describe, it, expect } from 'vitest';
import os from 'node:os';
import { normalizeRepoPath, repoBasename } from '@/memory/repo-path';

describe('normalizeRepoPath', () => {
  it('undefined / empty → undefined', () => {
    expect(normalizeRepoPath(undefined)).toBeUndefined();
    expect(normalizeRepoPath('')).toBeUndefined();
    expect(normalizeRepoPath('   ')).toBeUndefined();
  });

  it('~ expands to home', () => {
    const out = normalizeRepoPath('~/work/x');
    expect(out).toBe(`${os.homedir()}/work/x`);
  });

  it('strips trailing slash', () => {
    expect(normalizeRepoPath('/tmp/x/')).toBe('/tmp/x');
    expect(normalizeRepoPath('/tmp/x///')).toBe('/tmp/x');
  });

  it('resolves relative paths', () => {
    const out = normalizeRepoPath('./foo');
    expect(out?.endsWith('/foo')).toBe(true);
    expect(out?.startsWith('/')).toBe(true);
  });
});

describe('repoBasename', () => {
  it('returns last path segment', () => {
    expect(repoBasename('/a/b/c')).toBe('c');
    expect(repoBasename('/a')).toBe('a');
  });
});
