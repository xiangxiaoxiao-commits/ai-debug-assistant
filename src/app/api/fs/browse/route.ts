import { NextRequest, NextResponse } from 'next/server';
import { browseDir, homeDir } from '@/server/fs-browse';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const p = url.searchParams.get('path') ?? undefined;
  const result = await browseDir(p);
  return NextResponse.json({ ...result, home: homeDir() });
}
