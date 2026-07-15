import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface CodeReadRequest {
  repoPath: string;
  keywords: string[];
  maxFiles?: number;
  maxBytesPerFile?: number;
}

export interface CodeSnippet {
  path: string;       // relative to repoPath
  content: string;    // truncated to maxBytesPerFile
  matched: string[];  // which keywords matched
  totalBytes: number;
}

export interface CodeReadResult {
  repoRoot: string;
  branch?: string;
  commit?: string;
  snippets: CodeSnippet[];
  skipped: number;
  warnings: string[];
}

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'target', 'dist', 'build',
  '.next', 'out', 'coverage', '.venv', '__pycache__',
  '.idea', '.vscode'
]);

const REJECTED_ROOTS = ['/etc', '/var', '/private', '/System', '/usr'];

const MAX_FILE_SIZE_BYTES = 1_000_000; // 1 MB binary check

/** Check if path is safe (must be under $HOME) */
function isSafePath(resolvedPath: string): boolean {
  const home = os.homedir();
  const normalized = resolvedPath.endsWith(path.sep)
    ? resolvedPath
    : resolvedPath + path.sep;
  const homeNorm = home.endsWith(path.sep) ? home : home + path.sep;
  if (!normalized.startsWith(homeNorm) && resolvedPath !== home) {
    return false;
  }
  for (const rejected of REJECTED_ROOTS) {
    if (resolvedPath === rejected || resolvedPath.startsWith(rejected + path.sep)) {
      return false;
    }
  }
  return true;
}

/** Check if a filename should be ignored */
function isIgnoredFile(filename: string): boolean {
  if (filename.startsWith('.env')) return true;
  if (filename.endsWith('.pem') || filename.endsWith('.key')) return true;
  if (filename.toLowerCase().includes('credentials')) return true;
  return false;
}

/** Check if buffer looks like binary (non-UTF8 in first 512 bytes) */
function isBinaryBuffer(buf: Buffer): boolean {
  const sample = buf.slice(0, 512);
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    // Null byte is a reliable binary indicator
    if (b === 0) return true;
  }
  try {
    sample.toString('utf8');
    return false;
  } catch {
    return true;
  }
}

/** Truncate content: keep head + tail with separator */
function truncateContent(content: string, maxBytes: number): string {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes <= maxBytes) return content;
  // Use half/half split
  const half = Math.floor(maxBytes / 2);
  const head = content.slice(0, half);
  const tail = content.slice(content.length - half);
  const truncated = bytes - maxBytes;
  return `${head}\n... [truncated ${truncated} bytes] ...\n${tail}`;
}

/** Read git branch and commit from .git dir without shelling out */
async function readGitInfo(repoPath: string): Promise<{ branch?: string; commit?: string }> {
  try {
    const headFile = path.join(repoPath, '.git', 'HEAD');
    const headContent = (await fs.readFile(headFile, 'utf8')).trim();

    if (headContent.startsWith('ref: refs/heads/')) {
      const branch = headContent.slice('ref: refs/heads/'.length);
      const refFile = path.join(repoPath, '.git', 'refs', 'heads', branch);
      try {
        const commit = (await fs.readFile(refFile, 'utf8')).trim().slice(0, 40);
        return { branch, commit: commit || undefined };
      } catch {
        return { branch };
      }
    } else if (/^[0-9a-f]{40}$/i.test(headContent)) {
      // Detached HEAD
      return { commit: headContent };
    }
  } catch {
    // .git not found or unreadable
  }
  return {};
}

interface FileCandidate {
  absPath: string;
  relPath: string;
  matched: string[];
  matchCount: number;
}

/** Walk directory, collect candidates matching keywords */
async function walkAndCollect(
  dir: string,
  repoPath: string,
  keywords: string[],
  candidates: FileCandidate[],
  warnings: string[]
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absPath = path.join(dir, entry.name);
    const relPath = path.relative(repoPath, absPath);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walkAndCollect(absPath, repoPath, keywords, candidates, warnings);
    } else if (entry.isFile()) {
      if (isIgnoredFile(entry.name)) continue;

      let stat: { size: number };
      try {
        stat = await fs.stat(absPath);
      } catch {
        continue;
      }

      if (stat.size > MAX_FILE_SIZE_BYTES) continue;

      // Read raw buffer to check binary
      let buf: Buffer;
      try {
        buf = await fs.readFile(absPath);
      } catch {
        continue;
      }

      if (isBinaryBuffer(buf)) continue;

      const content = buf.toString('utf8');
      const lowerContent = content.toLowerCase();
      const lowerPath = relPath.toLowerCase();

      const matched: string[] = [];
      for (const kw of keywords) {
        const lkw = kw.toLowerCase();
        if (lowerContent.includes(lkw) || lowerPath.includes(lkw)) {
          matched.push(kw);
        }
      }

      if (matched.length > 0) {
        candidates.push({ absPath, relPath, matched, matchCount: matched.length });
      }
    }
  }
}

export async function readCodeContext(req: CodeReadRequest): Promise<CodeReadResult> {
  const maxFiles = req.maxFiles ?? 6;
  const maxBytesPerFile = req.maxBytesPerFile ?? 8000;
  const warnings: string[] = [];

  // Resolve and validate path
  let resolved: string;
  try {
    resolved = path.resolve(req.repoPath);
  } catch {
    return {
      repoRoot: req.repoPath,
      snippets: [],
      skipped: 0,
      warnings: [`repoPath could not be resolved: ${req.repoPath}`]
    };
  }

  if (!isSafePath(resolved)) {
    return {
      repoRoot: resolved,
      snippets: [],
      skipped: 0,
      warnings: [`repoPath rejected for safety: ${resolved}`]
    };
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(resolved);
  } catch {
    return {
      repoRoot: resolved,
      snippets: [],
      skipped: 0,
      warnings: [`repoPath not found: ${resolved}`]
    };
  }

  if (!stat.isDirectory()) {
    return {
      repoRoot: resolved,
      snippets: [],
      skipped: 0,
      warnings: [`repoPath is not a directory: ${resolved}`]
    };
  }

  const gitInfo = await readGitInfo(resolved);

  // Walk and collect keyword-matching files
  const candidates: FileCandidate[] = [];
  await walkAndCollect(resolved, resolved, req.keywords, candidates, warnings);

  // Sort by match count descending, then path alphabetically
  candidates.sort((a, b) => b.matchCount - a.matchCount || a.relPath.localeCompare(b.relPath));

  const selected = candidates.slice(0, maxFiles);
  const skipped = Math.max(0, candidates.length - maxFiles);

  const snippets: CodeSnippet[] = [];
  for (const c of selected) {
    try {
      const buf = await fs.readFile(c.absPath);
      const content = buf.toString('utf8');
      const totalBytes = buf.length;
      snippets.push({
        path: c.relPath,
        content: truncateContent(content, maxBytesPerFile),
        matched: c.matched,
        totalBytes
      });
    } catch {
      warnings.push(`Could not read file: ${c.relPath}`);
    }
  }

  return {
    repoRoot: resolved,
    branch: gitInfo.branch,
    commit: gitInfo.commit,
    snippets,
    skipped,
    warnings
  };
}
