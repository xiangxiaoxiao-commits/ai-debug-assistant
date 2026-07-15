import { NextRequest, NextResponse } from 'next/server';
import { modelConfigSchema } from '@/domain/model-config';
import { readSavedConfig, writeSavedConfig } from '@/server/config-store';

export async function GET() {
  const cfg = await readSavedConfig();
  return NextResponse.json({ config: cfg });
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = modelConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await writeSavedConfig(parsed.data);
  return NextResponse.json({ config: parsed.data });
}
