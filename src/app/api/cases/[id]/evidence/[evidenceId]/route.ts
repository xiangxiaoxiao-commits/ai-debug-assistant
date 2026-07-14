import { NextRequest, NextResponse } from 'next/server';
import { deleteEvidence, listEvidence } from '@/server/evidence-store';
import { getCase, updateCase } from '@/server/case-store';
import { upsertIndexEntry } from '@/server/index-store';
import { calculateEvidenceLevel } from '@/domain/evidence-level';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; evidenceId: string } }
) {
  await deleteEvidence(params.id, params.evidenceId);
  const remaining = await listEvidence(params.id);
  const c = await getCase(params.id);
  const level = calculateEvidenceLevel(remaining);
  const updated = await updateCase({ ...c, evidenceLevel: level });
  await upsertIndexEntry(updated);
  return NextResponse.json({ case: updated });
}
