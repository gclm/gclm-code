# Gclm Code 文档索引

当前 `docs` 按主题分组，便于按阶段查看。

## 1. release（发布与交付）

- `docs/release/gateway-smoke-and-login.md`
  - 网关 smoke 与登录验收
- `docs/release/gateway-auth-model-flow.md`
  - Gateway 登录、退出与模型选择流程说明
- `docs/release/FEATURES.en.md`
  - 功能开关审计（英文）
- `docs/release/FEATURES.zh-CN.md`
  - 功能开关审计（中文对照）

## 2. overview（阶段路线）

- `docs/overview/install-and-upgrade.md`
  - 区分 npm 全局安装版与仓库本地构建版的安装、升级与判断方式
- `docs/gclm-code-server/README.md`
  - `gclm-code-server` 专题索引，集中管理远程控制、Web、飞书、API 与 `SQLite` 设计文档
- `docs/gclm-code-server/remote-capabilities.md`
  - 盘点当前仓库已有远程能力、入口与可直接尝试范围
- `docs/gclm-code-server/architecture.md`
  - 基于 `gclm-code-server` 的统一远程架构完整方案，已明确 `SQLite` 本地控制面存储、Web 与渠道分层、以及多渠道统一接入边界
- `docs/gclm-code-server/module-design.md`
  - `gclm-code-server` 的模块拆分、目录结构、`SQLite` 存储职责与技术栈建议
- `docs/gclm-code-server/api-dto-design.md`
  - `gclm-code-server` 第一期 API、stream event 与 DTO 设计稿，已拆分 Web 专属 stream 信息与渠道原始 payload / 内部标准 DTO
- `docs/gclm-code-server/sqlite-schema-design.md`
  - `gclm-code-server` 一期 `SQLite` schema、索引、状态流转与 migration 设计稿
- `docs/gclm-code-server/feishu-remote-architecture.md`
  - 飞书作为远程入口时的推荐架构与边界
- `docs/gclm-code-server/self-hosted-web-plan.md`
  - 自建 Web 控制台方案、`references/tlive` Web 的复用边界，以及 `gclm-code-server` 统一中台建议
- `docs/overview/roadmap.md`
  - 当前阶段状态与后续动作
- `docs/overview/profile-env-vars.md`
  - `CLAUDE_CODE_PROFILE_*` 环境变量说明：内存观测、启动分析、Query 管道性能
- `docs/overview/octopus-gc-oom-investigation.md`
  - Octopus 场景下 `gc` OOM 排查记录

## 3. hello2cc（能力集成与使用）

- `docs/hello2cc/README.md`
  - hello2cc 专题索引，包含当前项目的推荐阅读顺序、默认配置入口和日常使用建议
- `docs/hello2cc/capability-orchestration.md`
  - 解释 hello2cc 如何通过能力快照、路由提示、工具前纠偏与 session state 记忆提升第三方模型对宿主能力的感知
- `docs/hello2cc/gateway-integration-plan.md`
  - 给出 hello2cc 能力内建到当前 Gateway 的推荐架构、模块边界、接线位置与分阶段实施顺序
- `docs/hello2cc/gateway-lifecycle-sequence.md`
  - 通过生命周期时序图拆解 SessionStart、UserPromptSubmit、PreToolUse、PostToolUse 的闭环关系
- `docs/hello2cc/gateway-diagnostics.md`
  - 面向开发者说明 hello2cc 编排层的 debug 信号、session state 持久化方式与 `/resume` 后的排查路径
- `docs/hello2cc/gateway-status-and-resume.md`
  - 说明 `/status`、`/resume` 与 `hello2cc-state` 的关系，以及 `resumeSummaryStyle` 配置方式
- `docs/hello2cc/plugin-vs-deep-integration.md`
  - 对比 hello2cc 插件式、深度集成式与混合式方案，解释为什么当前项目更适合深度集成内核
- `docs/hello2cc/strategy-development.md`
  - 面向开发者说明如何新增 hello2cc strategy、如何使用 provider policy / quality gate / extraStrategies 设置项，以及如何排查策略命中
