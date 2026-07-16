# 文档目录

## 想接入通用记忆系统？

- **[MEMORY.md](./MEMORY.md)** —— Memory Service 外挂：HTTP + MCP + TS/Python SDK 三种接入方式
  可用于 Claude Desktop / Claude Code / Cursor / Aider / 自研 agent。
  10 个工具：ensure_project / remember / recall / list_memories / update_memory / forget / ...

## 想理解代码怎么跑的？（从这里开始）

**两条最长的链路**，分别对应"新建 Bug"和"追问/补数据"两个核心动作：

- **[CALL-GRAPH-CREATE-CASE.md](./CALL-GRAPH-CREATE-CASE.md)** —— `POST /api/cases` 完整链路
  1 次分类 + (0/1 次)相似检索 + 1 次 playbook 生成 = 最多 3 次 LLM 调用
  用户看到：Case + 归属功能 + 相关历史 + 排障流程草案

- **[CALL-GRAPH.md](./CALL-GRAPH.md)** —— `POST /api/cases/:id/messages` 完整链路
  8 步 trace：quick-ingest → read-code → load-knowledge → find-similar → build-prompt → llm-call → extract-summary → update-playbook
  用户看到：流式 markdown 回复 + 摘要卡刷新 + playbook 步骤推进

这两条链路串起了整个 Phase 4 交付的能力（把 bug 分类关联到功能、跨 bug 沉淀知识、可自定义排障流程、可观测的执行链路）。

## 想了解架构、模块划分？

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** —— 完整架构文档（Phase 3 版本，Phase 4 后基本仍适用）
  数据模型、落盘布局、Provider 抽象、Prompt 结构、Token 预算、代码读取安全边界、配置发现规则、API 总览、前端组件树、与老 spec 的差异对照

## 想上手用工具？（不看代码）

- **项目根 [README.md](../README.md)** —— 装、跑、用、配、常见问题

## 历史文档（仅供追溯设计演进）

- **[../DESIGN.md](../DESIGN.md)** —— Phase 1 前的原始英文设计。已过时，仅作为最初思考轨迹保留
- **[superpowers/specs/2026-07-14-ai-debug-assistant-design.md](./superpowers/specs/2026-07-14-ai-debug-assistant-design.md)** —— Phase 1 后重构的中文详细规格。部分已被实际实现替代（Rule Engine / Pipeline 完整状态机等未落地），差异见 ARCHITECTURE.md §14
- **[superpowers/plans/](./superpowers/plans/)** —— 各 Phase 的实施计划文档

## Phase 演进对照

| Phase | 交付 | 关键代码入口 |
|---|---|---|
| 1 | 静态工作台（Case 表单 + Evidence 面板 + Pipeline 骨架） | `src/domain/*`, `src/server/case-store.ts`, `src/server/evidence-store.ts` |
| 2 | LLM 流式 + 简化 UI | `src/server/llm-client.ts`, `src/server/prompt-builder.ts`, `src/app/api/analyze/route.ts` |
| 2.5 | 目录选择器 | `src/server/fs-browse.ts`, `src/components/analyze/folder-picker.tsx` |
| 3 | 对话 + Bug 管理 + 自动摘要 | `src/app/api/cases/[id]/messages/route.ts`, `src/server/summary-extractor.ts`, `src/components/bug/*` |
| 4A | 功能归类 + 相似检索 + 教训抽取 + 知识库 | `src/server/feature-*.ts`, `src/server/similarity-search.ts`, `src/server/lesson-extractor.ts`, `src/server/knowledge-builder.ts` |
| 4B | Trace 记录 + Playbook | `src/server/trace-recorder.ts`, `src/server/playbook-*.ts`, `src/app/api/cases/[id]/traces/*`, `src/app/api/cases/[id]/playbook/*` |
| 4C（未开始） | Phase 4 UI（feature 筛选、相似历史、trace timeline、playbook 编辑器） | 待做 |
