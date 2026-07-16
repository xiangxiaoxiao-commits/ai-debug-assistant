// Zero-dep TypeScript SDK for the memory HTTP API.
// Usable both inside this project (server-side) and by external Node/browser
// clients — just point baseUrl at the running memory service.

import type {
  Project,
  ProjectIdentity,
  MemoryEntry,
  MemoryKind,
  RecallHit,
  RememberInput,
  RecallInput,
  UpdateMemoryInput,
  CreateProjectInput,
  UpdateProjectInput
} from '@/domain/memory';

export interface MemoryClientOptions {
  baseUrl?: string;          // default http://127.0.0.1:8787
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export class MemoryClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly headers: Record<string, string>;

  constructor(opts: MemoryClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
    this.fetchFn = opts.fetch ?? fetch;
    this.headers = { 'content-type': 'application/json', ...(opts.headers ?? {}) };
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${url}`, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  // ─── Projects ─────────────────────────────────────────────────────────────

  listProjects(): Promise<{ projects: Project[] }> {
    return this.request('GET', '/api/memory/projects');
  }

  createProject(input: CreateProjectInput): Promise<{ project: Project; reused?: boolean }> {
    return this.request('POST', '/api/memory/projects', input);
  }

  /** Idempotent: reuses by repoPath or name if possible. */
  async ensureProject(input: { name?: string; repoPath?: string }): Promise<Project> {
    if (input.repoPath) {
      const { projects } = await this.listProjects();
      const norm = input.repoPath.replace(/\/+$/, '');
      const hit = projects.find(p => p.repoPath === norm);
      if (hit) return hit;
    }
    const { project } = await this.createProject({
      name: input.name || input.repoPath?.split('/').pop() || 'project',
      repoPath: input.repoPath
    });
    return project;
  }

  getProject(id: string): Promise<{ project: Project }> {
    return this.request('GET', `/api/memory/projects/${id}`);
  }

  updateProject(id: string, patch: UpdateProjectInput): Promise<{ project: Project }> {
    return this.request('PATCH', `/api/memory/projects/${id}`, patch);
  }

  updateIdentity(id: string, identity: Partial<ProjectIdentity>): Promise<{ project: Project }> {
    return this.updateProject(id, {
      identity: {
        ...identity,
        updatedAt: new Date().toISOString(),
        updatedBy: identity.updatedBy ?? 'llm'
      } as ProjectIdentity
    });
  }

  deleteProject(id: string): Promise<{ deleted: string }> {
    return this.request('DELETE', `/api/memory/projects/${id}`);
  }

  // ─── Memories ─────────────────────────────────────────────────────────────

  listMemories(
    projectId: string,
    filters?: { kinds?: MemoryKind[]; tags?: string[] }
  ): Promise<{ memories: MemoryEntry[] }> {
    const qs: string[] = [];
    if (filters?.kinds?.length) qs.push(`kinds=${filters.kinds.join(',')}`);
    if (filters?.tags?.length) qs.push(`tags=${filters.tags.join(',')}`);
    const suffix = qs.length ? `?${qs.join('&')}` : '';
    return this.request('GET', `/api/memory/projects/${projectId}/memories${suffix}`);
  }

  remember(projectId: string, input: RememberInput): Promise<{ entry: MemoryEntry; reinforced: boolean }> {
    return this.request('POST', `/api/memory/projects/${projectId}/memories`, input);
  }

  recall(projectId: string, input: RecallInput): Promise<{ hits: RecallHit[] }> {
    return this.request('POST', `/api/memory/projects/${projectId}/recall`, input);
  }

  updateMemory(projectId: string, memoryId: string, patch: UpdateMemoryInput): Promise<{ memory: MemoryEntry }> {
    return this.request('PATCH', `/api/memory/projects/${projectId}/memories/${memoryId}`, patch);
  }

  forget(projectId: string, memoryId: string): Promise<{ deleted: string }> {
    return this.request('DELETE', `/api/memory/projects/${projectId}/memories/${memoryId}`);
  }

  getMemory(projectId: string, memoryId: string): Promise<{ memory: MemoryEntry }> {
    return this.request('GET', `/api/memory/projects/${projectId}/memories/${memoryId}`);
  }
}
