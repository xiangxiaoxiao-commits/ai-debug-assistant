import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const body = JSON.stringify(data, null, 2);
  await fs.writeFile(tmp, body, 'utf8');
  await fs.rename(tmp, file);
}

export async function readJson<T>(file: string): Promise<T> {
  const body = await fs.readFile(file, 'utf8');
  return JSON.parse(body) as T;
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function removeIfExists(file: string): Promise<void> {
  await fs.rm(file, { force: true });
}
