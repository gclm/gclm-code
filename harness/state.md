# 项目状态

更新时间：2026-04-04

## 当前阶段

- Active phase：`M1 - /models 动态模型发现（进行中）`
- 当前 focus：
  - 落地务实版新方案：`M1 -> M2 -> M3 -> M4`
  - 优先解决模型发现层缺口（`/models` 动态拉取）
  - 保持当前 `anthropic-compatible` 可用路径稳定

## 当前判断

- 这是一次 `scope-refresh`，不是全新规划。
- 发布链路已基本落地，当前不以 release 作为主阻塞项。
- telemetry 第二批“直接删除”已推进较多，剩余重点是语义迁移而不是继续粗删。
- 当前不做 OAuth 大重构，避免为接入 OpenAI SDK 额外引入改造成本

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

- M1 执行中：基于现有配置与缓存能力，先打通第三方 `/models` 动态发现最小路径

## 已知未完成项

- `runtimeConfig/growthbook.ts` 仍沿用 `GrowthBook` 命名，后续可再判断是否进一步去品牌化或去历史产品语义
- 文档中的功能开关计数与源码现状存在轻微偏差，需后续同步
- `openai-compatible` 通用请求路径尚未接入（当前 OpenAI 仍偏 Codex 专用适配）
- `/models` 动态发现尚未接入第三方 provider 主链
- 动态模型缓存策略尚未形成统一 TTL/降级规则

## 执行边界

- 当前 must-fix：无
- same-batch can-include：文档与注释回写、后续阶段任务收敛
- follow-up：
  - provider 枚举进一步中性化（如 `firstParty`）
  - `runtimeConfig/growthbook.ts` 是否继续去品牌化
  - 第三方兼容 API 与 auth 策略层优化

## 新执行顺序（务实版）

1. `M1`：`/models` 动态模型发现
2. `M2`：`openai-compatible` 请求接入（可使用 OpenAI SDK）
3. `M3`：`anthropic-compatible` 补强
4. `M4`：收尾清理

## OAuth 策略结论

- 当前不建议为接入 OpenAI SDK 做 OAuth 重设计
- 建议复用现有 Codex OAuth token 存储/刷新链路，仅在请求接入层适配
- 触发 OAuth 重设计的条件：
  - 同一会话需要并发多 provider token 编排
  - 现有 token lifecycle 无法覆盖新 provider 的刷新/吊销语义
  - 现有 auth status 无法表达 provider 维度状态

## Phase 3 - Step 1 结论

- 已完成入口收敛，建议下一刀采用“最小可落地切口”：
  - 新增一个不依赖 `getSettings()` 的 first-party auth header helper（用于避免循环依赖）
  - 先在 `remoteManagedSettings` 与 `policyLimits` 两个重复度最高模块落地
  - `bootstrap` 暂可保持内联，作为第二批再迁移，降低回归面
- 该切口价值：
  - 直接减少认证 header 分叉逻辑
  - 不触碰 provider 选择主链（`getAPIProvider()`）
  - 风险可控，便于单批验证

## 环境与验收

- 运行环境：Bun 1.3.11 项目
- 当前统一验收门槛：`bun run verify`
- 当前策略已调整为“不保留兼容层，直接修复断点”
- 最新验证结果：2026-04-04 已执行本轮 `bun run verify`，通过；包含 `analytics/index.ts` 类型边界重命名后的全量验证
