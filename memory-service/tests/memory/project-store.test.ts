import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  createProject,
  getProject,
  findProjectByRepoPath,
  findProjectByName,
  listProjects,
  updateProject,
  deleteProject,
  bumpMemoryCount,
  ensureDefaultProject
} from '@/memory/project-store';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ada-mem-'));
  process.env.AI_DEBUG_HOME = tmp;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  delete process.env.AI_DEBUG_HOME;
});

describe('project-store', () => {
  it('createProject writes project.json + updates index', async () => {
    const p = await createProject({ name: 'demo', repoPath: '/tmp/demo' });
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.name).toBe('demo');
    expect(p.repoPath).toBe('/tmp/demo');
    expect(p.memoryCount).toBe(0);

    const found = await getProject(p.id);
    expect(found.id).toBe(p.id);
  });

  it('findProjectByRepoPath matches normalized', async () => {
    const p = await createProject({ name: 'x', repoPath: '/tmp/x/' });
    const found = await findProjectByRepoPath('/tmp/x');
    expect(found?.id).toBe(p.id);
  });

  it('findProjectByRepoPath returns null when not found', async () => {
    await createProject({ name: 'x', repoPath: '/tmp/x' });
    expect(await findProjectByRepoPath('/tmp/y')).toBeNull();
  });

  it('listProjects returns all', async () => {
    await createProject({ name: 'a' });
    await createProject({ name: 'b' });
    const list = await listProjects();
    expect(list.length).toBe(2);
  });

  it('updateProject merges identity', async () => {
    const p = await createProject({ name: 'x' });
    const upd = await updateProject(p.id, {
      identity: {
        techStack: ['Spring Boot'],
        languages: ['Java'],
        updatedAt: new Date().toISOString(),
        updatedBy: 'user'
      }
    });
    expect(upd.identity?.techStack).toEqual(['Spring Boot']);
    expect(upd.identity?.languages).toEqual(['Java']);
  });

  it('bumpMemoryCount adjusts counter (never below 0)', async () => {
    const p = await createProject({ name: 'x' });
    await bumpMemoryCount(p.id, +2);
    expect((await getProject(p.id)).memoryCount).toBe(2);
    await bumpMemoryCount(p.id, -5);
    expect((await getProject(p.id)).memoryCount).toBe(0);
  });

  it('deleteProject wipes files + index', async () => {
    const p = await createProject({ name: 'x' });
    await deleteProject(p.id);
    await expect(getProject(p.id)).rejects.toThrow();
    expect(await findProjectByName('x')).toBeNull();
  });

  it('ensureDefaultProject is idempotent', async () => {
    const a = await ensureDefaultProject();
    const b = await ensureDefaultProject();
    expect(a.id).toBe(b.id);
    expect(a.name).toBe('未归属');
  });
});
