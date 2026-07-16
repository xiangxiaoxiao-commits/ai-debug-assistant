# AI Memory Service

本地优先的 AI 记忆服务，为 AI agent（Claude、Cursor 等）提供跨会话的项目记忆。支持 HTTP API 和 MCP 协议，零云依赖，数据全部存在本地磁盘。

## 用途场景

- AI 编程助手记住你的项目约定（"DTO 转换在 assembler 层"），下次对话无需重复说明
- 多个 AI 工具通过同一个记忆服务共享项目知识（MCP 接入 Claude Desktop + Cursor 同时挂载）

## 快速开始

```bash
# 需要 Node.js 20+
npm install
npm run dev       # http://localhost:8788
```

或者运行预打包版本（解压 zip 后）：

```bash
# macOS / Linux
./start.sh

# Windows
双击 start.bat
```

## MCP 集成

在 Claude Desktop / Cursor 的 MCP 配置文件中添加：

```json
{
  "mcpServers": {
    "ai-memory": {
      "command": "node",
      "args": ["/path/to/ai-memory-service/mcp/memory-server.js"],
      "env": {
        "AI_MEMORY_HOME": "/Users/yourname/.ai-memory-service"
      }
    }
  }
}
```

- `args` 中填写 zip 解压后 `mcp/memory-server.js` 的**绝对路径**
- `AI_MEMORY_HOME` 指定数据目录（可选，默认 `~/.ai-memory-service`）
- 如果你之前用过 `ai-debug-assistant`，可将 `AI_MEMORY_HOME` 指向 `~/.ai-debug-assistant` 以复用旧数据（或设 `AI_DEBUG_HOME` 作为兼容 fallback）

## HTTP API 示例

```bash
BASE=http://localhost:8788

# 1. 创建项目
curl -s -X POST $BASE/api/memory/projects \
  -H 'content-type: application/json' \
  -d '{"name":"my-project","repoPath":"/workspace/my-project"}' | jq .

# 2. 写入记忆（用返回的 project.id 替换 <id>）
curl -s -X POST $BASE/api/memory/projects/<id>/memories \
  -H 'content-type: application/json' \
  -d '{"kind":"semantic","content":"所有 DTO 转换在 assembler 层完成","tags":["convention"]}' | jq .

# 3. 召回记忆
curl -s -X POST $BASE/api/memory/projects/<id>/recall \
  -H 'content-type: application/json' \
  -d '{"query":"DTO 怎么转的","topK":5}' | jq .

# 健康检查
curl -s $BASE/api/health
```

## Python SDK

```python
from examples.python.memory_client import MemoryClient

client = MemoryClient("http://localhost:8788")
project = client.ensure_project(name="my-project", repo_path="/workspace/my-project")
client.remember(project["id"], kind="semantic", content="DTO 转换在 assembler 层", tags=["convention"])
hits = client.recall(project["id"], "DTO 怎么转的", top_k=3)
```

## 打包分发

```bash
npm run package
# 输出：dist/ai-memory-service-<version>-<timestamp>.zip
```

## 数据存储 & 隐私

- 所有数据存储在本地：`~/.ai-memory-service/`（可通过 `AI_MEMORY_HOME` 环境变量更改）
- 数据格式：JSON 文件，可直接查看和备份
- 完全本地运行，不访问任何外部网络

## 参考文档

如果你是从朋友那收到这个包的，对方桌面上有一份完整介绍文档 `~/Desktop/AI记忆系统介绍.md`，建议一并要来阅读。
