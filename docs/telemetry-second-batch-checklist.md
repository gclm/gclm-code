# `free-code-main` 第二批清理清单

这份文档不是继续讨论“要不要做定制”，而是把第二批该怎么清，先收成一个可以直接执行的清单。

目标只有两个：

1. 继续把旧 `telemetry / analytics / feedback` 语义从主代码里收干净
2. 但不误伤后面一定还要保留的主干能力：`runtime config`、`provider/auth`、`updater`

## 一句话结论

第二批不应该粗暴地把 `analytics` 整个目录删空。

更合理的做法是分 4 类处理：

1. `直接删除`：旧产品埋点、问卷、事件字段建模、1P/Datadog/插件归因残留
2. `改名迁移`：实际是运行时配置能力，但还挂在 `analytics` 名下的模块
3. `保留但迁移语义`：`provider/auth/updater` 这些主干能力
4. `后置处理`：品牌、身份、远程会话、协议常量这些深耦合残留

## 范围说明

这份清单只覆盖第二批最适合处理的内容。

它不直接展开下面两类大工程：

1. 全量品牌替换
2. `OpenAI compatible / Anthropic compatible` 第三方 API 改造

这两块还会单独开后续实施阶段。

## 第一批之后，当前还明确残留什么

这几项属于“第一批已删掉主链，但还有语义残留”，适合在第二批顺手收干净。

### A. 配置与 schema 残留

