import fs from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import type { Feature } from '@/domain/types';
import { featureSchema, featureIndexEntrySchema } from '@/domain/schemas';
import { featuresDir, featureFile, featuresIndexFile } from './paths';
import { writeJsonAtomic, readJson, fileExists } from './fs-atomic';
import { z } from 'zod';

const featureIndexArraySchema = z.array(featureIndexEntrySchema);

type FeatureIndexEntry = z.infer<typeof featureIndexEntrySchema>;

async function readFeaturesIndex(): Promise<FeatureIndexEntry[]> {
  if (!(await fileExists(featuresIndexFile()))) return [];
  try {
    return featureIndexArraySchema.parse(await readJson(featuresIndexFile()));
  } catch {
    return [];
  }
}

async function writeFeaturesIndex(entries: FeatureIndexEntry[]): Promise<void> {
  await writeJsonAtomic(featuresIndexFile(), entries);
}

function toIndexEntry(f: Feature): FeatureIndexEntry {
  return {
    id: f.id,
    name: f.name,
    bugCount: f.bugCount,
    resolvedCount: f.resolvedCount,
    updatedAt: f.updatedAt
  };
}

async function upsertIndex(f: Feature): Promise<void> {
  const cur = await readFeaturesIndex();
  const next = cur.filter(e => e.id !== f.id);
  next.push(toIndexEntry(f));
  next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  await writeFeaturesIndex(next);
}

async function removeFromIndex(id: string): Promise<void> {
  const cur = await readFeaturesIndex();
  await writeFeaturesIndex(cur.filter(e => e.id !== id));
}

export async function createFeature(input: { name: string; aliases?: string[] }): Promise<Feature> {
  const now = new Date().toISOString();
  const f: Feature = {
    id: uuid(),
    name: input.name,
    aliases: input.aliases,
    createdAt: now,
    updatedAt: now,
    bugCount: 0,
    resolvedCount: 0
  };
  featureSchema.parse(f);
  await writeJsonAtomic(featureFile(f.id), f);
  await upsertIndex(f);
  return f;
}

export async function getFeature(id: string): Promise<Feature> {
  const file = featureFile(id);
  if (!(await fileExists(file))) throw new Error(`Feature not found: ${id}`);
  const raw = await readJson<Feature>(file);
  return featureSchema.parse(raw);
}

export async function updateFeature(f: Feature): Promise<Feature> {
  const next = { ...f, updatedAt: new Date().toISOString() };
  featureSchema.parse(next);
  await writeJsonAtomic(featureFile(next.id), next);
  await upsertIndex(next);
  return next;
}

export async function listFeatures(): Promise<Feature[]> {
  const dir = featuresDir();
  if (!(await fileExists(dir))) return [];
  const entries = await fs.readdir(dir);
  const features: Feature[] = [];
  for (const e of entries) {
    if (!/^[0-9a-f-]{36}\.json$/.test(e)) continue;
    try {
      features.push(await getFeature(e.replace('.json', '')));
    } catch {
      // skip corrupted
    }
  }
  return features.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteFeature(id: string): Promise<void> {
  const file = featureFile(id);
  await fs.rm(file, { force: true });
  await removeFromIndex(id);
}

export async function findFeatureByName(name: string): Promise<Feature | null> {
  const all = await listFeatures();
  return all.find(f => f.name === name) ?? null;
}

export async function incrementFeatureStats(
  id: string,
  delta: { bug?: number; resolved?: number }
): Promise<void> {
  const f = await getFeature(id);
  const bugCount = Math.max(0, f.bugCount + (delta.bug ?? 0));
  const resolvedCount = Math.max(0, f.resolvedCount + (delta.resolved ?? 0));
  await updateFeature({ ...f, bugCount, resolvedCount });
}
