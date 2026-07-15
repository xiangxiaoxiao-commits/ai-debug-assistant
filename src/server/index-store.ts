import type { Case, CaseIndexEntry } from '@/domain/types';
import { caseIndexEntrySchema } from '@/domain/schemas';
import { z } from 'zod';
import { indexFile } from './paths';
import { fileExists, readJson, writeJsonAtomic } from './fs-atomic';
import { listCases } from './case-store';

const indexArraySchema = z.array(caseIndexEntrySchema);

export async function readIndex(): Promise<CaseIndexEntry[]> {
  if (!(await fileExists(indexFile()))) return [];
  try {
    return indexArraySchema.parse(await readJson(indexFile()));
  } catch {
    return [];
  }
}

async function writeIndex(entries: CaseIndexEntry[]): Promise<void> {
  await writeJsonAtomic(indexFile(), entries);
}

function toEntry(c: Case): CaseIndexEntry {
  const firstLine = c.problem.actual.split('\n')[0]?.trim() ?? '(untitled)';
  return {
    id: c.id,
    title: firstLine || '(untitled)',
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    repoPath: c.meta?.repoPath,
    status: c.status,
    bugStatus: c.summary?.status,
    headline: c.summary?.headline
  };
}

export async function upsertIndexEntry(c: Case): Promise<void> {
  const cur = await readIndex();
  const entry = toEntry(c);
  const next = cur.filter(e => e.id !== c.id);
  next.push(entry);
  next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await writeIndex(next);
}

export async function removeIndexEntry(id: string): Promise<void> {
  const cur = await readIndex();
  await writeIndex(cur.filter(e => e.id !== id));
}

export async function rebuildIndex(): Promise<CaseIndexEntry[]> {
  const cases = await listCases();
  const entries = cases.map(toEntry).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await writeIndex(entries);
  return entries;
}
