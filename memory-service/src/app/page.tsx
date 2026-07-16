export default function HomePage() {
  const port = process.env.PORT ?? '8788';
  const dataDir = process.env.AI_MEMORY_HOME ?? process.env.AI_DEBUG_HOME ?? '~/.ai-memory-service';

  return (
    <main>
      <h1>AI Memory Service</h1>
      <p>本地优先的 AI 记忆服务。为 AI agent 提供持久化的项目记忆，支持 HTTP API 和 MCP 协议。</p>
      <p>服务运行中，端口 <code>{port}</code>。数据目录：<code>{dataDir}</code></p>

      <h2>HTTP API 端点</h2>
      <ul>
        <li><code>GET /api/health</code> — 健康检查</li>
        <li><code>GET /api/memory/projects</code> — 列出所有项目</li>
        <li><code>POST /api/memory/projects</code> — 创建项目</li>
        <li><code>GET /api/memory/projects/:id</code> — 获取项目详情</li>
        <li><code>PATCH /api/memory/projects/:id</code> — 更新项目</li>
        <li><code>DELETE /api/memory/projects/:id</code> — 删除项目</li>
        <li><code>GET /api/memory/projects/:id/memories</code> — 列出记忆</li>
        <li><code>POST /api/memory/projects/:id/memories</code> — 写入记忆 (remember)</li>
        <li><code>POST /api/memory/projects/:id/recall</code> — 召回记忆 (recall)</li>
        <li><code>GET /api/memory/projects/:id/memories/:memoryId</code> — 获取单条记忆</li>
        <li><code>PATCH /api/memory/projects/:id/memories/:memoryId</code> — 更新记忆</li>
        <li><code>DELETE /api/memory/projects/:id/memories/:memoryId</code> — 删除记忆 (forget)</li>
      </ul>

      <h2>MCP 集成</h2>
      <p>在你的 MCP 客户端（如 Claude Desktop / Cursor）中添加如下配置：</p>
      <pre>{`{
  "mcpServers": {
    "ai-memory": {
      "command": "node",
      "args": ["/path/to/ai-memory-service/mcp/memory-server.js"],
      "env": {
        "AI_MEMORY_HOME": "/your/data/dir"
      }
    }
  }
}`}</pre>

      <h2>快速示例（curl）</h2>
      <pre>{`# 创建项目
curl -X POST http://localhost:${port}/api/memory/projects \\
  -H 'content-type: application/json' \\
  -d '{"name":"my-project","repoPath":"/workspace/my-project"}'

# 写入记忆
curl -X POST http://localhost:${port}/api/memory/projects/<id>/memories \\
  -H 'content-type: application/json' \\
  -d '{"kind":"semantic","content":"所有 DTO 转换在 assembler 层","tags":["convention"]}'

# 召回记忆
curl -X POST http://localhost:${port}/api/memory/projects/<id>/recall \\
  -H 'content-type: application/json' \\
  -d '{"query":"DTO 怎么转的","topK":5}'`}</pre>
    </main>
  );
}
