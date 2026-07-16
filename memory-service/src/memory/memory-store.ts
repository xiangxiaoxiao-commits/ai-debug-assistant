import fs from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import type {
  MemoryEntry,
  MemoryKind,
  RecallHit,
  RememberInput,
  RecallInput,
  UpdateMemoryInput
} from '@/domain/memory';
import { memoryEntrySchema } from '@/domain/memory';
import { memoriesDir, memoryFile } from '@/server/paths';
import { writeJsonAtomic, readJson, fileExists, ensureDir } from '@/server/fs-atomic';
import { getProject, bumpMemoryCount } from './project-store';
import { bm25Rank, tokenize } from './bm25';

/** Fuzzy similarity: token Jaccard on tokenized content. Used for
 * reinforceIfSimilar deduplication. */
function tokenJaccard(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 && tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

const SIMILARITY_THRESHOLD = 0.6;

export async function listMemories(projectId: string, filters?: {
  kinds?: MemoryKind[];
  tags?: string[];
}): Promise<MemoryEntry[]> {
  await getProject(projectId);   // 404 if missing
  const dir = memoriesDir(projectId);
  if (!(await fileExists(dir))) return [];
  const names = await fs.readdir(dir);
  const out: MemoryEntry[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = await readJson<unknown>(memoryFile(projectId, name.replace(/\.json$/, '')));
      const entry = memoryEntrySchema.parse(raw);
      if (filters?.kinds && filters.kinds.length > 0 && !filters.kinds.includes(entry.kind)) continue;
      if (filters?.tags && filters.tags.length > 0) {
        const has = filters.tags.every(t => entry.tags.includes(t));
        if (!has) continue;
      }
      out.push(entry);
    } catch {
      // skip corrupted
    }
  }
  return out.sort((a, b) => b.strength - a.strength || b.updatedAt.localeCompare(a.updatedAt));
}

export async function getMemory(projectId: string, id: string): Promise<MemoryEntry> {
  const f = memoryFile(projectId, id);
  if (!(await fileExists(f))) throw new Error(`Memory not found: ${id}`);
  return memoryEntrySchema.parse(await readJson<unknown>(f));
}

export async function remember(projectId: string, input: RememberInput): Promise<{
  entry: MemoryEntry;
  reinforced: boolean;
}> {
  await getProject(projectId);
  const now = new Date().toISOString();

  // Reinforce if similar entry of same kind exists
  if (input.reinforceIfSimilar) {
    const existing = await listMemories(projectId, { kinds: [input.kind] });
    for (const e of existing) {
      if (tokenJaccard(e.content, input.content) >= SIMILARITY_THRESHOLD) {
        const merged: MemoryEntry = {
          ...e,
          strength: e.strength + 1,
          sources: Array.from(new Set([...(e.sources ?? []), ...(input.sources ?? [])])),
          tags: Array.from(new Set([...e.tags, ...(input.tags ?? [])])),
          updatedAt: now,
          updatedBy: input.updatedBy ?? 'llm'
        };
        memoryEntrySchema.parse(merged);
        await writeJsonAtomic(memoryFile(projectId, merged.id), merged);
        return { entry: merged, reinforced: true };
      }
    }
  }

  const entry: MemoryEntry = {
    id: uuid(),
    projectId,
    kind: input.kind,
    content: input.content,
    tags: input.tags ?? [],
    sources: input.sources,
    metadata: input.metadata,
    strength: 1,
    createdAt: now,
    updatedAt: now,
    updatedBy: input.updatedBy ?? 'llm'
  };
  memoryEntrySchema.parse(entry);
  await ensureDir(memoriesDir(projectId));
  await writeJsonAtomic(memoryFile(projectId, entry.id), entry);
  await bumpMemoryCount(projectId, +1);
  return { entry, reinforced: false };
}

export async function updateMemory(
  projectId: string,
  id: string,
  patch: UpdateMemoryInput
): Promise<MemoryEntry> {
  const existing = await getMemory(projectId, id);
  const next: MemoryEntry = {
    ...existing,
    content: patch.content ?? existing.content,
    tags: patch.tags ?? existing.tags,
    strength: patch.strength !== undefined ? patch.strength : existing.strength,
    metadata: patch.metadata ?? existing.metadata,
    updatedAt: new Date().toISOString(),
    updatedBy: 'user'
  };
  memoryEntrySchema.parse(next);
  await writeJsonAtomic(memoryFile(projectId, id), next);
  return next;
}

export async function forget(projectId: string, id: string): Promise<void> {
  const f = memoryFile(projectId, id);
  if (await fileExists(f)) {
    await fs.rm(f);
    await bumpMemoryCount(projectId, -1);
  }
}

export async function recall(projectId: string, input: RecallInput): Promise<RecallHit[]> {
  const pool = await listMemories(projectId, { kinds: input.kinds, tags: input.tags });
  if (pool.length === 0) return [];
  const topK = input.topK ?? 5;
  // Combine content + tags into the searchable text
  const scored = bm25Rank(
    pool,
    (m) => `${m.content}\n${m.tags.join(' ')}`,
    input.query,
    topK * 2   // over-fetch, then re-rank with strength boost below
  );
  // Boost by strength (mild logarithmic bonus)
  const boosted = scored.map(s => ({
    entry: s.doc,
    score: s.score * (1 + Math.log(1 + s.doc.strength) / 4)
  }));
  boosted.sort((a, b) => b.score - a.score);
  return boosted.slice(0, topK);
}

/** Get the top N by strength within a kind — used for prompt injection when
 * you want the "most confirmed" memories regardless of a query. */
export async function topByStrength(
  projectId: string,
  kind: MemoryKind,
  limit = 10
): Promise<MemoryEntry[]> {
  const all = await listMemories(projectId, { kinds: [kind] });
  return all.slice(0, limit);
}
