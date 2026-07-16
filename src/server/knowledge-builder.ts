import type { Feature, FeatureKnowledge, VerifiedFix } from '@/domain/types';
import { getFeature, updateFeature } from './feature-store';
import { listCases } from './case-store';

export async function refreshFeatureKnowledge(featureId: string, _cfg?: unknown): Promise<Feature> {
  const feature = await getFeature(featureId);
  const allCases = await listCases();

  const resolvedWithLessons = allCases.filter(
    c => c.featureId === featureId && c.lessons != null
  );

  if (resolvedWithLessons.length === 0) {
    const emptyKnowledge: FeatureKnowledge = {
      commonRootCauses: [],
      verifiedFixes: [],
      updatedAt: new Date().toISOString(),
      sourceCaseCount: 0
    };
    return await updateFeature({ ...feature, knowledge: emptyKnowledge });
  }

  // Aggregate root causes by frequency
  const rootCauseFreq = new Map<string, number>();
  for (const c of resolvedWithLessons) {
    const rc = c.lessons!.rootCause;
    rootCauseFreq.set(rc, (rootCauseFreq.get(rc) ?? 0) + 1);
  }
  const commonRootCauses = [...rootCauseFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([rc]) => rc);

  // Aggregate verifiedFixes by (symptomPattern, rootCause) key
  const fixMap = new Map<string, VerifiedFix>();
  for (const c of resolvedWithLessons) {
    const l = c.lessons!;
    const key = `${l.symptomPattern}||${l.rootCause}`;
    const existing = fixMap.get(key);
    if (existing) {
      existing.sourceCaseIds.push(c.id);
    } else {
      fixMap.set(key, {
        symptomPattern: l.symptomPattern,
        rootCause: l.rootCause,
        fix: l.fix,
        sourceCaseIds: [c.id]
      });
    }
  }

  const knowledge: FeatureKnowledge = {
    commonRootCauses,
    verifiedFixes: Array.from(fixMap.values()),
    updatedAt: new Date().toISOString(),
    sourceCaseCount: resolvedWithLessons.length
  };

  return await updateFeature({ ...feature, knowledge });
}
