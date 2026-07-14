import fs from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import type { Case } from '@/domain/types';
import { caseSchema, createCaseInputSchema } from '@/domain/schemas';
import { caseDir, caseFile, casesDir } from './paths';
import { writeJsonAtomic, readJson, fileExists } from './fs-atomic';
import { createInitialPipelineState } from './pipeline-init';
import { z } from 'zod';

type CreateCaseInput = z.infer<typeof createCaseInputSchema>;

export async function createCase(input: CreateCaseInput): Promise<Case> {
  const parsed = createCaseInputSchema.parse(input);
  const now = new Date().toISOString();
  const c: Case = {
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    problem: parsed.problem,
    meta: parsed.meta,
    evidenceLevel: 'L0',
    pipeline: createInitialPipelineState()
  };
  caseSchema.parse(c);
  await writeJsonAtomic(caseFile(c.id), c);
  return c;
}

export async function getCase(id: string): Promise<Case> {
  const file = caseFile(id);
  if (!(await fileExists(file))) throw new Error(`Case not found: ${id}`);
  const raw = await readJson<Case>(file);
  return caseSchema.parse(raw);
}

export async function updateCase(c: Case): Promise<Case> {
  const next = { ...c, updatedAt: new Date().toISOString() };
  caseSchema.parse(next);
  await writeJsonAtomic(caseFile(next.id), next);
  return next;
}

export async function listCases(): Promise<Case[]> {
  const dir = casesDir();
  if (!(await fileExists(dir))) return [];
  const entries = await fs.readdir(dir);
  const cases: Case[] = [];
  for (const e of entries) {
    if (!/^[0-9a-f-]{36}$/.test(e)) continue;
    try {
      cases.push(await getCase(e));
    } catch {
      // skip corrupted cases
    }
  }
  return cases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteCase(id: string): Promise<void> {
  await fs.rm(caseDir(id), { recursive: true, force: true });
}
