import { NextRequest, NextResponse } from 'next/server';
import { rememberInputSchema, memoryKindSchema } from '@/domain/memory';
import { listMemories, remember } from '@/memory/memory-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const kindsParam = url.searchParams.get('kinds');
  const tagsParam = url.searchParams.get('tags');
  const kinds = kindsParam ? kindsParam.split(',').map(k => memoryKindSchema.parse(k)) : undefined;
  const tags = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : undefined;
  try {
    const memories = await listMemories(id, { kinds, tags });
    return NextResponse.json({ memories });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }); }
  const parsed = rememberInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await remember(id, parsed.data);
    return NextResponse.json(result, { status: result.reinforced ? 200 : 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
