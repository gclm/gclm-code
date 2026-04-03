# `free-code-main` 定制基线裁剪建议

## 目标

这份文档讨论的不是“怎么继续往上堆功能”，而是：

如何把 `free-code-main` 收敛成一个更适合长期维护的“我们自己的 Claude Code 定制基线”。

核心目标有 3 个：

1. 保留 Claude Code 风格主架构
2. 删掉不适合作为长期基础的外部分叉噪音
3. 为后续 provider、policy、branding、差异化能力预留稳定边界

## 为什么先选 `free-code-main`

推荐它作为基线，主要因为：

1. 它仍然保留了 Claude Code 的主结构
2. 它已经把 provider 和 telemetry 这些最难先拆了一步
3. 它的 build 和 feature 机制更适合产品化迭代

不推荐直接用 `claude-code-rebuilt` 作为主开发基线的原因是：

- 它更像原版结构参考样本
- 它的目标是“把快照重建到可运行”
- 它不如 `free-code-main` 适合继续向“自己的产品分支”演化

## 建议保留的东西

### 1. 主架构

建议保留 Claude Code 的这些主骨架：

- `entrypoints/cli.tsx`
- `main.tsx`
- `commands.ts`
- `tools.ts`
- `services/`
- `skills/`
- `plugins/`
- `tasks/`
- `screens/REPL.tsx`

原因：

- 这是 Claude Code 风格体验的核心
- 后续无论换 provider、换 branding、换 policy，都不必重写全局骨架

### 2. Bun 构建体系

建议保留：

- 当前 `scripts/build.ts`
- 当前 feature-flag 打包机制
- 当前 `build` / `build:dev` / `build:dev:full` / `compile` 这组入口

原因：

- 这套机制已经足够作为产品工程基线
- 后续可以通过“我们的 feature profile”收口默认发行版

### 3. Provider 抽象层

建议保留并继续强化：

- `utils/model/providers.ts`
- `utils/auth.ts`
- `services/api/client.ts`
- `services/oauth/*`

原因：

- 这是 `free-code-main` 最有价值的工程化改造之一
- 它已经把 Claude Code 从 Anthropic-only 思路往多 provider 拉开了

## 建议先收掉的东西

### 1. “全开实验特性”的默认心智

不建议把 `build:dev:full` 或“尽量多开 feature”当成自己的默认产品方向。

建议：

- 先定义一组最小稳定发行 feature
- 把实验 feature 和发行 feature 区分清楚

### 2. 直接清空 guardrails 的做法

当前 `free-code-main` 把 cyber risk instruction 清空，这对 fork 很方便，但不适合长期产品。

建议：

1. 不恢复 Anthropic 的那套策略
2. 但也不要停留在“空白”
3. 尽快替换成你们自己的 policy / system prompt / 风险边界

### 3. 所有与 claude.ai entitlement 强绑定的能力

这些能力通常有较强运行时 caveat，建议先视为非基线能力：

- `BRIDGE_MODE`
- `CCR_*`
- `CHICAGO_MCP`
- `KAIROS_*`
- 其他依赖 claude.ai OAuth entitlement 的路径

## 第一阶段建议的 Feature 收口

## 建议默认保留

这批能力更适合作为“首个可维护发行基线”：

- `BUILTIN_EXPLORE_PLAN_AGENTS`
- `MESSAGE_ACTIONS`
- `QUICK_SEARCH`
- `TOKEN_BUDGET`
- `VERIFICATION_AGENT`

`VOICE_MODE` 是否保留，取决于你们是否明确要做语音。它不是必须项。

## 建议默认关闭

这批能力建议先放进“实验区”，不要直接进入我们的默认基线：

- `CHICAGO_MCP`
- `BRIDGE_MODE`
- `CCR_AUTO_CONNECT`
- `CCR_MIRROR`
- `CCR_REMOTE_SETUP`
- `TEAMMEM`
- `AGENT_TRIGGERS_REMOTE`
- `KAIROS_BRIEF`
- `KAIROS_CHANNELS`
- `NATIVE_CLIPBOARD_IMAGE`
- 其他依赖私有运行时或 entitlement 的能力

