#!/usr/bin/env node
// MCP server for the memory service. Speaks JSON-RPC 2.0 over stdio.
// Zero-dep: implements only the pieces of the MCP protocol we need
// (initialize, tools/list, tools/call).
//
// Register in your MCP client config:
//   {
//     "mcpServers": {
//       "ai-debug-memory": {
//         "command": "node",
//         "args": ["/path/to/ai-debug-assistant/dist/mcp/memory-server.js"]
//       }
//     }
//   }
//
// Or for dev: `npx tsx src/mcp/memory-server.ts`

import readline from 'node:readline';
import type { MemoryKind } from '@/domain/memory';
import {
  createProject,
  findProjectByRepoPath,
  findProjectByName,
  listProjects,
  getProject,
  updateProject,
  ensureDefaultProject
} from '@/memory/project-store';
import {
  remember,
  recall,
  listMemories,
  updateMemory,
  forget,
  getMemory
} from '@/memory/memory-store';

// ─── Tool definitions (advertised to the MCP client) ──────────────────────────

interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const tools: ToolDef[] = [
  {
    name: 'list_projects',
    description: '列出所有已知项目。返回 { projects: Project[] }',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => ({ projects: await listProjects() })
  },
  {
    name: 'ensure_project',
    description:
      '获取或创建项目：优先按 repoPath 匹配，其次按 name。如果都不存在则创建。返回 { project, created }。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        repoPath: { type: 'string' },
        aliases: { type: 'array', items: { type: 'string' } }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const name = (args.name as string | undefined) ?? '';
      const repoPath = args.repoPath as string | undefined;
      if (repoPath) {
        const existing = await findProjectByRepoPath(repoPath);
        if (existing) return { project: existing, created: false };
      }
      if (name) {
        const existing = await findProjectByName(name);
        if (existing) return { project: existing, created: false };
      }
      if (!name && !repoPath) {
        const def = await ensureDefaultProject();
        return { project: def, created: false };
      }
      const project = await createProject({
        name: name || (repoPath ?? '未命名').split(/[/\\]/).filter(Boolean).pop() || 'project',
        repoPath,
        aliases: args.aliases as string[] | undefined
      });
      return { project, created: true };
    }
  },
  {
    name: 'get_project',
    description: '按 id 拉取单个项目及其 identity。',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
      additionalProperties: false
    },
    handler: async (args) => ({ project: await getProject(args.projectId as string) })
  },
  {
    name: 'update_project_identity',
    description:
      '更新项目 core 记忆（identity）：techStack、languages、layout、conventions。以 patch 形式合并。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        techStack: { type: 'array', items: { type: 'string' } },
        languages: { type: 'array', items: { type: 'string' } },
        layout: { type: 'string' },
        conventions: { type: 'array', items: { type: 'string' } },
        updatedBy: { type: 'string', enum: ['llm', 'user', 'system'] }
      },
      required: ['projectId'],
      additionalProperties: false
    },
    handler: async (args) => {
      const { projectId, ...idPatch } = args as Record<string, unknown>;
      const project = await updateProject(projectId as string, {
        identity: {
          ...(idPatch as Record<string, unknown>),
          updatedAt: new Date().toISOString(),
          updatedBy: (idPatch.updatedBy as 'llm' | 'user' | 'system') ?? 'llm'
        } as import('@/domain/memory').ProjectIdentity
      });
      return { project };
    }
  },
  {
    name: 'remember',
    description:
      '写入一条记忆。kind 取值 core/semantic/procedural/resource/episodic。若 reinforceIfSimilar=true 且同 kind 下已有相似内容，则 +1 强度而非新建。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        kind: { type: 'string', enum: ['core', 'semantic', 'procedural', 'resource', 'episodic'] },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        sources: { type: 'array', items: { type: 'string' } },
        metadata: { type: 'object' },
        updatedBy: { type: 'string', enum: ['llm', 'user', 'system'] },
        reinforceIfSimilar: { type: 'boolean' }
      },
      required: ['projectId', 'kind', 'content'],
      additionalProperties: false
    },
    handler: async (args) => {
      const { projectId, ...input } = args as Record<string, unknown>;
      return remember(projectId as string, input as Parameters<typeof remember>[1]);
    }
  },
  {
    name: 'recall',
    description:
      '按自然语言 query 召回相关记忆（BM25 + strength 加权）。可选按 kinds 和 tags 过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        query: { type: 'string' },
        kinds: {
          type: 'array',
          items: { type: 'string', enum: ['core', 'semantic', 'procedural', 'resource', 'episodic'] }
        },
        tags: { type: 'array', items: { type: 'string' } },
        topK: { type: 'number' }
      },
      required: ['projectId', 'query'],
      additionalProperties: false
    },
    handler: async (args) => {
      const { projectId, ...input } = args as Record<string, unknown>;
      const hits = await recall(projectId as string, input as Parameters<typeof recall>[1]);
      return { hits };
    }
  },
  {
    name: 'list_memories',
    description: '列出项目下的记忆（可选按 kinds/tags 过滤），按 strength 降序。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        kinds: {
          type: 'array',
          items: { type: 'string', enum: ['core', 'semantic', 'procedural', 'resource', 'episodic'] }
        },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['projectId'],
      additionalProperties: false
    },
    handler: async (args) => {
      const memories = await listMemories(
        args.projectId as string,
        { kinds: args.kinds as MemoryKind[] | undefined, tags: args.tags as string[] | undefined }
      );
      return { memories };
    }
  },
  {
    name: 'update_memory',
    description: '更新记忆的内容、标签或强度。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        memoryId: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        strength: { type: 'number' },
        metadata: { type: 'object' }
      },
      required: ['projectId', 'memoryId'],
      additionalProperties: false
    },
    handler: async (args) => {
      const { projectId, memoryId, ...patch } = args as Record<string, unknown>;
      const memory = await updateMemory(
        projectId as string,
        memoryId as string,
        patch as Parameters<typeof updateMemory>[2]
      );
      return { memory };
    }
  },
  {
    name: 'forget',
    description: '删除单条记忆。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        memoryId: { type: 'string' }
      },
      required: ['projectId', 'memoryId'],
      additionalProperties: false
    },
    handler: async (args) => {
      await forget(args.projectId as string, args.memoryId as string);
      return { deleted: args.memoryId };
    }
  },
  {
    name: 'get_memory',
    description: '按 id 拉取单条记忆。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        memoryId: { type: 'string' }
      },
      required: ['projectId', 'memoryId'],
      additionalProperties: false
    },
    handler: async (args) => ({
      memory: await getMemory(args.projectId as string, args.memoryId as string)
    })
  }
];

