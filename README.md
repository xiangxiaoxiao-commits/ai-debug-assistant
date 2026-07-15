# AI Debug Assistant

Local-first visual web workbench for engineering troubleshooting.

## Phase 1 已完成

- 本地 Web UI，端口 8787
- Case 表单 + 证据面板 + Pipeline 骨架
- 证据分级 L0–L3 实时计算
- 本地 JSON 持久化（`~/.ai-debug-assistant/`）
- 模型配置 UI（Key 仅本会话 sessionStorage）
- Case 导出 JSON

## 快速开始

```bash
npm install
npm run dev
open http://localhost:8787
```

## 数据位置

`~/.ai-debug-assistant/`（可用环境变量 `AI_DEBUG_HOME` 覆盖）

## 测试

```bash
npm run test        # 一次运行
npm run test:watch  # 监听模式
npm run typecheck
```

## 参考文档

- 设计规格：[docs/superpowers/specs/2026-07-14-ai-debug-assistant-design.md](./docs/superpowers/specs/2026-07-14-ai-debug-assistant-design.md)
- Phase 1 计划：[docs/superpowers/plans/2026-07-14-phase-1-static-workbench.md](./docs/superpowers/plans/2026-07-14-phase-1-static-workbench.md)

## 下一步（Phase 2）

- 接 OpenAI-compatible LLM
- Rule Engine 骨架
- Report JSON schema 校验
- Pipeline Runner 状态推进