- [src/utils/config.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/config.ts#L285) 第一批后曾保留 `feedbackSurveyState`
- [src/utils/settings/types.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/settings/types.ts#L656) 第一批后曾保留 `feedbackSurveyRate`

建议动作：

- 删除 `feedbackSurveyState`
- 删除 `feedbackSurveyRate`
- 如果需要兼容旧配置文件，只做一次读取兼容，不再继续暴露为正式设置项

### B. 注释与语义残留

- [src/utils/privacyLevel.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/privacyLevel.ts#L9) 还把 `feedback survey` 作为 telemetry 组成部分
- [src/utils/handlePromptSubmit.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/handlePromptSubmit.ts#L198) 第一批后注释曾写着 `/exit` 会展示 feedback dialog

建议动作：

- 统一改成当前真实语义
- 不再在代码注释里保留已删除功能的描述

### C. REPL 空壳接线残留

- [src/hooks/useIssueFlagBanner.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/hooks/useIssueFlagBanner.ts) 第一批后存在
- [src/components/PromptInput/IssueFlagBanner.tsx](/Users/gclm/workspace/lab/ai/gclm-code/src/components/PromptInput/IssueFlagBanner.tsx) 第一批后存在
- [src/screens/REPL.tsx](/Users/gclm/workspace/lab/ai/gclm-code/src/screens/REPL.tsx#L1675)
- [src/screens/REPL.tsx](/Users/gclm/workspace/lab/ai/gclm-code/src/screens/REPL.tsx#L4815)

当前状态：

- `useIssueFlagBanner()` 逻辑还在跑
- `IssueFlagBanner` 组件已经 `return null`

建议动作：

- 如果我们不再保留这条提示链路，就把接线和 hook 一起删掉
- 如果后面还想保留“引导用户主动报问题”这条能力，就重做成明确的本地支持入口，不继续沿用这套半残留实现

## 第二批分类清单

## 1. 直接删除

这部分删掉以后，仓库会更接近“无产品 telemetry 的可维护基线”。

### A. 旧 analytics metadata 字段建模体系

文件：

- [src/services/analytics/metadata.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/analytics/metadata.ts)

为什么删：

- 这不是本地 diagnostics
- 它做的是事件公共字段拼装、PII 清洗、归因、环境 metadata 建模
- 本质上是旧产品埋点平台的一部分

风险说明：

- 删除前要确认仍有哪些调用点依赖其类型或字段 helper
- 这一步适合和“删掉 inert analytics exporter”一起做

### B. 已 inert 的 analytics sink / exporter 实现

文件：

- [src/services/analytics/datadog.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/analytics/datadog.ts)
- [src/services/analytics/firstPartyEventLogger.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/analytics/firstPartyEventLogger.ts)
- [src/services/analytics/firstPartyEventLoggingExporter.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/analytics/firstPartyEventLoggingExporter.ts)

为什么删：

- 它们代表的是旧的远程上报通路
- 现在已经不再承担你们后续产品真正需要的能力
- 继续留着，只会让代码表面上看起来还保留了一套“完整 telemetry 平台”

### C. Plugin / Skill 归因 telemetry

文件：

- [src/utils/telemetry/pluginTelemetry.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/telemetry/pluginTelemetry.ts)
- [src/utils/telemetry/skillLoadedEvent.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/telemetry/skillLoadedEvent.ts)

为什么删：

- `plugin_id_hash`、`plugin_scope`、`enabled_via`、`skill_loaded` 这些都属于分析口径
- 对后续本地排障和自研版本演进帮助很小

### D. 明显只服务旧 telemetry 平台的壳模块

文件：

- [src/utils/telemetry/events.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/telemetry/events.ts)
- [src/utils/telemetry/bigqueryExporter.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/telemetry/bigqueryExporter.ts)

为什么删：

- 已经不再是产品主链的一部分
- 留下来的主要作用是增加噪音，而不是提供价值

## 2. 改名迁移

这部分不该删，问题在于名字和目录结构已经误导判断。

### A. `growthbook` 应该从 `analytics` 语义中拆出去

文件：

- [src/services/analytics/growthbook.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/analytics/growthbook.ts)

当前真实角色：

- feature flags
- dynamic config
- 版本 gate
- 运行时刷新机制

建议迁移方向：

- `src/services/runtimeConfig/growthbook.ts`
- 或 `src/services/featureFlags/growthbook.ts`

结论：

- `growthbook` 不是第二批删除对象
- 它是第二批最应该脱离 `analytics` 命名的对象

### B. `sinkKillswitch` 应改成运行时开关命名

文件：

- [src/services/analytics/sinkKillswitch.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/analytics/sinkKillswitch.ts)

建议迁移方向：

- `runtimeGate`
- `serviceKillswitch`
- `runtimeSwitch`

### C. `analytics/config.ts` 与 `analytics/index.ts` 应转成兼容层命名

文件：

- [src/services/analytics/config.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/analytics/config.ts)
- [src/services/analytics/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/analytics/index.ts)
- [src/services/analytics/sink.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/analytics/sink.ts)

当前问题：

- `isAnalyticsDisabled()` 这类命名会继续误导后续实现
- `index.ts` 实际已经只是 inert compatibility boundary

建议迁移方向：

- `eventCompat`
- `legacyEventApi`
- `runtimeTelemetryCompat`

## 3. 保留但迁移语义

这些是后面产品一定要用到的主干能力，不适合当作“第二批删除对象”。

### A. Provider 判定层

文件：

- [src/utils/model/providers.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/model/providers.ts)

当前问题：

- `getAPIProviderForStatsig()` 是明显的旧命名
- `firstParty` 也带强烈旧产品视角

建议动作：

- 保留 provider 判定主链
- 删除 `ForStatsig` 一类历史命名
- 后续把 `firstParty` 收敛成更中性的官方 provider 命名

### B. 认证与 OAuth 主干

文件：

- [src/utils/auth.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/auth.ts)
- [src/services/oauth/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/oauth/index.ts)
- [src/constants/oauth.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/constants/oauth.ts)

为什么保留：

- 后面明确还要保留 `Anthropic OAuth` 和 `OpenAI OAuth`
- 也要支持第三方 `OpenAI compatible` / `Anthropic compatible` API

当前问题：

- 常量命名和 URL 命名还深度耦合 `Claude` / `claude.ai` / `Console`
- 身份层还没有完全抽象成 provider-aware auth profiles

建议动作：

- 保留实现主干
- 后续做“认证策略层”重构，而不是在第二批里粗删

### C. 自动升级主干

文件：

- [src/utils/autoUpdater.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/autoUpdater.ts)
- [src/cli/update.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/cli/update.ts)
- [src/utils/plugins/pluginAutoupdate.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/plugins/pluginAutoupdate.ts)

为什么保留：

- 你已经明确要改造成自己的升级系统
- 这里保留的是升级链路与诊断能力，不是当前品牌实现

当前问题：

- bucket、包名、CLI 提示文案、平台命令都还是 `Claude Code`
- 还依赖 `growthbook` 的远程版本配置命名

建议动作：

- 第二批先不删 updater
- 只把它标为“主干保留、后续做自有升级链路替换”

## 4. 后置处理

## 已完成进展（截至当前）

第二批里以下清理已经实际完成并提交：

1. 删除第一批后遗留的 feedback 配置与注释残留
2. 删除 `IssueFlagBanner` 空壳链路
3. 删除 plugin/skill 归因 telemetry 模块及调用
4. 删除 inert analytics sink/exporter（`datadog`、`firstPartyEventLogger`、`firstPartyEventLoggingExporter`）

当前阶段（本次）新增完成：

1. `events.ts` 并入兼容边界并删除旧文件
2. `metadata.ts` 收敛为最小兼容层，移除环境/1P event 格式化等大块旧埋点建模
3. `growthbook.ts` 改为本地 runtime-config 兼容层：保留导出 API，不再做远端拉取、鉴权头注入、实验曝光上报、定时刷新
4. 删除未被业务引用的 `events_mono` generated telemetry schema 文件（`claude_code_internal_event`、`growthbook_experiment_event`、`common/v1/auth`）

### 本次 `growthbook` 清理说明

- 文件：[src/services/analytics/growthbook.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/analytics/growthbook.ts)
- 保留：现有导出函数签名（避免调用方大面积改动）
- 调整：所有 feature/config 读取仅来自本地覆盖与本地缓存
- 移除：remote eval、client init 网络请求、auth header 依赖、实验曝光日志、周期性远端刷新
- 验收：`bun run verify` 通过（以构建成功作为当前阶段标准）

### 本次保留的 `metadata` 最小导出

- `type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS`
- `sanitizeToolNameForAnalytics`
- `isToolDetailsLoggingEnabled`
- `isAnalyticsToolDetailsLoggingEnabled`
- `extractMcpToolDetails`
- `mcpToolDetailsForAnalytics`
- `extractSkillName`
- `extractToolInputForTelemetry`
- `getFileExtensionForAnalytics`
- `getFileExtensionsFromBashCommand`
- `getBashFileExtensionForAnalytics`

### 本次删除的文件

- [src/utils/telemetry/events.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/telemetry/events.ts)

### 本次替换的导入位置

`logOTelEvent` 统一改从 `services/analytics/index.ts` 导出使用：

- [src/services/api/logging.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/api/logging.ts)
- [src/hooks/toolPermission/permissionLogging.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/hooks/toolPermission/permissionLogging.ts)
- [src/services/tools/toolExecution.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/tools/toolExecution.ts)

这部分不是不重要，而是不适合在第二批和 telemetry 清理绑在一起做。

### A. 深层品牌与远程会话常量

文件：

- [src/constants/product.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/constants/product.ts)

原因：

- `PRODUCT_URL`
- `CLAUDE_AI_BASE_URL`
- `getClaudeAiBaseUrl()`
- `getRemoteSessionUrl()`

这些都已经不是简单文案替换，而是产品身份、远程入口、前后端协议边界。

### B. generated event schema 残留

文件：

- [src/types/generated/events_mono/claude_code/v1/claude_code_internal_event.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/types/generated/events_mono/claude_code/v1/claude_code_internal_event.ts)
- [src/types/generated/events_mono/growthbook/v1/growthbook_experiment_event.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/types/generated/events_mono/growthbook/v1/growthbook_experiment_event.ts)
- [src/types/generated/events_mono/common/v1/auth.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/types/generated/events_mono/common/v1/auth.ts)

原因：

- 这些大概率最终会被清掉
- 但前提是上游 import 链先拆干净

### C. 仓库级品牌露出

文件：

- [package.json](/Users/gclm/workspace/lab/ai/gclm-code/package.json)
- [README.md](/Users/gclm/workspace/lab/ai/gclm-code/README.md)

原因：

- 它们肯定要改
- 但属于后续品牌收口和发行策略的一部分，不是第二批 telemetry 清理的最佳入口

## 建议执行顺序

如果要把第二批拆成几个小提交，建议按这个顺序来。

### 提交 1：高确定性残留清理

- 删 `feedbackSurveyState`
- 删 `feedbackSurveyRate`
- 改 `privacyLevel` 注释
- 改 `/exit` 过期注释
- 删 `IssueFlagBanner` 空壳接线

这一批风险最低，也最能快速收干净第一批尾巴。

### 提交 2：analytics inert 壳与归因层删除

- 删 `metadata.ts`
- 删 `datadog.ts`
- 删 `firstPartyEventLogger.ts`
- 删 `firstPartyEventLoggingExporter.ts`
- 删 `pluginTelemetry.ts`
- 删 `skillLoadedEvent.ts`
- 清理对应 import 与启动接线

### 提交 3：runtime config 语义迁移

- 给 `growthbook` 换目录或换命名语义
- 给 `analytics/index.ts` 兼容层改名
- 让后续调用点不再看起来像“还在正常打 telemetry”

### 提交 4：后续专项

- branding / identity
- 自有 updater 改造
- 第三方 API provider 改造

## 明确不建议在第二批做的事

1. 不要在没有替代实现前直接删 `growthbook`
2. 不要把 `provider/auth/updater` 当成 telemetry 顺手删掉
3. 不要把品牌重构、第三方 API 改造、升级系统替换一次性混进第二批

## 当前拍板版结论

第二批最适合先做的是：

1. 收掉第一批残留的 `feedback/config/comment/banner` 尾巴
2. 删除 inert 的 `analytics exporter / plugin telemetry / skill telemetry` 旧壳
3. 明确把 `growthbook` 视为 `runtime config`，而不是 `analytics`
4. 把 `provider/auth/updater` 明确标记为保留主干，留待后续专项改造
