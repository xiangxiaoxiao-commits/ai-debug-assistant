import fs from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import type { Case, Message, BugSummary, BugStatus } from '@/domain/types';
import { caseSchema, createCaseInputSchema } from '@/domain/schemas';
import { caseDir, caseFile, casesDir } from './paths';
import { writeJsonAtomic, readJson, fileExists } from './fs-atomic';
import { createInitialPipelineState } from './pipeline-init';
import { z } from 'zod';

type CreateCaseInput = z.infer<typeof createCaseInputSchema>;

/** Normalize a raw case to fill in missing Phase-3 fields for backward compat */
function normalizeCase(raw: Case): Case {
  return {
    ...raw,
    messages: raw.messages ?? [],
    summary: raw.summary ?? {
      status: 'open',
      updatedAt: raw.createdAt,
      updatedBy: 'user'
    }
  };
}

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
  return normalizeCase(c);
}

export async function getCase(id: string): Promise<Case> {
  const file = caseFile(id);
  if (!(await fileExists(file))) throw new Error(`Case not found: ${id}`);
  const raw = await readJson<Case>(file);
  const validated = caseSchema.parse(raw);
  return normalizeCase(validated);
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

export async function appendMessage(
  caseId: string,
  msg: Omit<Message, 'id' | 'createdAt'>
): Promise<Message> {
  const kase = await getCase(caseId);
  const full: Message = {
    ...msg,
    id: uuid(),
    createdAt: new Date().toISOString()
  };
  const messages = [...(kase.messages ?? []), full];
  await updateCase({ ...kase, messages });
  return full;
}

export async function updateMessage(
  caseId: string,
  messageId: string,
  patch: Partial<Pick<Message, 'ingested' | 'meta'>>
): Promise<void> {
  const kase = await getCase(caseId);
  const messages = (kase.messages ?? []).map(m =>
    m.id === messageId ? { ...m, ...patch } : m
  );
  await updateCase({ ...kase, messages });
}

export async function updateSummary(caseId: string, summary: BugSummary): Promise<void> {
  const kase = await getCase(caseId);
  await updateCase({ ...kase, summary });
}

export async function updateCaseStatus(caseId: string, status: BugStatus): Promise<void> {
  const kase = await getCase(caseId);
  const summary: BugSummary = {
    ...(kase.summary ?? { updatedAt: kase.createdAt, updatedBy: 'user' }),
    status,
    updatedAt: new Date().toISOString(),
    updatedBy: 'user'
  };
  // Align case.status with bugStatus
  let caseStatus = kase.status;
  if (status === 'resolved' || status === 'wont-fix') caseStatus = 'done';
  else if (status === 'investigating') caseStatus = 'running';
  await updateCase({ ...kase, summary, status: caseStatus });
}
