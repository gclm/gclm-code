# `free-code-main` 当前特性清单

> 文档定位：历史基线分析（references）；用于解释改造起点，不代表当前 `gclm-code` 运行时现状。
> 说明：文中出现的 codex/openai 等术语来自被分析样本。当前主线已完成 codex 能力净化。

这份文档回答一个具体问题：

`references/free-code-main` 目前到底已经具备哪些能力，哪些地方已经接近我们想要的定制方向，哪些地方还需要明显改造。

本文重点不是“它能不能跑”，而是“它当前保留了 Gclm Code 哪些产品层、平台层、认证层、模型层、升级层能力”。

## 一句话结论

`free-code-main` 不是一个只保留最小命令行交互的轻量裁剪版，而是一个：

- 保留了 Gclm Code 主体架构
- 去掉了主要产品遥测实现
- 解锁了大量实验特性
- 仍然保留完整命令系统、工具系统、MCP、skills、plugins、tasks、计划模式、远程能力、自动升级链路、多 provider 接入能力

也就是说，它很适合做“继续产品化定制”的基线，但并不是“品牌、升级、provider、模型层已经收拾干净”的版本。

## 1. 产品定位与总特征

从仓库自述来看，`free-code-main` 明确把自己定义为：

- Gclm Code 的 free build
- 移除了 telemetry
- 移除了额外 guardrails
- 解锁了可编译的实验特性

可直接参考：

- `README.md` 明确写了 “All telemetry stripped / All guardrails removed / All experimental features unlocked”
- 同时说明这是一个可构建 fork，而不是另起炉灶的新 CLI

证据：

