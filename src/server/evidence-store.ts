import fs from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import type { Evidence, EvidenceType } from '@/domain/types';
import { addEvidenceInputSchema, evidenceSchema } from '@/domain/schemas';
import { z } from 'zod';
import { caseFile, evidenceDir, evidenceFile } from './paths';
import { fileExists, readJson, writeJsonAtomic } from './fs-atomic';

type AddEvidenceInput = z.infer<typeof addEvidenceInputSchema>;

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function extractKeywords(type: EvidenceType, content: string): string[] {
  const kws = new Set<string>();
  const urlRe = /https?:\/\/[^\s'"<>]+/g;
  for (const m of content.match(urlRe) ?? []) kws.add(m);
  const upperTokens = content.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [];
  for (const t of upperTokens.slice(0, 10)) kws.add(t);
  const httpVerbs = content.match(/\b(GET|POST|PUT|DELETE|PATCH)\b/g) ?? [];
  for (const v of httpVerbs) kws.add(v);
  return Array.from(kws).slice(0, 20);
}

function makeOneLine(type: EvidenceType, content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  const preview = trimmed.slice(0, 80);
  return `[${type}] ${preview}${trimmed.length > 80 ? '…' : ''}`;
}

export async function addEvidence(caseId: string, input: AddEvidenceInput): Promise<Evidence> {
  const parsed = addEvidenceInputSchema.parse(input);
  if (!(await fileExists(caseFile(caseId)))) {
    throw new Error(`Case not found: ${caseId}`);
  }
  const evidence: Evidence = {
    id: uuid(),
    caseId,
    type: parsed.type,
    createdAt: new Date().toISOString(),
    source: 'user-paste',
    raw: {
      content: parsed.content,
      filename: parsed.filename,
      sizeBytes: Buffer.byteLength(parsed.content, 'utf8')
    },
    summary: {
      oneLine: makeOneLine(parsed.type, parsed.content),
      keywords: extractKeywords(parsed.type, parsed.content),
      tokensEstimate: estimateTokens(parsed.content)
    }
  };
  evidenceSchema.parse(evidence);
  await writeJsonAtomic(evidenceFile(caseId, evidence.id), evidence);
  return evidence;
}

export async function listEvidence(caseId: string): Promise<Evidence[]> {
  const dir = evidenceDir(caseId);
  if (!(await fileExists(dir))) return [];
  const entries = await fs.readdir(dir);
  const list: Evidence[] = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    try {
      list.push(evidenceSchema.parse(await readJson(`${dir}/${name}`)));
    } catch {
      // 跳过损坏文件
    }
  }
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function deleteEvidence(caseId: string, evidenceId: string): Promise<void> {
  await fs.rm(evidenceFile(caseId, evidenceId), { force: true });
}
