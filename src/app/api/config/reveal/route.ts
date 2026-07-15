import { NextRequest, NextResponse } from 'next/server';
import { discoverCandidates } from '@/server/config-discover';
import { z } from 'zod';

const bodySchema = z.object({ candidateId: z.string() });

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { candidates, fullKeys } = await discoverCandidates();
  const candidate = candidates.find(c => c.id === parsed.data.candidateId);
  const fullKey = fullKeys.get(parsed.data.candidateId);

  if (!candidate || !fullKey) {
    return NextResponse.json({ error: '候选不存在' }, { status: 404 });
  }

  return NextResponse.json({
    provider: candidate.provider,
    baseUrl: candidate.baseUrl,
    model: candidate.model,
    apiKey: fullKey,
  });
}
