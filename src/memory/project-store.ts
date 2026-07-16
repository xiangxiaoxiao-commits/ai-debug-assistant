import fs from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import type { Project, CreateProjectInput, UpdateProjectInput } from '@/domain/memory';
import { projectSchema } from '@/domain/memory';
import { projectDir, projectFile, projectsIndexFile } from '@/server/paths';
import { writeJsonAtomic, readJson, fileExists, ensureDir } from '@/server/fs-atomic';
import { z } from 'zod';
import { normalizeRepoPath } from './repo-path';

const indexArraySchema = z.array(z.object({
  id: z.string().uuid(),
  name: z.string(),
  repoPath: z.string().optional(),
  memoryCount: z.number().nonnegative(),
  updatedAt: z.string()
}));

type IndexEntry = z.infer<typeof indexArraySchema>[number];

async function readIndex(): Promise<IndexEntry[]> {
  const f = projectsIndexFile();
  if (!(await fileExists(f))) return [];
  try {
    return indexArraySchema.parse(await readJson(f));
  } catch {
    return [];
  }
}

async function writeIndex(entries: IndexEntry[]): Promise<void> {
  await writeJsonAtomic(projectsIndexFile(), entries);
}

function toIndexEntry(p: Project): IndexEntry {
  return {
    id: p.id,
    name: p.name,
    repoPath: p.repoPath,
    memoryCount: p.memoryCount,
    updatedAt: p.updatedAt
  };
}

async function upsertIndex(p: Project): Promise<void> {
  const cur = await readIndex();
  const next = cur.filter(e => e.id !== p.id);
  next.push(toIndexEntry(p));
  next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  await writeIndex(next);
}

async function removeFromIndex(id: string): Promise<void> {
  const cur = await readIndex();
  await writeIndex(cur.filter(e => e.id !== id));
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const now = new Date().toISOString();
  const p: Project = {
    id: uuid(),
    name: input.name,
    repoPath: normalizeRepoPath(input.repoPath),
    aliases: input.aliases,
    createdAt: now,
    updatedAt: now,
    memoryCount: 0
  };
  projectSchema.parse(p);
  await ensureDir(projectDir(p.id));
  await writeJsonAtomic(projectFile(p.id), p);
  await upsertIndex(p);
  return p;
}

export async function getProject(id: string): Promise<Project> {
  const f = projectFile(id);
  if (!(await fileExists(f))) throw new Error(`Project not found: ${id}`);
  const raw = await readJson<Project>(f);
  return projectSchema.parse(raw);
}

export async function tryGetProject(id: string): Promise<Project | null> {
  try { return await getProject(id); } catch { return null; }
}

export async function updateProject(id: string, patch: UpdateProjectInput): Promise<Project> {
  const existing = await getProject(id);
  const now = new Date().toISOString();
  const next: Project = {
    ...existing,
    name: patch.name ?? existing.name,
    repoPath: patch.repoPath !== undefined ? normalizeRepoPath(patch.repoPath) : existing.repoPath,
    aliases: patch.aliases ?? existing.aliases,
    identity: patch.identity
      ? { ...(existing.identity ?? { updatedAt: now, updatedBy: 'user' as const }), ...patch.identity, updatedAt: now }
      : existing.identity,
    updatedAt: now
  };
  projectSchema.parse(next);
  await writeJsonAtomic(projectFile(id), next);
  await upsertIndex(next);
  return next;
}

export async function listProjects(): Promise<Project[]> {
  const index = await readIndex();
  const projects: Project[] = [];
  for (const entry of index) {
    const p = await tryGetProject(entry.id);
    if (p) projects.push(p);
  }
  return projects;
}

export async function findProjectByRepoPath(repoPath: string): Promise<Project | null> {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized) return null;
  const index = await readIndex();
  for (const entry of index) {
    if (entry.repoPath === normalized) return tryGetProject(entry.id);
  }
  // fallback: check aliases
  for (const entry of index) {
    const p = await tryGetProject(entry.id);
    if (p?.aliases?.includes(normalized)) return p;
  }
  return null;
}

export async function findProjectByName(name: string): Promise<Project | null> {
  const index = await readIndex();
  const entry = index.find(e => e.name === name);
  return entry ? tryGetProject(entry.id) : null;
}

export async function bumpMemoryCount(id: string, delta: number): Promise<void> {
  const p = await getProject(id);
  const next: Project = { ...p, memoryCount: Math.max(0, p.memoryCount + delta), updatedAt: new Date().toISOString() };
  await writeJsonAtomic(projectFile(id), next);
  await upsertIndex(next);
}

export async function deleteProject(id: string): Promise<void> {
  await fs.rm(projectDir(id), { recursive: true, force: true });
  await removeFromIndex(id);
}

/** Ensure a default fallback project exists. Called by memory-store when
 * an operation targets a project that must exist. */
export async function ensureDefaultProject(): Promise<Project> {
  const existing = await findProjectByName('未归属');
  if (existing) return existing;
  return createProject({ name: '未归属' });
}
