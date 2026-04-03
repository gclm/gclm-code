# `free-code-main` 遥测取舍清单

这份文档只回答一个问题：

我们到底要保留什么，删除什么。

这里不再展开长篇架构讨论，也不再保留多版本分析分支，目的是帮助快速拍板。

## 一句话结论

我们不需要保留 `telemetry`。

我们需要保留的是：

- 本地 diagnostics
- 运行时配置开关
- 自动升级排障
- Provider 兼容性排障
- 用户主动导出的支持包

应该删除的是：

- 产品行为统计
- 问卷与反馈漏斗
- UI 点击、展示、进入、退出等使用埋点
- 为云端分析服务的字段建模和归因体系

## 1. 必须保留

### A. 本地 API / Provider diagnostics

为什么保留：

- 你们后面要支持 `OpenAI 兼容` 和 `Anthropic 兼容` 的第三方 API
- 未来最常见的问题一定是模型发现、请求兼容、错误分类、重试/fallback

建议保留的信息：

- provider 类型
- base URL 的脱敏 host
- `/models` 拉取是否成功
- 模型名
- 请求耗时
- HTTP 状态码
- retry 次数
- fallback 是否触发
- 错误分类

当前代表模块：

- `src/services/api/logging.ts`
- `src/services/api/claude.ts`
- `src/services/api/withRetry.ts`
- `src/services/api/filesApi.ts`

### B. 本地 OAuth / 认证 diagnostics

为什么保留：

- 认证链路是高频故障点
- 你们后面至少还要保留 Anthropic OAuth、OpenAI OAuth，以及第三方兼容 API 的认证能力

建议保留的信息：

- 当前认证方式
- 当前阶段
- 失败阶段
- token refresh 是否成功
- keychain / config 保存是否失败
- 锁竞争与重试情况

明确不保留：

- access token
- refresh token
- 用户身份标识

当前代表模块：

- `src/components/ConsoleOAuthFlow.tsx`
- `src/utils/auth.ts`

### C. 自动升级 diagnostics

为什么保留：

- 你已经明确要重做自动升级
- 如果没有升级链路诊断，后续自家升级系统很难排查

建议保留的信息：

- 当前版本
- 目标版本
- 升级渠道
- 安装方式
- 下载/安装耗时
- lock contention
- checksum / permission / disk / network 类失败分类

当前代表模块：

- `src/components/AutoUpdater.tsx`
- `src/components/NativeAutoUpdater.tsx`
- `src/utils/nativeInstaller/installer.ts`
- `src/utils/nativeInstaller/download.ts`

### D. 运行时错误与退出 diagnostics

为什么保留：

- 这是最低成本但最高价值的本地证据
- 对 crash、异常退出、unhandled rejection 很关键

建议保留的信息：

- uncaught exception
- unhandled rejection
- shutdown signal
- 版本、平台、provider 摘要

当前代表模块：

- `src/utils/gracefulShutdown.ts`
- `src/utils/log.ts`
- `src/utils/debug.ts`

### E. 运行时配置开关

为什么保留：

- 它们不是 telemetry，而是功能控制系统
- 直接删会打断 updater kill switch、动态配置、feature flags

建议保留的能力：

- feature flags
- dynamic config
- updater min/max version
- 少量必要的运行时 gate

当前代表模块：

- `src/services/analytics/growthbook.ts`

注意：

- 这部分应该保留能力，但后续要从 `analytics` 语义里拆出去
- 它最终应该叫 `runtimeConfig` 或 `featureFlags`，而不是 telemetry

### F. 支持包导出能力

为什么保留：

- 当用户主动反馈问题时，需要最小必要证据
- 这比保留问卷和产品上报更有工程价值

建议导出的内容：

- 最近 diagnostics
- 错误日志
- 版本信息
- 平台信息
- provider 配置摘要
- updater 状态摘要

## 2. 可选保留

这部分不是必须全留，但如果后面想提升排障效率，可以保留“失败类事件”，不能原样保留“所有事件”。

### A. MCP / Bridge / Remote 故障类事件

保留条件：

- 连接失败
- 认证失败
- reconnect failed
- poll give up
- fatal error

不建议保留：

- started
- connected 成功路径统计
- session lifecycle 成功埋点

当前代表模块：

- `src/bridge/*`
- `src/services/mcp/*`

### B. Team Memory / Session Memory 的失败类事件

保留条件：

- sync pull / push 失败
- secret skipped
- entries capped
- 文件或状态异常

不建议保留：

- 初始化次数
- 提取频率
- 用户是否触发了某个记忆动作

当前代表模块：

- `src/services/teamMemorySync/index.ts`
- `src/services/SessionMemory/sessionMemory.ts`

### C. 配置系统与权限系统的异常类事件

保留条件：

- config parse error
- config lock contention
- stale write
- 真正异常的权限判定分歧

不建议保留：

- permission prompt 交互行为
- 设置项改动行为统计

当前代表模块：

- `src/utils/config.ts`
- `src/tools/BashTool/bashPermissions.ts`
- `src/tools/BashTool/bashSecurity.ts`
- `src/components/permissions/*`

## 3. 必须删除

### A. Survey / Feedback / 漏斗统计

删除原因：

- 这是最典型的产品 telemetry 思路
- 对你们做自己的产品内核帮助很小

当前代表模块：

- `src/components/FeedbackSurvey/*`
- `src/commands/feedback/*`

### B. Settings / REPL / Main / Query 的行为埋点

删除原因：

- 它们记录的是“用户做了什么”
- 不是“系统为什么出错”

典型应删内容：

- settings changed
- paste / click / shown / entered / exited
- session resumed 的成功路径统计
- continue / brief mode / immediate command 之类的交互统计

当前代表模块：

- `src/components/Settings/Config.tsx`
- `src/screens/REPL.tsx`
- `src/main.tsx`
- `src/query.ts`

### C. Permission 交互 telemetry

删除原因：

- 这些大多是 UX 漏斗，不是故障诊断

当前代表模块：

- `src/components/permissions/*`
- `src/hooks/toolPermission/permissionLogging.ts`

### D. Plugin telemetry 字段建模体系

删除原因：

- hash、PII twin-column、marketplace attribution 这类复杂结构，都是为了云端产品分析存在
- 继续保留只会拖着旧思路走

当前代表模块：

- `src/utils/telemetry/pluginTelemetry.ts`

### E. GrowthBook 的实验曝光与用户归因思路

删除原因：

- 这部分仍然是产品 telemetry 思路
- 但要注意：删的是实验曝光和归因，不是 feature flags / runtime config 本身

## 4. 当前拍板版结论

如果现在就定边界，我建议你直接按下面执行。

### 必须保留

- API / Provider diagnostics
- OAuth / auth diagnostics
- updater diagnostics
- crash / shutdown diagnostics
- runtime config / feature flags
- support bundle

### 可选保留

- MCP / bridge / remote 的失败类事件
- team memory / session memory 的失败类事件
- config / permission / bash security 的异常类事件

### 必须删除

- survey / feedback / funnel
- settings usage telemetry
- REPL / main / query 行为 telemetry
- permission prompt 交互 telemetry
- plugin telemetry 归因体系
- GrowthBook 中所有实验曝光、用户属性归因思路

## 5. 最终原则

不要把目标理解成“删掉所有记录能力”。

真正目标是：

- 删除产品 telemetry
- 保留工程 diagnostics
- 保留 runtime config
- 保留支持排障必需的信息

也就是：

- 删掉旧产品分析思路
- 留下后面做自己版本真正需要的工程能力
