import path from 'node:path';
import os from 'node:os';

// Default root: ~/.ai-memory-service
// Priority: AI_MEMORY_HOME > AI_DEBUG_HOME (backward compat) > default
const DEFAULT_ROOT = path.join(os.homedir(), '.ai-memory-service');

export function getRoot(): string {
  return process.env.AI_MEMORY_HOME ?? process.env.AI_DEBUG_HOME ?? DEFAULT_ROOT;
}

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
