# `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 作用清单

更新时间：2026-04-06

## 结论先看

当前版本里，`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 不是“只关 telemetry”的旧残留开关。

它在代码里的真实语义是：

- 将隐私级别提升为 `essential-traffic`
- 禁用一批“非必要网络流量”
- 间接禁用 auto-update
- 影响部分后台预取、能力探测、远端状态同步和错误上报

所以，如果要“直接删除这个配置”，不能只删一处判断；需要先决定这些行为分别要不要保留。

## 单一事实源

变量的基础定义在 `src/utils/privacyLevel.ts`：

- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` -> `essential-traffic`
- `isEssentialTrafficOnly()` 是主要判定入口
- `getEssentialTrafficOnlyReason()` 会把这个 env 作为用户可见原因返回

这意味着很多模块不是直接判断 env，而是通过 `isEssentialTrafficOnly()` 间接生效。

## 当前会被它影响的功能

### 1. 启动与后台预取

- `src/services/api/bootstrap.ts`
  - 跳过 bootstrap API 拉取
  - 影响启动期的 `client_data` 和 `additional_model_options` 获取

- `src/utils/releaseNotes.ts`
  - 跳过 changelog / release notes 拉取

- `src/utils/fastMode.ts`
  - 跳过 fast mode 状态预取

- `src/services/claudeAiLimits.ts`
  - 跳过 quota / rate limit 预检查请求

- `src/services/api/referral.ts`
  - 跳过 referral / guest passes eligibility 的启动预取

- `src/services/api/overageCreditGrant.ts`
  - 跳过 overage credit grant 缓存刷新

### 2. 账号与远端状态类功能

- `src/bridge/trustedDevice.ts`
  - `/login` 后跳过 trusted device enrollment
  - 这会影响 Remote Control 相关的“可信设备”链路

- `src/services/api/grove.ts`
  - 跳过 Grove account settings 获取
  - 跳过 Grove notice config 获取
  - 结果上会让 Grove 相关弹窗 / 提示 / 设置读取不到最新远端状态

- `src/services/api/metricsOptOut.ts`
  - 跳过 metrics opt-out 状态请求
  - 这里虽然名字和 metrics 有关，但它本质上也是远端组织设置读取

### 3. 模型、能力与注册表发现

- `src/utils/model/modelCapabilities.ts`
  - 跳过 model capabilities 刷新

- `src/services/mcp/officialRegistry.ts`
  - 跳过官方 MCP registry 拉取
  - 这里是少数直接判断原始 env 的地方，不走 `isEssentialTrafficOnly()`

- `src/services/api/providerModelDiscovery.ts`
  - 默认会跳过 Gateway `/models` 后台刷新
  - 当前实现里，用户手动打开 `/model` 时走的是 `interactive: true`
  - 因此“后台自动刷新被禁用”，但“手动 `/model` 刷新”现在已经被显式放行

### 4. 自动更新与插件更新

- `src/utils/config.ts`
  - `getAutoUpdaterDisabledReason()` 会把这个 env 视为 auto-updater 的禁用原因

- 受上面逻辑影响的组件包括：
  - `src/components/AutoUpdater.tsx`
  - `src/components/NativeAutoUpdater.tsx`
  - `src/components/AutoUpdaterWrapper.tsx`
  - `src/components/PackageManagerAutoUpdater.tsx`

- `src/utils/config.ts`
  - `shouldSkipPluginAutoupdate()` 也会随之生效

换句话说，这个变量今天仍然会影响 auto-update，不是无效配置。

### 5. 错误上报与 fail-closed 行为

- `src/utils/log.ts`
  - `logError()` 在 `isEssentialTrafficOnly()` 下直接返回
  - 也就是错误日志上报链路会被禁用

- `src/services/policyLimits/index.ts`
  - 当 policy cache 不可用时，`allow_product_feedback` 在 essential-traffic 模式下会 fail closed
  - 这不是“发起网络请求”的开关，而是“缓存缺失时默认更保守”的联动行为

## 不受它影响，或者已被单独处理的点

- `DISABLE_TELEMETRY`
  - 只会把隐私级别提升到 `no-telemetry`
  - 不会触发 `essential-traffic`
  - 语义比 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 更窄

- `/model` 手动刷新
  - 当前已经特殊处理
  - `src/services/api/providerModelDiscovery.ts` 的 `shouldSkipProviderModelRefresh(interactive = false)` 只有在 `!interactive` 时才会被这个变量拦住

## 删除这个配置前，必须先做的判断

如果你准备删掉它，需要先决定下面这些行为分别怎么办：

1. auto-update 还要不要保留统一禁用能力
2. trusted device enrollment 还要不要在“极简网络模式”下关闭
3. Grove / referral / overage credit / release notes 这类后台请求要不要恢复
4. model capabilities、official MCP registry、bootstrap 这些启动期探测要不要恢复
5. error reporting 要继续跟这个变量绑定，还是只交给更窄的 telemetry / logging 开关

## 当前更合理的改造方向

如果你的目标是“去掉这个大而全的总开关”，更建议拆，不建议直接删。

### 方案 A：保留变量，但缩小语义

把它改成真正的“只禁用可选后台请求”，例如只保留：

- release notes
- Grove
- referral / overage credit
- fast mode / quota 预取
- official MCP registry

然后把 auto-update、Gateway `/models`、错误上报这些行为拆出去。

### 方案 B：保留更细的专用开关，移除总开关

可以拆成几类：

- `DISABLE_TELEMETRY`
  - 只处理 telemetry / error reporting

- `DISABLE_AUTOUPDATER`
  - 只处理 auto-update

- 新的“可选后台预取”开关
  - 只控制 Grove / release notes / referral / bootstrap / model capability 之类的后台请求

这样语义会清楚很多，也更符合你这个定制版本的维护方式。

### 方案 C：如果你自己的版本不再需要“极简网络模式”

那就可以考虑完全删除 `essential-traffic` 这一层语义，但要同步改掉：

- `src/utils/privacyLevel.ts`
- `src/utils/config.ts`
- 所有 `isEssentialTrafficOnly()` 的调用点
- `src/services/mcp/officialRegistry.ts` 里的原始 env 判断

否则会留下“变量删了，但调用点逻辑没清理干净”的半残状态。

## 我的建议

以当前仓库现状看，不建议直接删除而不拆分。

原因很简单：这个变量已经不只是 telemetry，而是一个“后台网络行为总开关”。如果直接去掉：

- auto-update 会恢复
- trusted device enrollment 会恢复
- bootstrap / Grove / model capabilities / MCP registry 等后台请求都会恢复
- 错误上报链路也会恢复

如果你的真实目标只是“我们自己的版本不需要这个大总开关”，更稳妥的路径是：

1. 先保留文档里的影响清单作为基线
2. 再决定哪些行为应该继续受控
3. 最后把它拆成更小的专用配置，或者彻底移除

## 删除时的最小检查清单

如果后续决定真的移除，建议至少逐项确认：

- `/model` 手动刷新仍然正常
- 后台 provider `/models` 刷新是否按预期恢复
- auto-update 是否仍有单独开关
- trusted device / Remote Control 是否没有引入副作用
- Grove / referral / release notes 是否恢复后不会造成多余噪音
- error reporting 是否改由别的配置负责
