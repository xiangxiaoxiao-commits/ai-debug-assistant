import { NextRequest, NextResponse } from 'next/server';
import { addEvidence, listEvidence } from '@/server/evidence-store';
import { getCase, updateCase } from '@/server/case-store';
import { upsertIndexEntry } from '@/server/index-store';
import { calculateEvidenceLevel } from '@/domain/evidence-level';
import { addEvidenceInputSchema } from '@/domain/schemas';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const list = await listEvidence(params.id);
  return NextResponse.json({ evidence: list });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const parsed = addEvidenceInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const evidence = await addEvidence(params.id, parsed.data);
  const all = await listEvidence(params.id);
  const c = await getCase(params.id);
  const level = calculateEvidenceLevel(all);
  const updated = await updateCase({ ...c, evidenceLevel: level });
  await upsertIndexEntry(updated);

  return NextResponse.json({ evidence, case: updated }, { status: 201 });
}
