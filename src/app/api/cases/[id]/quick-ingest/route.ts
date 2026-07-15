import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCase } from '@/server/case-store';
import { quickIngest } from '@/server/quick-ingest';

const bodySchema = z.object({
  text: z.string().min(1)
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return new Response('bad request', { status: 400 });

  const kase = await getCase(id).catch(() => null);
  if (!kase) return new Response('case not found', { status: 404 });

  const result = await quickIngest(id, parsed.data.text);
  return Response.json({ createdIds: result.createdIds }, { status: 201 });
}
