import path from 'node:path';
import os from 'node:os';

/** Normalize a user-supplied repo path to an absolute, canonical form. */
export function normalizeRepoPath(p: string | undefined | null): string | undefined {
  if (!p) return undefined;
  const trimmed = p.trim();
  if (!trimmed) return undefined;
  const expanded = trimmed.startsWith('~') ? path.join(os.homedir(), trimmed.slice(1)) : trimmed;
  const resolved = path.resolve(expanded);
  return resolved.replace(/\/+$/, '');
}

/** Derive a display name from a repo path — last non-empty path segment. */
export function repoBasename(p: string): string {
  return path.basename(p) || 'project';
}