// ─── JSON-RPC plumbing ────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const SERVER_INFO = { name: 'ai-debug-memory', version: '0.1.0' };
const PROTOCOL_VERSION = '2024-11-05';

function respond(res: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(res) + '\n');
}

async function handle(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  try {
    switch (req.method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO
          }
        };
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;   // notifications get no response
      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: tools.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema
            }))
          }
        };
      }
      case 'tools/call': {
        const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const tool = tools.find(t => t.name === params.name);
        if (!tool) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Unknown tool: ${params.name}` }
          };
        }
        const result = await tool.handler(params.arguments ?? {});
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            isError: false
          }
        };
      }
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${req.method}` }
        };
    }
  } catch (e) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: (e as Error).message }
    };
  }
}

function main(): void {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  // Serialize requests: process them in the order they arrive over stdin.
  // MCP clients expect responses that reflect state changes from earlier
  // requests to be visible in later ones; concurrent processing would race.
  let queue: Promise<void> = Promise.resolve();

  rl.on('line', (line) => {
    if (!line.trim()) return;
    queue = queue.then(async () => {
      let req: JsonRpcRequest;
      try {
        req = JSON.parse(line);
      } catch {
        respond({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' }
        });
        return;
      }
      const res = await handle(req);
      if (res !== null) respond(res);
    });
  });

  rl.on('close', async () => {
    // Drain the queue before exiting so batched stdin invocations
    // don't lose the tail of their responses.
    await queue;
    process.exit(0);
  });
}

main();
