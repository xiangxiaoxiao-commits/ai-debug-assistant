import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'ai-memory-service',
    version: '0.1.0',
    time: new Date().toISOString()
  });
}
