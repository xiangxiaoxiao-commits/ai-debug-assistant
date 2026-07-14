import { NextRequest, NextResponse } from 'next/server';
import { createCase, listCases } from '@/server/case-store';
import { upsertIndexEntry, readIndex } from '@/server/index-store';
import { createCaseInputSchema } from '@/domain/schemas';

export async function GET() {
  await listCases();
  const entries = await readIndex();
  return NextResponse.json({ cases: entries });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = createCaseInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  const c = await createCase(parsed.data);
  await upsertIndexEntry(c);
  return NextResponse.json({ case: c }, { status: 201 });
}
