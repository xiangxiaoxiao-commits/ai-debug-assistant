import { NextResponse } from 'next/server';
import { listFeatures } from '@/server/feature-store';

export async function GET() {
  const features = await listFeatures();
  return NextResponse.json({ features });
}
