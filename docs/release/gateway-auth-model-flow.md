# Gateway 登录、退出与模型选择流程

本文整理当前 Gateway platform 场景下 `/login`、`/logout`、`/model` 的实际行为，重点回答：

- Gateway 配置保存到哪里
- 退出时是否会删除
- `/model` 在 Gateway 场景下如何拿到最新模型列表
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 在手动选模型时是否仍会阻止刷新

适用版本：
- 当前仓库 `main`
- 已包含 Gateway 配置保存到 `~/.claude/settings.json`、`/logout` 精确清理 Gateway env、`/model` 手动刷新模型列表的实现

## 1. 结论摘要

- Gateway 配置保存到用户级 settings 文件：`~/.claude/settings.json`
- 保存位置是 `userSettings.env`
- `/logout` 会删除 Gateway 相关 env，并保留其他用户配置
- `/model` 在检测到 `ANTHROPIC_BASE_URL` 时，会先请求 Gateway 的 `/models` 接口刷新最新模型列表，再让用户选择
- 这次显式手动刷新属于交互行为，不会被 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 阻断
- Gateway `/login` 成功后只保留必要的本地状态刷新，不再额外触发 Anthropic 官方账号专属的远端刷新链路

## 2. 配置落盘位置

Gateway 平台配置由 `/login` 的平台配置流程写入 `userSettings.env`。

写入字段：
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_KEY`

同时会清理互斥的 provider 标志位：
- `CLAUDE_CODE_USE_BEDROCK`
- `CLAUDE_CODE_USE_VERTEX`
- `CLAUDE_CODE_USE_FOUNDRY`

也就是说，当前 Gateway 配置的单一事实源是：

```text
~/.claude/settings.json
  -> env
    -> ANTHROPIC_BASE_URL
    -> ANTHROPIC_API_KEY
