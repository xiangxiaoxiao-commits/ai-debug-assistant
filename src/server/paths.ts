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

export function indexFile(): string {
  return path.join(casesDir(), 'index.json');
}
