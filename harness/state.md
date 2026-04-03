# 项目状态

更新时间：2026-04-04

## 当前阶段

- Active phase：`Phase 3 - 后续结构性收口准备`
- 当前 focus：
  - 回写项目级 roadmap / harness 状态文件，确保与现状一致
  - 识别下一轮值得继续推进的结构性清理项
  - 保持 `runtimeConfig / toolLogging / analytics` 当前边界稳定

## 当前判断

- 这是一次 `scope-refresh`，不是全新规划。
- 发布链路已基本落地，当前不以 release 作为主阻塞项。
- telemetry 第二批“直接删除”已推进较多，剩余重点是语义迁移而不是继续粗删。
- 暂不展开以下大工程：
  - 全量 `OpenAI compatible / Anthropic compatible` API 改造
  - 认证策略层重构
  - 自有自动升级链路替换

## 已完成

- npm 包基础发布配置已落地：`@gclm/gclm-code`
- CI 验收工作流已落地：`bun run verify`
- npm tag 发布工作流已落地
- 第二批 telemetry 清理已有明显进展：
  - `feedbackSurvey*` 相关残留已不在主代码中
  - `IssueFlagBanner` 相关残留已删除
  - 多个 inert analytics sink / telemetry 壳模块已删除
- `analytics -> runtimeConfig` 语义迁移已完成：
  - 已新增 `src/services/runtimeConfig/` 中性边界
  - 已删除 `src/services/analytics/config.ts`
  - 已删除 `src/services/analytics/growthbook.ts`
  - 已删除 `src/services/analytics/sinkKillswitch.ts`
  - 当前策略为“不保留兼容层，直接修复断点”
- provider 诊断命名清理已完成：
  - `ForStatsig` 历史 helper 已迁移为中性命名
  - 对应调用点已完成收口并通过验证
- 工具日志边界清理已完成：
  - `src/services/analytics/metadata.ts` 已迁移为 `src/services/toolLogging/metadata.ts`
  - `SafeLogValue` 已替代旧的超长历史类型名
  - `src/utils/telemetry/bigqueryExporter.ts` 已删除
- `analytics/index.ts` 类型边界已完成中性化：
  - `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` -> `SafeEventValue`
  - `AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED` -> `PiiEventValue`

## 进行中

- 当前没有必须立刻继续的同批 must-fix；本轮主要是在已完成清理基础上做状态同步，并确认下一步优先级

## 已知未完成项

- `runtimeConfig/growthbook.ts` 仍沿用 `GrowthBook` 命名，后续可再判断是否进一步去品牌化或去历史产品语义
- 文档中的功能开关计数与源码现状存在轻微偏差，需后续同步

## 执行边界

- 当前 must-fix：无
- same-batch can-include：文档与注释回写、后续阶段任务收敛
- follow-up：
  - provider 枚举进一步中性化（如 `firstParty`）
  - `runtimeConfig/growthbook.ts` 是否继续去品牌化
  - 第三方兼容 API 与 auth 策略层重构

## 环境与验收

- 运行环境：Bun 1.3.11 项目
- 当前统一验收门槛：`bun run verify`
- 当前策略已调整为“不保留兼容层，直接修复断点”
- 最新验证结果：2026-04-04 已执行本轮 `bun run verify`，通过；包含 `analytics/index.ts` 类型边界重命名后的全量验证
