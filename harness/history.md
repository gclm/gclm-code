# 变更历史

## 2026-04-04

- 基于 `docs` 现有文档重新梳理项目阶段，确认当前属于 `scope-refresh` 而非新规划。
- 判断发布链路已基本完成，主线从“是否能发布”切换为“是否完成 runtime config 与 provider 语义收口”。
- 新增项目状态文件，建立 `roadmap + harness` 作为当前阶段单一状态源。
- 确认当前执行顺序：
  - 先做 `analytics -> runtime config` 语义迁移
  - 再做 provider 旧命名清理
- 按“不要保留兼容层，直接修复断点”的策略完成本轮迁移：删除了 `src/services/analytics/config.ts`、`growthbook.ts`、`sinkKillswitch.ts` 等旧路径。
- 将 `src/services/analytics/metadata.ts` 迁移为 `src/services/toolLogging/metadata.ts`，并把工具日志类型名收口为 `SafeLogValue`。
- 删除无引用旧实现 `src/utils/telemetry/bigqueryExporter.ts`。
- 完成 `src/services/analytics/index.ts` 类型边界中性化：统一改为 `SafeEventValue / PiiEventValue`，并通过 `bun run verify`。
