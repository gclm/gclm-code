# 项目状态

更新时间：2026-04-04

## 当前阶段

- Active phase：`M1 - /models 动态模型发现（进行中）`
- 当前 focus：
  - 落地网关优先方案：客户端统一走 `anthropic-compatible + ANTHROPIC_BASE_URL`
  - 协议切换与多 provider 聚合全部下沉网关
  - 模型发现优先读取网关 `/models`（含 `/v1/models` 回退）
  - 登录流重构：去除 Codex 登录选项，新增网关参数输入并自动保存

## 当前判断

- 这是一次 `scope-refresh`，不是全新规划。
- 发布链路已基本落地，当前不以 release 作为主阻塞项。
- 当前重点从“新增 provider 适配”转为“客户端收敛到网关参数化入口”。
- 客户端不继续扩展 provider 协议分支，统一依赖 `ANTHROPIC_BASE_URL/KEY` + 网关能力。

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
- 登录流/网关配置本轮落地：
- 第二刀净化（codex 全量移除）已完成：
  - 已删除 `src/services/oauth/codex-client.ts`
  - 已删除 `src/services/api/codex-fetch-adapter.ts`
  - 已删除 `src/constants/codex-oauth.ts`
  - 已删除 `src/utils/codex-fetch-adapter.ts`
  - 已移除 `auth/config/model/providers/oauth` 中全部 codex/openai-codex 相关定义
  - `ConsoleOAuthFlow` 已移除 `OpenAI Codex account` 选项与登录分支
  - 旧“3rd-party platform”说明页改为可交互网关配置：依次输入 `ANTHROPIC_BASE_URL`、`ANTHROPIC_API_KEY`
  - 输入后自动保存到 `GlobalConfig.env`，并同步当前 `process.env`
  - 保存后清理显式 provider flag：`CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY/OPENAI`
  - 保存后立即触发 `refreshProviderModelOptions(true)`，执行 `/models` 自动发现
  - 同批清理关键路径 codex 引用：
    - `src/services/api/client.ts` 移除 codex fetch adapter 分支
    - `src/cli/handlers/auth.ts` 移除 codex token 存储分支
    - `src/hooks/useApiKeyVerification.ts` 移除 codex subscriber 判定依赖

## 进行中

- M1 执行中：
  - `/models` 动态拉取与缓存链路已接入并可由网关配置流程即时触发刷新
  - 下一阶段进入网关主链稳定化与历史残余能力彻底清理（代码与文档）

## 已知未完成项

- `docs` 历史文档中可能仍有 codex 文案残留（不影响运行时）；后续可按文档清理批次处理
- `runtimeConfig/growthbook.ts` 仍沿用 `GrowthBook` 命名，后续可再判断是否进一步去品牌化或去历史产品语义
- 文档中的功能开关计数与源码现状存在轻微偏差，需后续同步
- 当前全量 typecheck 在仓库基线上有大量既有错误，无法作为本轮单改动通过标准

## 执行边界

- 当前 must-fix：
  - 网关主链稳定性验证与 /models 回退路径覆盖
- same-batch can-include：
  - 文档与注释回写、后续阶段任务收敛
- follow-up：
  - provider 枚举进一步中性化（如 `firstParty`）
  - `runtimeConfig/growthbook.ts` 是否继续去品牌化
  - 第三方兼容 API 与 auth 策略层优化

## 新执行顺序（务实版）

1. `M1`：`/models` 动态模型发现 + 登录入口网关参数化
2. `M2`：网关优先接入（客户端不再扩展 openai/codex 协议适配）
3. `M3`：`anthropic-compatible` 补强
4. `M4`：收尾清理（含 codex 遗留能力全量摘除）

## OAuth 策略结论

- 当前不建议因 provider 协议适配做 OAuth 重设计
- 客户端维持已有 token 链路，网关负责上游认证与路由编排
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
- 最新验证结果：2026-04-04 已执行 `bun run build`，构建通过（含第二刀 codex 全量移除）
- smoke 脚本已新增：`bun run smoke`、`bun run smoke:gui`
- 已修复网关模型发现回归：清空 provider flag 后仍可基于 `ANTHROPIC_BASE_URL` 刷新 `/models`
- 备注：全量 `bun run typecheck` 当前受仓库既有错误影响，不作为本轮唯一阻断
- 已按网关 URL 规则收敛模型发现端点：
  - `ANTHROPIC_BASE_URL=http://host` -> `http://host/v1/models`
  - `ANTHROPIC_BASE_URL=http://host/vN` -> `http://host/vN/models`
- 回归验证：
  - `http://localhost:8086` 场景通过，命中 `/v1/models`
  - `http://localhost:8086/v1` 场景通过，命中 `/v1/models`（由 base `/v1` + `/models` 组成）
  - `http://localhost:8086/v2` 场景失败（网关该版本路径无模型列表，属环境能力差异）
- 新增逐包接入回归脚本：`bun run smoke:packages`
- `smoke:packages` 已覆盖并验证 8 个本地 package 的主流程可加载能力：
  - `audio-capture-napi`
  - `image-processor-napi`
  - `modifiers-napi`
  - `url-handler-napi`
  - `@ant/claude-for-chrome-mcp`
  - `@ant/computer-use-input`
  - `@ant/computer-use-mcp`
  - `@ant/computer-use-swift`
- 端到端回归结果：
  - `bun run smoke:packages` 通过
  - `SMOKE_GATEWAY_BASE_URL=http://localhost:8086 ... bun run smoke` 通过（models=9）
  - `bun run smoke:gui` 通过
- smoke 包回归已升级为分层模式（core/gui/gateway/all）
- 新增脚本：
  - `bun run smoke:packages:core`
  - `bun run smoke:packages:gui`
  - `bun run smoke:packages:gateway`
  - `bun run smoke:packages`（all）
- 分层验收结果（2026-04-04）：
  - core 通过
  - gui 通过
  - gateway 通过（`http://localhost:8086/v1/models`, models=9）
  - all 通过
- CI `verify` 已补充分层 smoke：
  - `smoke:packages:core`
  - `smoke:packages:gateway`
  - gateway 依赖 Secrets：`SMOKE_GATEWAY_BASE_URL`、`SMOKE_GATEWAY_API_KEY`
- 新增运维文档：`docs/release/gateway-smoke-and-login.md`
- 新增登录等效验收脚本：`bun run smoke:login-gateway`
  - 脚本对齐 `/login` 平台路径核心逻辑：保存 `ANTHROPIC_BASE_URL/KEY` + 清理 provider flags + 强制刷新模型
  - 本地验收通过：`http://localhost:8086` 场景发现 9 个模型并写入缓存
- 已修复 brand-guard 阻断：清理 `packages/computer-use-mcp` 中一处 legacy 品牌注释
- 最新验证：`bun run verify` 通过
- 已检查新拷贝 packages 中 legacy 品牌文案用途：
  - 对外可见提示文案已替换为 `Gclm Code`
  - 协议/工具标识（如 `mcp__Claude_in_Chrome__*`）保持不变以避免兼容性风险
- 已替换位置（用户可见）：
  - `packages/computer-use-mcp/src/mcpServer.ts`
  - `packages/computer-use-mcp/src/toolCalls.ts`
  - `packages/computer-use-mcp/src/tools.ts`
- 验证结果：
  - `bun run brand:guard` 通过
  - `bun run smoke:packages:gui` 通过