- [references/free-code-main/README.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/README.md#L8)
- [references/free-code-main/README.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/README.md#L52)
- [references/free-code-main/README.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/README.md#L58)
- [references/free-code-main/README.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/README.md#L66)
- [references/free-code-main/README.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/README.md#L72)

## 2. 已保留的核心产品能力

### 2.1 完整的命令系统还在

`free-code-main` 不是只有 `/chat` 和 `/model` 这种最小命令集，它保留了非常完整的命令体系。

主命令里可以看到这些能力仍然存在：

- 认证与身份：`login`、`logout`
- 模型与会话：`model`、`resume`、`session`、`rewind`
- 配置与权限：`config`、`permissions`、`privacy-settings`、`hooks`
- 工具与上下文：`files`、`mcp`、`skills`
- 任务与代理：`tasks`、`agents`、`plan`
- 质量与诊断：`review`、`security-review`、`doctor`、`stats`、`usage`
- 分发与导出：`export`
- 插件体系：`plugin`、`reload-plugins`
- 体验增强：`fast`、`effort`、`theme`、`keybindings`
- 升级相关：`upgrade`

另外还有大量 feature flag 控制的实验命令，例如：

- `voice`
- `bridge`
- `ultraplan`
- `remote-setup`
- `assistant`
- `workflows`
- `buddy`
- `fork`

证据：

- [references/free-code-main/src/commands.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/commands.ts#L2)
- [references/free-code-main/src/commands.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/commands.ts#L73)
- [references/free-code-main/src/commands.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/commands.ts#L124)
- [references/free-code-main/src/commands.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/commands.ts#L257)
- [references/free-code-main/src/commands.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/commands.ts#L319)
- [references/free-code-main/src/commands.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/commands.ts#L336)

### 2.2 完整的工具系统还在

`free-code-main` 也保留了 Gclm Code 的核心工具编排能力，而不是退化成“只能跑 shell”。

当前可见的基础工具包括：

- 文件类：`FileReadTool`、`FileEditTool`、`FileWriteTool`、`NotebookEditTool`
- 搜索类：`GlobTool`、`GrepTool`
- 执行类：`BashTool`
- Web 类：`WebFetchTool`、`WebSearchTool`
- Agent / Skill 类：`AgentTool`、`SkillTool`
- 任务类：`TaskCreateTool`、`TaskGetTool`、`TaskUpdateTool`、`TaskListTool`、`TaskStopTool`
- 计划类：`EnterPlanModeTool`、`ExitPlanModeV2Tool`、`VerifyPlanExecutionTool`
- 用户交互类：`AskUserQuestionTool`
- MCP 类：`ListMcpResourcesTool`、`ReadMcpResourceTool`

实验或条件性工具仍然存在：

- cron trigger
- remote trigger
- team / swarm
- workflow
- browser
- LSP
- PowerShell

这意味着它依然具备“多工具代理”产品的真实底座，而不是一个表层壳。

证据：

- [references/free-code-main/src/tools.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/tools.ts#L3)
- [references/free-code-main/src/tools.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/tools.ts#L29)
- [references/free-code-main/src/tools.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/tools.ts#L73)
- [references/free-code-main/src/tools.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/tools.ts#L193)
- [references/free-code-main/src/tools.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/tools.ts#L218)
- [references/free-code-main/src/tools.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/tools.ts#L235)
- [references/free-code-main/src/tools.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/tools.ts#L245)

### 2.3 Skills、Plugins、MCP、Tasks 都还在

从命令注册与技能加载逻辑可以看出，它保留了多层扩展系统：

- skill directory commands
- plugin skills
- bundled skills
- builtin plugin skills

说明它不是单体 CLI，而是一个可扩展平台结构。

证据：

- [references/free-code-main/src/commands.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/commands.ts#L156)
- [references/free-code-main/src/commands.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/commands.ts#L353)
- [references/free-code-main/src/commands.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/commands.ts#L374)

## 3. Provider 与认证能力

### 3.1 当前支持 5 类 provider

仓库 README 与 provider 判定代码都表明，当前内建 provider 为：

- `firstParty`
- `bedrock`
- `vertex`
- `foundry`
- `openai`

也就是：

- Anthropic 官方 API
- AWS Bedrock
- Google Vertex AI
- Anthropic Foundry / Azure 路径
- OpenAI Codex

证据：

- [references/free-code-main/README.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/README.md#L78)
- [references/free-code-main/README.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/README.md#L150)
- [references/free-code-main/src/utils/model/providers.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/model/providers.ts#L4)
- [references/free-code-main/src/utils/model/providers.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/model/providers.ts#L6)

### 3.2 当前认证体系不是“只剩两种 OAuth”

它保留了比较复杂的认证分支：

- Anthropic OAuth
- Anthropic API Key / `apiKeyHelper`
- OpenAI Codex OAuth
- Bedrock 凭证
- Vertex GCP 凭证
- Foundry API key / Azure AD

Anthropic OAuth 是否启用，还会受以下因素影响：

- 是否处于 `--bare`
- 是否在 Bedrock / Vertex / Foundry 模式
- 是否存在外部 API key
- 是否存在外部 auth token

证据：

- [references/free-code-main/src/utils/auth.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/auth.ts#L101)
- [references/free-code-main/src/utils/auth.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/auth.ts#L116)
- [references/free-code-main/src/utils/auth.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/auth.ts#L137)
- [references/free-code-main/src/utils/auth.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/auth.ts#L152)
- [references/free-code-main/src/utils/auth.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/auth.ts#L201)
- [references/free-code-main/src/utils/auth.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/auth.ts#L1314)
- [references/free-code-main/src/utils/auth.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/auth.ts#L1621)
- [references/free-code-main/src/utils/auth.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/auth.ts#L1629)

### 3.3 OpenAI 这块当前是 Codex 专用接法

它确实支持 OpenAI，但不是“通用 OpenAI-compatible provider 抽象”。

现状更接近：

- 用 OpenAI OAuth 登录 Codex
- 再通过一个 Anthropic Messages API -> OpenAI Responses API 的适配层发请求
- 目标 endpoint 还是写死的 Codex backend

证据：

- [references/free-code-main/src/services/api/codex-fetch-adapter.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/services/api/codex-fetch-adapter.ts#L4)
- [references/free-code-main/src/services/api/codex-fetch-adapter.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/services/api/codex-fetch-adapter.ts#L15)

## 4. 模型系统现状

### 4.1 模型切换能力是存在的

模型选择与模型 picker 仍然完整保留：

- 有 `/model` 命令
- 有 `ModelPicker`
- 有 `effort` 配置
- 有 default model 逻辑
- 有 1M context 相关选项

证据：

- [references/free-code-main/src/commands.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/commands.ts#L289)
- [references/free-code-main/src/components/ModelPicker.tsx](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/components/ModelPicker.tsx#L13)
- [references/free-code-main/src/components/ModelPicker.tsx](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/components/ModelPicker.tsx#L70)

### 4.2 但模型列表目前主要还是内置/硬编码

这点和你的第 4 条需求差别很大。

当前模型体系的真实状态是：

- Anthropic 系列模型选项主要在 `modelOptions.ts` 里静态定义
- OpenAI / Codex 模型列表在 `codex-fetch-adapter.ts` 里静态定义
- Bedrock 例外，它会尝试读取 inference profiles，并把 canonical Claude 模型映射到用户可用的 profile
- 也支持用 `modelOverrides` / 环境变量去覆盖具体模型名

也就是说：

- 它不是纯写死到一处
- 但也不是你想要的“第三方 provider 一律通过 `/models` 动态拉取”

更准确地说，它现在是“内建模型族 + provider 适配 + 局部 override”模式。

证据：

- [references/free-code-main/src/utils/model/modelOptions.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/model/modelOptions.ts#L37)
- [references/free-code-main/src/utils/model/modelOptions.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/model/modelOptions.ts#L97)
- [references/free-code-main/src/utils/model/modelOptions.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/model/modelOptions.ts#L134)
- [references/free-code-main/src/utils/model/modelOptions.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/model/modelOptions.ts#L212)
- [references/free-code-main/src/services/api/codex-fetch-adapter.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/services/api/codex-fetch-adapter.ts#L20)
- [references/free-code-main/src/services/api/codex-fetch-adapter.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/services/api/codex-fetch-adapter.ts#L37)

### 4.3 Provider 抽象目前仍是“枚举型”，不是“兼容型”

`getAPIProvider()` 当前返回固定枚举：

- `firstParty`
- `bedrock`
- `vertex`
- `foundry`
- `openai`

同时 `getAnthropicClient()` 中会按 provider 分别走：

- Anthropic SDK
- Bedrock SDK
- Foundry SDK
- Vertex SDK
- Codex fetch adapter

这说明现在的代码结构还不是：

- `anthropic-compatible`
- `openai-compatible`

这类统一抽象接口。

所以你后面如果要支持：

- OpenAI-compatible 第三方 API
- Anthropic-compatible 第三方 API
- 动态 `/models`

那会是一个明确的 provider 抽象层重构，而不是只改几个环境变量。

证据：

- [references/free-code-main/src/utils/model/providers.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/model/providers.ts#L4)
- [references/free-code-main/src/services/api/client.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/services/api/client.ts#L96)
- [references/free-code-main/src/services/api/client.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/services/api/client.ts#L161)
- [references/free-code-main/src/services/api/client.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/services/api/client.ts#L199)
- [references/free-code-main/src/services/api/client.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/services/api/client.ts#L229)

## 5. Feature Flags 与实验能力

这一版的一个重要特征是：实验能力保留得很多。

`FEATURES.md` 的审计结果是：

- 总共引用了 88 个编译期开关
- 其中 54 个可以成功 bundle
- 默认构建里已经带 `VOICE_MODE`

工作中的实验特性覆盖几大类：

- Interaction / UI
- Agent / Memory / Planning
- Tools / Permissions / Remote

比较值得注意的实验特性包括：

- `VOICE_MODE`
- `ULTRAPLAN`
- `ULTRATHINK`
- `AGENT_TRIGGERS`
- `TEAMMEM`
- `VERIFICATION_AGENT`
- `BRIDGE_MODE`
- `MCP_RICH_OUTPUT`
- `UNATTENDED_RETRY`

证据：

- [references/free-code-main/FEATURES.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/FEATURES.md#L5)
- [references/free-code-main/FEATURES.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/FEATURES.md#L9)
- [references/free-code-main/FEATURES.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/FEATURES.md#L30)
- [references/free-code-main/FEATURES.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/FEATURES.md#L38)
- [references/free-code-main/FEATURES.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/FEATURES.md#L77)
- [references/free-code-main/FEATURES.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/FEATURES.md#L100)

## 6. 遥测、隐私、上报现状

### 6.1 主要 analytics 已经被做成空实现

这一点是 `free-code-main` 很适合做基线的一个核心原因。

目前能确认：

- `analytics/index.ts` 对外 API 仍保留，但 `logEvent` 等已经是 no-op
- `firstPartyEventLogger.ts` 整个 1P event logging 已禁用
- `datadog.ts` 已禁用

也就是“接口还在，调用点很多，但真正上报行为被拔空了”。

证据：

- [references/free-code-main/src/services/analytics/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/services/analytics/index.ts#L4)
- [references/free-code-main/src/services/analytics/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/services/analytics/index.ts#L28)
- [references/free-code-main/src/services/analytics/firstPartyEventLogger.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/services/analytics/firstPartyEventLogger.ts#L1)
- [references/free-code-main/src/services/analytics/firstPartyEventLogger.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/services/analytics/firstPartyEventLogger.ts#L24)
- [references/free-code-main/src/services/analytics/datadog.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/services/analytics/datadog.ts#L1)

### 6.2 但不是“所有遥测相关代码都消失了”

仍然还有不少遗留：

- GrowthBook 依然存在，因为很多 feature gate 和动态配置依赖它
- 各种 `logEvent(...)` 调用点大量保留
- attribution header / system header / session id 等机制仍然还在

换句话说：

- “真正上报”基本被拔掉了
- “遥测接口、埋点调用位、动态配置依赖、产品识别 header” 还在

如果你要做“完全去掉遥感信息”的品牌级净化，仍然需要继续审计。

证据：

- [references/free-code-main/README.md](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/README.md#L60)
- [references/free-code-main/src/constants/system.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/constants/system.ts#L48)
- [references/free-code-main/src/constants/system.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/constants/system.ts#L68)

## 7. 升级与安装链路仍然保留得很完整

这也是 `free-code-main` 当前仍然比较“原版产品化”的地方。

### 7.1 仍然存在自动升级体系

当前可以确认：

- 存在自动升级检查
- 存在版本上限 / kill switch
- 支持 channel
- 支持 JS/NPM 升级路径
- 支持 native installer 升级路径

自动升级核心逻辑里甚至还保留了：

- GCS bucket 地址
- `tengu_max_version_config`
- `tengu_version_config`

证据：

- [references/free-code-main/src/utils/autoUpdater.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/autoUpdater.ts#L30)
- [references/free-code-main/src/utils/autoUpdater.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/autoUpdater.ts#L70)
- [references/free-code-main/src/utils/autoUpdater.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/autoUpdater.ts#L108)
- [references/free-code-main/src/components/AutoUpdater.tsx](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/components/AutoUpdater.tsx#L23)
- [references/free-code-main/src/components/AutoUpdater.tsx](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/components/AutoUpdater.tsx#L57)
- [references/free-code-main/src/components/AutoUpdater.tsx](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/components/AutoUpdater.tsx#L103)
- [references/free-code-main/src/utils/nativeInstaller/installer.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/utils/nativeInstaller/installer.ts#L508)

### 7.2 `/upgrade` 命令仍然带明显 Anthropic 产品语义

当前 `/upgrade` 命令不是“升级 CLI 二进制”的通用品牌命令，而是：

- 给 Claude.ai 用户看的“升级到 Max”
- 强绑定 Anthropic 订阅产品语义

证据：

- [references/free-code-main/src/commands/upgrade/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/commands/upgrade/index.ts#L5)
- [references/free-code-main/src/commands/upgrade/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/commands/upgrade/index.ts#L8)
- [references/free-code-main/src/commands/upgrade/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/commands/upgrade/index.ts#L9)

所以你的第 2 条“改造自动升级为我们自己的版本”，不是增量优化，而是必须改。

## 8. 品牌与身份层目前还没有清干净

这是 `free-code-main` 的另一个关键现实。

虽然它已经叫 `free-code`，但代码内部还有大量品牌残留，包括：

- system prompt 里仍然是 `You are Gclm Code, Anthropic's official CLI for Claude.`
- `claude.ai` URL、OAuth metadata、product URL 仍然广泛存在
- 组件文案、通知、引导文案里大量出现 `Gclm Code`
- keychain service name、attribution、GitHub App 文案也仍然带原品牌

最核心的证据之一：

- 系统提示前缀仍然是 Gclm Code / Anthropic 官方 CLI

证据：

- [references/free-code-main/src/constants/system.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/constants/system.ts#L9)
- [references/free-code-main/src/constants/system.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/constants/system.ts#L10)
- [references/free-code-main/src/constants/system.ts](/Users/gclm/workspace/lab/ai/gclm-code/references/free-code-main/src/constants/system.ts#L11)

这意味着你的第 3 条“品牌和身份层彻底改干净”也必须做一次系统性 sweep。

## 9. 对你 4 条目标的匹配度判断

### 目标 1：去掉 Gclm Code 中的遥感信息

结论：

已经完成了一大半，但还不算彻底做完。

原因：

- 真正的 analytics 上报实现大多已被 no-op 化
- 但 GrowthBook、header、埋点调用位、产品识别字段、branding 文案仍然还在

判断：

- 适合继续在这个基线上做“彻底净化”
- 不需要从零重拆遥测体系

### 目标 2：改造自动升级为我们自己的版本

结论：

目前完全没改干净，仍然保留 Anthropic / Gclm Code 的升级逻辑与远程配置思路。

判断：

- 需要独立改造
- 这块不属于“微调”

### 目标 3：调整品牌和身份层彻底改干净

结论：

目前还远未完成。

判断：

- 需要一次全链路品牌替换
- 包括 system prompt、UI copy、OAuth 文案、URL、keychain、attribution、installer、package metadata

### 目标 4：支持 OpenAI 兼容 / Anthropic 兼容第三方 API，模型从 `/models` 动态获取

结论：

当前不满足。

原因：

- 现在还是固定 provider 枚举
- 模型选项主要还是静态定义
- OpenAI 支持偏向 Codex 专用适配
- 没有统一的 “OpenAI-compatible” / “Anthropic-compatible” provider 抽象
- 没有以 `/models` 为中心的通用模型发现机制

判断：

- 这是后续最需要设计的一块结构性改造

## 10. 我对基线判断的进一步确认

即使考虑你现在这 4 条目标，我仍然认为：

`free-code-main` 依然是最适合作为我们版本基线的那个分支。

原因不是它“已经最干净”，而是它同时满足：

- Gclm Code 主架构保留最多
- 已经把最麻烦的一层 telemetry 做了去活化
- 多 provider、模型、命令、工具、tasks、plugins、MCP 的骨架都还在
- 适合继续做品牌、升级、provider 抽象层改造

不适合的地方也很明确：

- 品牌残留很多
- 升级链路还重
- provider 模型层还不是你要的目标形态

但这些恰恰是“有骨架可改”，而不是“底盘先天不对”。

## 11. 下一步建议

如果按你的方向继续往下推进，下一份最值得出的不是泛泛路线图，而是：

1. `free-code-main` 的品牌清理清单
2. 自动升级链路替换清单
3. provider 抽象层重构草图
4. 模型发现机制从“静态枚举”切到“/models 动态拉取”的设计草案

如果你认可，我下一轮就按这 4 个主题继续拆。
