import { NextRequest, NextResponse } from 'next/server';
import { getCase } from '@/server/case-store';
import { listEvidence } from '@/server/evidence-store';
import { SCHEMA_VERSION } from '@/domain/constants';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const c = await getCase(params.id);
  const evidence = await listEvidence(params.id);
  const body = { schemaVersion: SCHEMA_VERSION, case: c, evidence };
  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="case-${c.id}.json"`
    }
  });
}
