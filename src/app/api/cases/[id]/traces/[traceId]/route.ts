import { NextRequest, NextResponse } from 'next/server';
import { getCase, getTrace } from '@/server/case-store';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; traceId: string }> }
) {
  const { id, traceId } = await params;
  const kase = await getCase(id).catch(() => null);
  if (!kase) return NextResponse.json({ error: 'case not found' }, { status: 404 });

  try {
    const trace = await getTrace(id, traceId);
    return NextResponse.json({ trace });
  } catch {
    return NextResponse.json({ error: 'trace not found' }, { status: 404 });
  }
}
