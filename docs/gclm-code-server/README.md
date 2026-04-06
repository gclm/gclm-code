# `gclm-code-server` 文档索引

当前目录集中管理 `gclm-code-server` 相关设计文档，便于按“现状 -> 架构 -> 模块 -> API -> 存储”顺序阅读。

## 建议阅读顺序

1. [remote-capabilities.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/remote-capabilities.md)
   - 当前仓库已有远程能力、入口与可直接尝试范围
2. [feishu-remote-architecture.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/feishu-remote-architecture.md)
   - 飞书作为远程入口时的能力边界与架构建议
3. [self-hosted-web-plan.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/self-hosted-web-plan.md)
   - 自建 Web Console 的范围、复用边界与落地判断
4. [architecture.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/architecture.md)
   - 统一远程架构总方案
5. [module-design.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/module-design.md)
   - 模块边界、目录结构与技术栈建议
6. [api-dto-design.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/api-dto-design.md)
   - 一期 API / DTO / stream contract
7. [sqlite-schema-design.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/sqlite-schema-design.md)
   - 一期 `SQLite` schema、索引、状态流转与 migration 设计

## 当前已修正的关键设计问题

- 已统一 `webhook` 幂等键规则，避免 API 与 schema 分别定义两套主逻辑
- 已明确 `channel_identities` 是渠道身份事实源，`session_bindings` 只承接 session 上下文绑定
- 已补 `stream token` 一期策略：短 TTL 签名 token，不承诺强撤销
- 已统一技术栈口径为 `Bun + TypeScript + Hono + zod + Bun WebSocket + SQLite`
- 已修正文档中的层级口径，避免“写五层但列六层”的歧义
