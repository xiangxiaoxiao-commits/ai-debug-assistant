# Memory Service — 通用的 AI 记忆外挂

一套模型无关的记忆系统，专注于**跨对话、跨会话、跨工具**地持续积累对每个项目的理解。
它既是 ai-debug-assistant 本身用的记忆层，也可以作为独立的外挂给任意 LLM 应用使用（Claude Desktop、Claude Code、Cursor、Aider、OpenAI Assistants、自研 Python/Node 脚本…）。

## 设计哲学

参考 Tulving 的 [MIRIX 六层分类](https://arxiv.org/html/2507.07957v1) 和
[Memory OS](https://arxiv.org/html/2506.06326v1)，本系统实现了 5 种记忆类型：

| kind | 用途 | 触发写入 | 何时召回 |
|---|---|---|---|
| `core` | 项目稳定身份（技术栈、目录、约定） | 首次接触新项目 + 后续持续更新 | 每次对话开头，作为背景注入 |
| `semantic` | 抽象事实/规则（不绑定单次对话） | Bug 解决时提炼、用户手动 | 查询相关时 recall |
| `procedural` | 排障流程模板 | 成功排障后蒸馏 | 遇到相似问题时作为参考流程 |
| `resource` | 外部资料指针（代码快照、schema） | 代码读取后 | 需要"回想上次读过什么"时 |
| `episodic` | 具体事件（某次 bug 的完整过程） | 每次对话结束 | 找相似历史时 |

每条记忆有 `strength`（引用/确认次数）用于强化学习式的重要性衰减，有 `tags` 用于过滤。

## 三种接入方式

### 1. HTTP REST（任何客户端）

启动服务：

```bash
npm run dev     # 端口 8787
```

然后：

```bash
# 创建/复用项目（按 repoPath 幂等）
curl -X POST http://localhost:8787/api/memory/projects \
  -H 'content-type: application/json' \
  -d '{"name":"my-app","repoPath":"/Users/me/work/my-app"}'
# → { "project": { "id": "...", ... } }

# 写入记忆
curl -X POST http://localhost:8787/api/memory/projects/{id}/memories \
  -H 'content-type: application/json' \
  -d '{"kind":"semantic","content":"所有 DTO 在 assembler 层转换","tags":["convention"]}'

# 召回相关记忆
curl -X POST http://localhost:8787/api/memory/projects/{id}/recall \
  -H 'content-type: application/json' \
  -d '{"query":"DTO 转换在哪层","topK":5}'
```

完整 API：

| Method | Path | 用途 |
|---|---|---|
| GET  | `/api/memory/projects` | 列出所有项目 |
| POST | `/api/memory/projects` | 创建/复用项目（按 repoPath 幂等） |
| GET  | `/api/memory/projects/:id` | 单个项目 |
| PATCH | `/api/memory/projects/:id` | 更新项目 identity / name / aliases |
| DELETE | `/api/memory/projects/:id` | 删除项目及全部记忆 |
| GET  | `/api/memory/projects/:id/memories` | 列出记忆（可 `?kinds=a,b&tags=x,y`） |
| POST | `/api/memory/projects/:id/memories` | 写入一条（可 `reinforceIfSimilar` 去重） |
| GET  | `/api/memory/projects/:id/memories/:mid` | 单条 |
| PATCH | `/api/memory/projects/:id/memories/:mid` | 更新单条 |
| DELETE | `/api/memory/projects/:id/memories/:mid` | 删除单条 |
| POST | `/api/memory/projects/:id/recall` | 按 query 召回 top-k |

### 2. MCP（Claude Desktop / Claude Code / Cursor）

构建一次：

```bash
npm run build:mcp
```

产物：`dist/mcp/memory-server.js`（可执行 Node 脚本，零外部依赖）。

在 MCP 客户端配置中登记（Claude Desktop 的例子 `~/Library/Application Support/Claude/claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "ai-debug-memory": {
      "command": "node",
      "args": ["/绝对路径/ai-debug-assistant/dist/mcp/memory-server.js"],
      "env": {
        "AI_DEBUG_HOME": "/Users/me/.ai-debug-assistant"
      }
    }
  }
}
```

重启 MCP 客户端后，10 个工具会自动出现：

- `list_projects`、`ensure_project`、`get_project`、`update_project_identity`
- `remember`、`recall`、`list_memories`、`update_memory`、`forget`、`get_memory`

Claude 会自己在合适的时机调用这些工具——你只需要在对话里说"记住我们讨论过的 X" 或 "还记得上次那个 bug 吗"，模型就会 recall/remember。

### 3. SDK（Node / Python）

**TypeScript**：

```ts
import { MemoryClient } from '@ai-debug/memory-client';   // 项目内直接 import '@/memory/client'

const mem = new MemoryClient({ baseUrl: 'http://localhost:8787' });
const project = await mem.ensureProject({ repoPath: '/Users/me/work/backend' });

await mem.remember(project.id, {
  kind: 'semantic',
  content: '订单表的 tenant_id 从 header 而不是 session 拿',
  tags: ['convention', 'multi-tenant'],
  reinforceIfSimilar: true
});

const { hits } = await mem.recall(project.id, {
  query: '多租户是怎么隔离的',
  topK: 5
});
for (const h of hits) console.log(h.score, h.entry.content);
```

**Python**（stdlib only，见 `examples/python/memory_client.py`）：

```python
from memory_client import MemoryClient

mem = MemoryClient("http://localhost:8787")
project = mem.ensure_project(repo_path="/Users/me/work/backend")
mem.remember(project["id"], kind="semantic", content="...", reinforce_if_similar=True)
for h in mem.recall(project["id"], "多租户"): print(h)
```

## 数据落盘

`~/.ai-debug-assistant/memory/`（可用 `AI_DEBUG_HOME` 环境变量覆盖）：

```
memory/
└── projects/
    ├── index.json                        # 项目摘要索引（快速列表用）
    └── {projectId}/
        ├── project.json                  # core 记忆（identity）
        └── memories/
            └── {memoryId}.json           # 单条记忆
```

每次写入走原子写（`.tmp` + rename），进程崩溃不产半文件。

## 关键机制

- **BM25 + strength 加权召回**（`src/memory/bm25.ts`）：对小到中等规模（数百条/项目）的记忆用文本相关性打分，然后按 `strength` 加对数奖励。**无向量库依赖**。
- **相似度去重**（`reinforceIfSimilar`）：Token Jaccard ≥ 0.6 判定"同一件事"，遇到就 `strength +=1` 并合并 tags/sources 而不是新建。
- **CJK 分词**：内置 CJK 二元切分（bigram），中文查询"审批 显示"能命中"审批模块字段显示"这样的存储内容。
- **修改可追溯**：每条记忆有 `updatedBy: 'llm' | 'user' | 'system'`，能区分是 AI 自动写的还是人工调整的。

## 状态

- ✅ HTTP API（5 个端点）
- ✅ MCP server（10 个工具，stdio JSON-RPC 2.0，零 npm 依赖）
- ✅ TypeScript SDK
- ✅ Python SDK（stdlib）
- ✅ 30 个单元测试通过
- ✅ HTTP + MCP 端到端冒烟通过（真实调用）

## 未来

- v2：可选 embedding 层（保留 BM25 作为 fallback）
- v2：`compact` LLM 辅助的记忆合并/精炼工具
- v2：跨项目共享的 "global memory"（如通用工程约定）
- v3：把 ai-debug-assistant 自己的 `feature.knowledge` / `case.playbook` 迁到 memory 层，实现单一记忆中枢