## 第一阶段建议的 Provider 策略

### 目标

不要让 provider 接入继续散落在多个分支逻辑里，而是尽快明确“我们正式支持谁”。

### 建议顺序

#### 方案 A：最小可用双 provider

先保留：

- `anthropic`
- `openai`

适合场景：

- 快速形成一个明确的产品闭环
- 兼顾兼容性与后续扩展空间

#### 方案 B：企业云扩展版

在方案 A 的基础上再补：

- `bedrock`
- `vertex`

适合场景：

- 明确面向企业客户
- 有真实的云环境接入需求

#### 方案 C：全部先保留

不建议第一阶段这么做。

原因：

- 验证面太宽
- 文案、认证、计费、默认模型都会一起复杂化
- 会拖慢“先把自己的定制基线收稳”这个目标

## 第一阶段建议的 Telemetry 策略

### 建议保留当前方向

当前 `free-code-main` 的处理方式是：

- 对外 telemetry 默认 inert
- 但保留兼容接口

这个方向是合理的，建议保留。

### 建议继续做的事情

1. 保留本地事件接口
2. 禁止默认出站
3. 如果需要观测性，只先做本地日志、本地 trace、本地调试开关

### 不建议第一阶段做的事情

- 恢复 Anthropic 风格的远程 telemetry
- 在没有明确策略前重新接第三方追踪平台

## 第一阶段建议的 Branding 收口

建议尽快统一处理这些内容：

1. 包名
2. CLI 名称
3. Header / logo
4. 登录文案
5. 默认模型文案
6. release-notes 文案
7. help 与错误提示中的品牌残留

原因：

- 这类残留会持续污染后续开发判断
- 很多看似技术问题，实际是在被旧品牌文案拖着跑

## 哪些地方适合借鉴 `claude-ace`

建议后续从 `claude-ace` 借鉴这几类能力：

### 1. Skeleton / ExpandSymbol

适合作为读取大文件时的优化策略，用于降低 token 消耗。

### 2. IntentVerify

适合作为非 trivial 改动时的验证闭环。

### 3. CallGraph

适合作为“修改前的影响面分析工具”。

### 4. CriticalArchitect

适合作为高风险设计决策前的架构评审工具。

## 哪些地方不要照搬 `claude-ace`

不建议照搬：

1. 它的整体 agent loop
2. 它的 Node 单包结构
3. 它的完整身份 prompt 设计
4. 它替代 Claude Code 原插件/MCP/skills 体系的方式

原因：

- 我们当前目标不是做一款全新产品
- 我们当前目标是“站在 Claude Code 风格骨架上做定制分支”

## 推荐的阶段性路线

### Phase 0：边界收敛

明确：

- 什么保留
- 什么先不保留
- 什么以后借鉴

### Phase 1：最小稳定发行基线

完成：

- feature 收口
- provider 收口
- telemetry 策略收口
- branding 初步统一

### Phase 2：建立自己的 policy 与 prompt 体系

完成：

- 替换当前“直接清空”的安全策略
- 引入我们自己的 system prompt / policy 规范

### Phase 3：引入差异化能力

从 `claude-ace` 中按模块借鉴：

- skeleton read
- expand symbol
- verify loop
- call graph

### Phase 4：为长期维护做结构分层

建议最终把仓库边界收成三层：

1. `upstream-compatible core`
2. `our platform layer`
3. `our differentiators`

这样后续无论要继续演化还是做 clean-room 重实现，都会更清晰。

## 当前推荐结论

### 最终建议

如果目标是做“我们自己的 Claude Code 定制版”，建议：

1. 以 `free-code-main` 作为主开发基线
2. 以 `claude-code-rebuilt` 作为原版结构参考仓库
3. 把 `claude-ace` 当作方法论和工具设计参考，而不是当作骨架基线

### 最重要的取舍

我们接受的最大 trade-off 是：

为了保留 Claude Code 原骨架与生态感，不走 `claude-ace` 那条更轻的路线；
但作为回报，我们能更低成本地保住：

- TUI 主循环
- commands / tools
- MCP / skills / plugins / tasks 主结构
- 与原 Claude Code 更一致的后续演化空间
