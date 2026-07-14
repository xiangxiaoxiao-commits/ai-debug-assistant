import { NextRequest, NextResponse } from 'next/server';
import { deleteEvidence, listEvidence } from '@/server/evidence-store';
import { getCase, updateCase } from '@/server/case-store';
import { upsertIndexEntry } from '@/server/index-store';
import { calculateEvidenceLevel } from '@/domain/evidence-level';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; evidenceId: string }> }
) {
  const { id, evidenceId } = await params;
  await deleteEvidence(id, evidenceId);
  const remaining = await listEvidence(id);
  const c = await getCase(id);
  const level = calculateEvidenceLevel(remaining);
  const updated = await updateCase({ ...c, evidenceLevel: level });
  await upsertIndexEntry(updated);
  return NextResponse.json({ case: updated });
}