```

说明：
- 这里不是写到全局 config 的 `oauthAccount` 或其他缓存字段
- 进程内 `process.env` 会同步更新，保证当前会话立刻生效

## 3. `/login` 流程

### 3.1 用户视角

在 CLI 中执行 `/login`，进入 Gateway Platform 配置流程后，输入：
- Base URL
- API Key

预期行为：
- Base URL 会先做规范化与 URL 校验
- 配置写入 `~/.claude/settings.json`
- 当前进程内环境变量同步更新
- 自动触发一次模型刷新

### 3.2 代码路径

核心入口：
- `src/components/ConsoleOAuthFlow.tsx`

关键动作：
1. 规范化 `ANTHROPIC_BASE_URL`
2. 调用 `updateSettingsForSource('userSettings', { env: ... })`
3. 将 `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY` 写入 `userSettings.env`
4. 清理 `CLAUDE_CODE_USE_BEDROCK` / `VERTEX` / `FOUNDRY`
5. `settingsChangeDetector.notifyChange('userSettings')`
6. 同步更新 `process.env`
7. 调用模型发现逻辑刷新 Gateway 模型列表

登录成功后的收尾逻辑已统一收口到：
- `src/utils/postLogin.ts`

行为分层如下：
- 所有登录成功场景都会执行：
  - `resetCostState()`
  - `resetUserCache()`
- 仅 Anthropic 官方 base URL 场景才会继续执行：
  - `refreshRemoteManagedSettings()`
  - `refreshPolicyLimits()`
  - `refreshGrowthBookAfterAuthChange()`
  - `clearTrustedDeviceToken()`
  - `enrollTrustedDevice()`

这意味着当用户走 Gateway / 自定义 `ANTHROPIC_BASE_URL` 登录时：
- 仍会保存配置并立即可用
- 仍会刷新 Gateway `/models`
- 但不会再去请求 Anthropic 官方账号侧的 managed settings、policy limits、GrowthBook、trusted device enrollment

这样做的作用是：
- 避免 Gateway 登录后出现与官方账号无关的额外网络请求
- 避免把 Gateway 场景误当成 “Anthropic account 登录” 来收尾
- 让 `/login` 与 onboarding 内部自动登录复用同一套后置逻辑，减少分叉回归

### 3.3 为什么保存到 `~/.claude/settings.json`

`userSettings` 的路径解析在 settings 层统一处理：

- `getClaudeConfigHomeDir()` 默认返回 `~/.claude`
- `getSettingsFilePathForSource('userSettings')` 返回 `~/.claude/settings.json`

因此，Gateway 登录流程现在明确落盘到：

```text
/Users/<user>/.claude/settings.json
```

## 4. `/logout` 流程

### 4.1 用户视角

执行 `/logout` 后：
- 清理当前登录态
- 清理 Gateway 配置
- 不再显示 “Anthropic account” 的旧文案
- 不再打印 resume hint

当前成功文案为：

```text
Successfully cleared your login and gateway configuration.
```

### 4.2 实际清理内容

`/logout` 当前会清理三层状态：

1. 凭据与缓存
- API key / OAuth 相关凭据
- secure storage
- token cache、user cache、tool schema cache、remote managed settings cache 等

2. 当前进程环境变量
- 删除 `process.env.ANTHROPIC_BASE_URL`
- 删除 `process.env.ANTHROPIC_API_KEY`
- 删除 `process.env.CLAUDE_CODE_USE_BEDROCK`
- 删除 `process.env.CLAUDE_CODE_USE_VERTEX`
- 删除 `process.env.CLAUDE_CODE_USE_FOUNDRY`

3. 用户 settings 文件中的 Gateway env
- 从 `~/.claude/settings.json` 的 `env` 中删除：
  - `ANTHROPIC_BASE_URL`
  - `ANTHROPIC_API_KEY`
  - `CLAUDE_CODE_USE_BEDROCK`
  - `CLAUDE_CODE_USE_VERTEX`
  - `CLAUDE_CODE_USE_FOUNDRY`

保留内容：
- 其他非 Gateway 的用户配置
- 例如 `CLAUDE_CODE_ATTRIBUTION_HEADER`
- 例如 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
- 例如用户已选中的 `model`

### 4.3 为什么之前“退出成功但配置没删掉”

根因是旧实现使用了 `updateSettingsForSource()`。

这个 helper 对对象采用 deep merge 语义。对于：

```json
{
  "env": {
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

这样的新对象，如果旧文件里还存在：
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_KEY`

merge 后旧 key 可能被保留，而不是删除。

当前修复方式是：
- 先取完整的当前 `userSettings`
- 计算出“删除 Gateway env 后的最终 settings”
- 使用整份替换写回，而不是继续 deep merge

这样可以保证缺失字段会从磁盘上真正消失。

### 4.4 退出后的预期文件样子

例如退出前：

```json
{
  "env": {
    "CLAUDE_CODE_ATTRIBUTION_HEADER": "0",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "ANTHROPIC_BASE_URL": "https://example-gateway",
    "ANTHROPIC_API_KEY": "secret"
  },
  "model": "sonnet"
}
```

退出后应变成：

```json
{
  "env": {
    "CLAUDE_CODE_ATTRIBUTION_HEADER": "0",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  },
  "model": "sonnet"
}
```

## 5. `/model` 流程

### 5.1 Gateway 场景下的目标

当用户已经配置了：
- `ANTHROPIC_BASE_URL`

此时执行 `/model`，系统不应该直接给一份静态默认模型列表，而应该：

1. 先请求 Gateway 的模型列表接口
2. 刷新本地可选模型缓存
3. 再展示 Model Picker 让用户选择

### 5.2 当前行为

`/model` 打开后会先检查：
- 当前进程里是否有 `ANTHROPIC_BASE_URL`

如果有，则先进入 `loading` 状态，并调用：

```text
refreshProviderModelOptions({ force: true, interactive: true })
```

刷新成功后：
- 展示最新 Gateway 模型列表

刷新失败后：
- 显示错误
- 不再静默退回一份误导性的默认 Gateway 模型列表

### 5.3 为什么是“先刷新再选择”

因为 Gateway 的可用模型不是固定常量，可能受这些因素影响：
- 网关后端的实际上游模型
- API key 的权限范围
- 平台策略或动态路由

所以 `/model` 在 Gateway 场景下应该以 `/models` 返回值为准，而不是假设一份内建列表永远正确。

## 6. `/models` 接口映射规则

Gateway 模型发现使用 base URL 映射到模型列表端点。

规则如下：
- 如果 base URL 形如 `https://host`
  - 模型发现走 `https://host/v1/models`
- 如果 base URL 已经以版本号结尾，例如 `https://host/v1`
  - 模型发现走 `https://host/v1/models`
- 如果 base URL 是 `https://host/v2`
  - 模型发现走 `https://host/v2/models`

换句话说：
- “裸 host” 补 `/v1/models`
- “已带版本前缀” 补 `/models`

## 7. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 的影响

### 7.1 背景

这个开关仍然有效，它会阻止一部分非必要网络行为，例如后台预取或自动刷新。

### 7.2 在 `/model` 手动选择场景下的处理

当前实现对显式交互做了例外处理：
- 后台刷新仍受该开关限制
- 用户主动触发的刷新不受该开关限制

因此在 Gateway 场景下：
- `/model` 手动打开选择器时，会继续请求 `/models`
- 不会因为 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 而被跳过

这样做的原因是：
- 用户已经明确要求“我要选模型”
- 如果此时还禁止刷新，最终展示的模型列表很可能过时，体验和正确性都会受影响

## 8. 文案与交互调整

为了避免把 Gateway 使用场景误描述成只和 Anthropic 账户相关，当前文案已调整为更中性表达：

- `/login`
  - 从 “Sign in with your Anthropic account” 调整为 “Sign in or configure a gateway”
- `/logout`
  - 从 “Sign out from your Anthropic account” 调整为 “Clear your login and gateway configuration”
- 成功退出提示
  - 从 “Successfully logged out from your Anthropic account.” 调整为 “Successfully cleared your login and gateway configuration.”

此外：
- `/logout` 不再打印 resume hint，避免在“明确退出”后仍提示恢复会话

## 9. 回归检查建议

建议最小回归覆盖以下场景：

1. Gateway 登录保存
- 执行 `/login`
- 输入 base URL / API key
- 检查 `~/.claude/settings.json` 中是否写入 `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`

2. Gateway 模型刷新
- 执行 `/model`
- 确认先出现刷新状态
- 确认最终列表来自 Gateway `/models`

3. Nonessential traffic 例外
- 设置 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
- 再执行 `/model`
- 确认仍会刷新 Gateway 模型列表

4. Gateway 退出清理
- 执行 `/logout`
- 检查 `~/.claude/settings.json`
- 确认 Gateway env 被删除，其他 env 仍保留

5. 文案与退出行为
- 确认 `/logout` 成功文案为中性表达
- 确认退出后不再出现 resume hint

## 10. 相关代码入口

- Gateway 登录保存：
  - `src/components/ConsoleOAuthFlow.tsx`
- `/logout` 清理：
  - `src/commands/logout/logout.tsx`
  - `src/cli/handlers/auth.ts`
- settings 写回能力：
  - `src/utils/settings/settings.ts`
- `/model` 手动刷新：
  - `src/commands/model/model.tsx`
  - `src/services/api/providerModelDiscovery.ts`
- 退出时抑制 resume hint：
  - `src/utils/gracefulShutdown.ts`
