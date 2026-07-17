import path from 'node:path';
import os from 'node:os';

const DEFAULT_ROOT = path.join(os.homedir(), '.ai-debug-assistant');

export function getRoot(): string {
  return process.env.AI_DEBUG_HOME ?? DEFAULT_ROOT;
}

export function casesDir(): string {
  return path.join(getRoot(), 'cases');
}

export function caseDir(caseId: string): string {
  return path.join(casesDir(), caseId);
}

export function caseFile(caseId: string): string {
  return path.join(caseDir(caseId), 'case.json');
}

export function evidenceDir(caseId: string): string {
  return path.join(caseDir(caseId), 'evidence');
}

export function evidenceFile(caseId: string, evidenceId: string): string {
  return path.join(evidenceDir(caseId), `${evidenceId}.json`);
}

export function attachmentsDir(caseId: string): string {
  return path.join(caseDir(caseId), 'attachments');
}

export function attachmentFile(caseId: string, attachmentId: string, ext: string): string {
  return path.join(attachmentsDir(caseId), `${attachmentId}.${ext}`);
}

export function indexFile(): string {
  return path.join(casesDir(), 'index.json');
}

export function configFile(): string {
  return path.join(getRoot(), 'config.json');
}

export function featuresDir(): string {
  return path.join(getRoot(), 'features');
}

export function featureFile(featureId: string): string {
  return path.join(featuresDir(), `${featureId}.json`);
}

export function featuresIndexFile(): string {
  return path.join(featuresDir(), 'index.json');
}

export function tracesDir(caseId: string): string {
  return path.join(caseDir(caseId), 'traces');
}

export function traceFile(caseId: string, traceId: string): string {
  return path.join(tracesDir(caseId), `${traceId}.json`);
}

// ─── Memory service paths ─────────────────────────────────────────────────────

export function memoryRoot(): string {
  return path.join(getRoot(), 'memory');
}

export function projectsIndexFile(): string {
  return path.join(memoryRoot(), 'projects', 'index.json');
}

export function projectDir(projectId: string): string {
  return path.join(memoryRoot(), 'projects', projectId);
}

export function projectFile(projectId: string): string {
  return path.join(projectDir(projectId), 'project.json');
}

export function memoriesDir(projectId: string): string {
  return path.join(projectDir(projectId), 'memories');
}

export function memoryFile(projectId: string, memoryId: string): string {
  return path.join(memoriesDir(projectId), `${memoryId}.json`);
}
