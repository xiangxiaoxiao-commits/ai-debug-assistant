import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const IS_WINDOWS = process.platform === 'win32';

const IGNORED_DIRS = new Set([
  // Common
  '.git', 'node_modules', 'target', 'dist', 'build', '.next', 'out',
  'coverage', '.venv', '__pycache__', '.idea', '.vscode', '.turbo',
  '.cache',
  // macOS / Linux user-dir noise
  'Library', '.Trash',
  // Windows user-dir noise
  'AppData', 'Application Data', 'Local Settings',
  'NTUSER.DAT', 'NTUSER.INI'
]);

function pathsEqual(a: string, b: string): boolean {
  return IS_WINDOWS ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function pathStartsWith(a: string, prefix: string): boolean {
  return IS_WINDOWS
    ? a.toLowerCase().startsWith(prefix.toLowerCase())
    : a.startsWith(prefix);
}

export interface BrowseEntry {
  name: string;
  isRepo: boolean;    // has .git
}

export interface BrowseResult {
  path: string;       // absolute, normalized
  parent: string | null;
  entries: BrowseEntry[];
  isRepo: boolean;    // current dir itself has .git
  error?: string;
}

function isUnderHome(p: string): boolean {
  const resolved = path.resolve(p);
  return pathsEqual(resolved, HOME) || pathStartsWith(resolved, HOME + path.sep);
}

export async function browseDir(inputPath?: string): Promise<BrowseResult> {
  const target = inputPath && inputPath.trim() ? path.resolve(inputPath) : HOME;

  if (!isUnderHome(target)) {
    return {
      path: HOME,
      parent: null,
      entries: [],
      isRepo: false,
      error: `只允许浏览用户主目录（${HOME}）下的路径`
    };
  }

  let stat;
  try {
    stat = await fs.stat(target);
  } catch (e) {
    return {
      path: HOME,
      parent: null,
      entries: [],
      isRepo: false,
      error: `路径不存在：${target}`
    };
  }
  if (!stat.isDirectory()) {
    return {
      path: path.dirname(target),
      parent: null,
      entries: [],
      isRepo: false,
      error: `不是目录：${target}`
    };
  }

  const parent = pathsEqual(target, HOME) ? null : path.dirname(target);
  let names: string[];
  try {
    names = await fs.readdir(target);
  } catch (e) {
    return {
      path: target,
      parent,
      entries: [],
      isRepo: false,
      error: `无法读取目录：${(e as Error).message}`
    };
  }

  const entries: BrowseEntry[] = [];
  for (const name of names) {
    if (name.startsWith('.') && name !== '.git') {
      // hide most dotfiles, keep .git visible for repo indicator
      // but we don't list .git as an entry, only use it to flag parent
      continue;
    }
    if (IS_WINDOWS
      ? Array.from(IGNORED_DIRS).some(d => d.toLowerCase() === name.toLowerCase())
      : IGNORED_DIRS.has(name)) continue;
    const full = path.join(target, name);
    let s;
    try { s = await fs.stat(full); } catch { continue; }
    if (!s.isDirectory()) continue;
    // detect if this child is itself a git repo
    let isRepo = false;
    try { await fs.access(path.join(full, '.git')); isRepo = true; } catch { /* ignore */ }
    entries.push({ name, isRepo });
  }

  entries.sort((a, b) => {
    if (a.isRepo !== b.isRepo) return a.isRepo ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  let selfIsRepo = false;
  try { await fs.access(path.join(target, '.git')); selfIsRepo = true; } catch { /* ignore */ }

  return { path: target, parent, entries, isRepo: selfIsRepo };
}

export function homeDir(): string {
  return HOME;
}
