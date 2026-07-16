// Pluggable memory system — model-agnostic. All types here are consumed
// via both HTTP endpoints (src/app/api/memory/**) and the MCP server
// (src/mcp/memory-server.ts). Do not import case/feature/bug types here.

import { z } from 'zod';

export type MemoryKind =
  | 'core'         // stable project identity (tech stack, layout, conventions)
  | 'semantic'     // abstract facts / claims / rules
  | 'procedural'   // how-to / playbook templates
  | 'resource'     // pointer to external artefacts (code snapshot, schema dump)
  | 'episodic';    // specific past events

export const memoryKindSchema = z.enum(['core', 'semantic', 'procedural', 'resource', 'episodic']);

export interface Project {
  id: string;
  name: string;
  repoPath?: string;        // normalized absolute path (repoPath is the primary identity)
  aliases?: string[];
  identity?: ProjectIdentity;
  createdAt: string;
  updatedAt: string;
  memoryCount: number;
}

export interface ProjectIdentity {
  techStack?: string[];
  languages?: string[];
  layout?: string;
  conventions?: string[];
  updatedAt: string;
  updatedBy: 'llm' | 'user' | 'system';
}

export interface MemoryEntry {
  id: string;
  projectId: string;
  kind: MemoryKind;
  content: string;              // the fact / claim / playbook / snippet — plain text
  tags: string[];               // free-form labels for filtering
  strength: number;             // times reinforced; starts at 1
  sources?: string[];           // opaque source refs (e.g. caseId, url, filename)
  createdAt: string;
  updatedAt: string;
  updatedBy: 'llm' | 'user' | 'system';
  metadata?: Record<string, unknown>;
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const projectIdentitySchema = z.object({
  techStack: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  layout: z.string().optional(),
  conventions: z.array(z.string()).optional(),
  updatedAt: z.string(),
  updatedBy: z.enum(['llm', 'user', 'system'])
});

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  repoPath: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  identity: projectIdentitySchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  memoryCount: z.number().nonnegative()
});

export const memoryEntrySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  kind: memoryKindSchema,
  content: z.string().min(1),
  tags: z.array(z.string()),
  strength: z.number().nonnegative(),
  sources: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: z.enum(['llm', 'user', 'system']),
  metadata: z.record(z.unknown()).optional()
});

export const createProjectInputSchema = z.object({
  name: z.string().min(1),
  repoPath: z.string().optional(),
  aliases: z.array(z.string()).optional()
});

export const updateProjectInputSchema = z.object({
  name: z.string().min(1).optional(),
  repoPath: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  identity: projectIdentitySchema.partial().optional()
});

export const rememberInputSchema = z.object({
  kind: memoryKindSchema,
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  updatedBy: z.enum(['llm', 'user', 'system']).optional(),
  reinforceIfSimilar: z.boolean().optional()   // if true, skip add and +1 strength on similar existing entry
});

export const recallInputSchema = z.object({
  query: z.string().min(1),
  kinds: z.array(memoryKindSchema).optional(),
  tags: z.array(z.string()).optional(),
  topK: z.number().int().positive().max(50).optional()
});

export const updateMemoryInputSchema = z.object({
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  strength: z.number().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional()
});

export interface RecallHit {
  entry: MemoryEntry;
  score: number;
}

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
export type RememberInput = z.infer<typeof rememberInputSchema>;
export type RecallInput = z.infer<typeof recallInputSchema>;
export type UpdateMemoryInput = z.infer<typeof updateMemoryInputSchema>;
