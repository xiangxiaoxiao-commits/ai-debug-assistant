import { NextRequest, NextResponse } from 'next/server';
import { getCase, deleteCase, updateCase } from '@/server/case-store';
import { listEvidence } from '@/server/evidence-store';
import { removeIndexEntry, upsertIndexEntry } from '@/server/index-store';
import { calculateEvidenceLevel } from '@/domain/evidence-level';
import { caseMetaSchema } from '@/domain/schemas';
import { z } from 'zod';

const patchSchema = z.object({
  meta: caseMetaSchema.optional(),
  status: z.enum(['draft', 'running', 'blocked', 'done', 'error']).optional()
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const c = await getCase(params.id);
    const evidence = await listEvidence(params.id);
    const evidenceLevel = calculateEvidenceLevel(evidence);
    if (evidenceLevel !== c.evidenceLevel) {
      const updated = await updateCase({ ...c, evidenceLevel });
      await upsertIndexEntry(updated);
      return NextResponse.json({ case: updated, evidence });
    }
    return NextResponse.json({ case: c, evidence });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const existing = await getCase(params.id);
  const updated = await updateCase({
    ...existing,
    meta: parsed.data.meta ?? existing.meta,
    status: parsed.data.status ?? existing.status
  });
  await upsertIndexEntry(updated);
  return NextResponse.json({ case: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await deleteCase(params.id);
  await removeIndexEntry(params.id);
  return NextResponse.json({ deleted: params.id });
}
