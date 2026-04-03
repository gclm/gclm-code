# 路线图

更新时间：2026-04-04

## 总体结论

当前仓库已经越过“初始可发布化”阶段，进入“内核语义收口”阶段。

接下来的工作顺序应保持为：

1. 在已完成的语义迁移基础上，确认剩余历史命名边界是否还值得继续清理
2. 优先评估 provider / auth / updater 这类更高价值的结构性改造入口
3. 保持当前无兼容层策略，遇到断点直接修复，不再引入过渡 re-export

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

## Phase 3：后续结构性改造

状态：`当前下一阶段`

包含但不限于：

- OpenAI compatible / Anthropic compatible provider 抽象
- 认证策略层重构
- 自有自动升级链路替换
- 继续清理剩余历史类型与命名边界（例如 `runtimeConfig/growthbook.ts` 是否继续去品牌化）
- 评估 `analytics/index.ts` 这一 no-op 事件边界是否还需要进一步收缩对外 surface

## 最近进展

- 已删除 `src/utils/telemetry/bigqueryExporter.ts` 这类无引用孤岛旧实现
- 已将 `src/services/analytics/metadata.ts` 迁移为中性的 `src/services/toolLogging/metadata.ts`
- 已完成对应使用点迁移，并通过 `bun run verify`
- 已完成 `src/services/analytics/index.ts` 类型边界中性化，统一收口为 `SafeEventValue / PiiEventValue`
- 已确认本仓库当前策略为“不保留兼容层，直接修复断点”

## 当前推荐动作

- 推荐下一步：`build`
- 当前 build 目标：从 `Phase 3` 中挑选一个高价值入口继续推进，优先考虑 provider / auth / updater 结构改造，其次再做剩余命名收口
