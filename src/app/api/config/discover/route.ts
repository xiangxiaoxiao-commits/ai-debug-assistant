import { NextResponse } from 'next/server';
import { discoverCandidates } from '@/server/config-discover';
import { readSavedConfig } from '@/server/config-store';

export async function GET() {
  const { candidates } = await discoverCandidates();
  const saved = await readSavedConfig();
  return NextResponse.json({
    candidates,
    saved: saved
      ? {
          provider: saved.provider,
          baseUrl: saved.baseUrl,
          model: saved.model,
          apiKeyMasked:
            saved.apiKey.length > 8
              ? saved.apiKey.slice(0, 4) + '****' + saved.apiKey.slice(-4)
              : '***',
        }
      : null,
  });
}
