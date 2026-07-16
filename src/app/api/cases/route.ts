import { NextRequest, NextResponse } from 'next/server';
import { createCase, listCases, getCase, updateCase } from '@/server/case-store';
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
  } else {
    try {
      const existingFeatures = await listFeatures();
      const classification = await classifyFeature(cfg, {
        problem: parsed.data.problem,
        meta: parsed.data.meta,
        existingFeatures
      });

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

      // Increment bug count
      await incrementFeatureStats(featureId, { bug: 1 });
      feature = await getFeature(featureId);

      // Find similar resolved cases in the same feature
      const allCases = await listCases();
      const candidateCases = allCases.filter(
        cc => cc.featureId === featureId && cc.summary?.status === 'resolved'
      );

      let relatedCaseIds: string[] = [];
      if (candidateCases.length > 0) {
        const similar = await findSimilarCases(cfg, {
          problem: parsed.data.problem,
          candidateCases,
          topK: 3
        });
        relatedCaseIds = similar.map(s => s.caseId);
      }

      // Update the case with featureId + relatedCaseIds
      c = await updateCase({ ...c, featureId, relatedCaseIds: relatedCaseIds.length > 0 ? relatedCaseIds : undefined });
      await upsertIndexEntry(c, feature.name);

      // Build relatedCases response
      const relatedCases = await Promise.all(
        relatedCaseIds.map(async (id) => {
          try {
            const rc = await getCase(id);
            return { id, headline: rc.summary?.headline, rootCause: rc.summary?.rootCause };
          } catch {
            return { id };
          }
        })
      );

      return NextResponse.json({ case: c, feature, relatedCases, warnings }, { status: 201 });
    } catch (e) {
      warnings.push(`classification failed: ${(e as Error).message}`);
    }
  }

  await upsertIndexEntry(c);
  return NextResponse.json({ case: c, feature: undefined, relatedCases: [], warnings }, { status: 201 });
}
