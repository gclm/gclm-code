# 路线图

更新时间：2026-04-04

## 总体结论

当前仓库已经越过“初始可发布化”阶段，进入“内核语义收口”阶段。

接下来的工作顺序已确认并固定为：

1. 先做 `Phase A + Phase B`（身份层稳定化）
2. 再做 `Phase C`（第三方 compatible 请求接入）
3. 最后做 `Phase D`（`/models` 动态模型发现与刷新）
4. `Phase E` 收尾清理

详细实施与验收标准见：

- [provider-auth-implementation-plan.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/overview/provider-auth-implementation-plan.md)

## Phase 0：已完成的基础收口

状态：`已完成 / 基本完成`

目标：建立可发布、可构建、可继续定制的基线。

已完成内容：

- npm 包名、`bin` 与 `publishConfig` 已配置完成
- `CI Verify` 工作流已落地
- `Release NPM` 工作流已落地
- 第二批 telemetry 清理中的多项“直接删除”已完成

## Phase 1：Runtime Config 语义迁移

状态：`已完成`

目标：把仍然活跃的运行时配置能力从 `analytics` 语义中拆出，避免后续架构继续背负“旧 telemetry 命名”。

任务：

- 新增 `src/services/runtimeConfig/` 中性边界
- 迁移 `growthbook` 的真实实现到中性目录
- 迁移 `analytics/config.ts` 到更中性的“非必要流量/遥测开关”判断模块
- 迁移 `sinkKillswitch` 到 runtime config 语义
- 删除旧 `analytics/*` 实现并直接修复调用点

验收：

- `bun run verify` 通过
- 新增实现不再以 `analytics` 作为真实语义归属
- 不保留兼容层，迁移后调用点全部直接落到新边界

## Phase 2：Provider 诊断命名清理

状态：`已完成`

目标：移除 `ForStatsig` 之类历史命名，让 provider 诊断字段回归中性语义。

任务：

- 在 provider 工具层新增中性命名 helper
- 更新 API logging / retry 中的调用点
- 移除新增统计平台耦合命名的入口

验收：

- API diagnostics 不再依赖 `ForStatsig` 命名
- `bun run verify` 通过

## Phase A + B：身份层稳定化

状态：`进行中`

目标：先统一 provider/auth 骨架，再稳定双 OAuth 登录链路（Gclm + Codex）。

当前进展：

- 已完成 Phase A 第一批：
  - 新增 `src/utils/http.ts:getFirstPartyAuthHeadersWithoutSettings`
  - `remoteManagedSettings` 与 `policyLimits` 已迁移到公共 helper
  - 已通过 `bun run verify`

下一步：

- 推进 Phase B：对齐 Gclm OAuth 与 Codex OAuth 的 session / refresh / diagnostics 语义

## Phase C：第三方 compatible 请求接入

状态：`待开始`

目标：接入 `openai-compatible / anthropic-compatible` 第三方请求通路。

## Phase D：`/models` 动态发现与刷新

状态：`待开始`

目标：把模型发现从静态枚举迁移为动态优先（含缓存与降级）。

## Phase E：收尾清理

状态：`待开始`

包含但不限于：

- 移除阶段性过渡代码
- 清理重复认证入口与旧命名
- 回写文档与状态，形成最终交付结论

## 最近进展

- 已删除 `src/utils/telemetry/bigqueryExporter.ts` 这类无引用孤岛旧实现
- 已将 `src/services/analytics/metadata.ts` 迁移为中性的 `src/services/toolLogging/metadata.ts`
- 已完成对应使用点迁移，并通过 `bun run verify`
- 已完成 `src/services/analytics/index.ts` 类型边界中性化，统一收口为 `SafeEventValue / PiiEventValue`
- 已确认本仓库当前策略为“不保留兼容层，直接修复断点”
- 已新增 provider/auth 实施文档（能力矩阵 + 分阶段验收标准）
- 已完成 Phase A 第一批 auth header 收口并通过验证

## 当前推荐动作

- 推荐下一步：`build`
- 当前 build 目标：进入 `Phase B`，对齐 Gclm OAuth / Codex OAuth 认证语义并保持现有行为稳定
