import { NextRequest, NextResponse } from 'next/server';
import { createCase, listCases, getCase, updateCase, updatePlaybook } from '@/server/case-store';
import { upsertIndexEntry, readIndex } from '@/server/index-store';
import { createCaseInputSchema } from '@/domain/schemas';
import { readSavedConfig } from '@/server/config-store';
import {
  createFeature,
  findFeatureByName,
  getFeature,
  incrementFeatureStats,
  listFeatures
} from '@/server/feature-store';
import { classifyFeature } from '@/server/feature-classifier';
import { findSimilarCases } from '@/server/similarity-search';
import { generatePlaybook } from '@/server/playbook-generator';
import { TraceRecorder } from '@/server/trace-recorder';
import type { Feature } from '@/domain/types';

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

  const warnings: string[] = [];
  let feature: Feature | undefined;

  // Create the case first
  let c = await createCase(parsed.data);

  // Attempt classification if config is available
  const cfg = await readSavedConfig();
  if (!cfg) {
    warnings.push('model not configured — skipped feature classification');
    await upsertIndexEntry(c);
    return NextResponse.json({ case: c, feature: undefined, relatedCases: [], warnings }, { status: 201 });
  }

  const recorder = new TraceRecorder(c.id, 'create-case');

  try {
    const existingFeatures = await listFeatures();
    let relatedCaseIds: string[] = [];
    let relatedCasesForPlaybook: { headline?: string; rootCause?: string; fix?: string }[] = [];

    // classify-feature step
    const classification = await recorder.step(
      'classify-feature',
      '分类业务模块',
      () => classifyFeature(cfg, { problem: parsed.data.problem, meta: parsed.data.meta, existingFeatures })
    );

    // Resolve or create the feature
    let featureId: string;
    if (classification.matchedExistingId) {
      featureId = classification.matchedExistingId;
      feature = await getFeature(featureId).catch(() => undefined);
      if (!feature) {
        feature = await createFeature({ name: classification.featureName });
        featureId = feature.id;
      }
    } else {
      const existing = await findFeatureByName(classification.featureName);
      if (existing) {
        featureId = existing.id;
        feature = existing;
      } else {
        feature = await createFeature({ name: classification.featureName });
        featureId = feature.id;
      }
    }

    await incrementFeatureStats(featureId, { bug: 1 });
    feature = await getFeature(featureId);

    // find-similar step
    const allCases = await listCases();
    const candidateCases = allCases.filter(
      cc => cc.featureId === featureId && cc.summary?.status === 'resolved'
    );

    if (candidateCases.length > 0) {
      const similar = await recorder.step(
        'find-similar',
        `命中相似历史 ${candidateCases.length} 条`,
        () => findSimilarCases(cfg, { problem: parsed.data.problem, candidateCases, topK: 3 })
      );
      relatedCaseIds = similar.map(s => s.caseId);
    } else {
      recorder.add({ kind: 'find-similar', label: '无相似历史', status: 'skipped' });
    }

    // Update the case with featureId + relatedCaseIds
    c = await updateCase({
      ...c,
      featureId,
      relatedCaseIds: relatedCaseIds.length > 0 ? relatedCaseIds : undefined
    });
    await upsertIndexEntry(c, feature.name);

    // Build relatedCases response
    const relatedCasesResp = await Promise.all(
      relatedCaseIds.map(async (id) => {
        try {
          const rc = await getCase(id);
          const entry = { id, headline: rc.summary?.headline, rootCause: rc.summary?.rootCause };
          relatedCasesForPlaybook.push({ headline: rc.summary?.headline, rootCause: rc.summary?.rootCause, fix: rc.summary?.fixApproach });
          return entry;
        } catch {
          return { id };
        }
      })
    );

    // Generate playbook (non-blocking — wrap in try/catch)
    try {
      const featureKnowledge = feature?.knowledge;
      const playbook = await recorder.step(
        'load-knowledge',
        'AI 生成排障 Playbook',
        () => generatePlaybook(cfg, {
          problem: parsed.data.problem,
          featureKnowledge,
          relatedCases: relatedCasesForPlaybook
        }).then(pb => {
          if (!pb) throw new Error('generatePlaybook returned null');
          return pb;
        })
      );
      await updatePlaybook(c.id, playbook);
      c = await getCase(c.id);
    } catch {
      // playbook generation failure is non-fatal
      warnings.push('playbook generation failed');
    }

    const trace = await recorder.finalize();
    return NextResponse.json(
      { case: c, feature, relatedCases: relatedCasesResp, warnings, trace: { id: trace.id } },
      { status: 201 }
    );
  } catch (e) {
    warnings.push(`classification failed: ${(e as Error).message}`);
    try { await recorder.finalize(); } catch { /* ignore */ }
  }

  await upsertIndexEntry(c);
  return NextResponse.json({ case: c, feature: undefined, relatedCases: [], warnings }, { status: 201 });
}
