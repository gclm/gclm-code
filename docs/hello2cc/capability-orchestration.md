# hello2cc Capability Orchestration

更新时间：2026-04-09

## 目的

这篇文档解释 `references/hello2cc` 的工作原理，以及为什么它能够让接入 Gclm Code 的其他模型更容易”知道并正确使用”当前项目和当前会话中已经存在的能力。

这里的“能力”不是指模型自己学会了新的事情，而是指宿主已经暴露出来的这些入口：

- tools
- agents
- teams
- workflows
- MCP resources / connected tools
- 当前会话里的约束、失败前提与推荐路径

## 一句话总结

`hello2cc` 不是模型网关，也不是新的模型能力层。

它本质上是一个宿主侧的 orchestration layer，通过下面四件事让第三方模型更像 Gclm Code 原生模型那样工作：

1. 把当前会话已知能力显式化
2. 把宿主优先级和推荐路径结构化地提示给模型
3. 在工具调用前对常见错误输入做纠偏
4. 把上一次成功或失败的前提记进 session state，避免机械重试

## 它不做什么

`hello2cc` 不负责：

- 接入模型 provider
- 管理 API key 或账号权限
- 替宿主创建本来不存在的工具
- 替代项目规则、`CLAUDE.md`、`AGENTS.md` 或用户明确指令

这也是它能安全集成的原因：它改变的是“如何更好地利用宿主已有能力”，而不是绕过宿主本身。

## 为什么第三方模型会需要它

第三方模型接入 Gclm Code 之后，经常不是”不会做任务”，而是”不熟悉宿主工作习惯”。

常见问题包括：

- 当前会话明明已经暴露了某个工具或 MCP resource，但模型仍然选择绕路
- 普通并行 worker 被误判成 team / teammate 语义
- 明明存在更具体的 surfaced capability，模型却先退回最宽泛的 agent 或 shell 路径
- 某条路径刚刚已经因为前提不足失败，模型仍然继续机械重试
- 用户只是要实现或验证，模型却先进入过度规划或自创工作流

Claude 原生模型通常更熟悉这类宿主约定，而第三方模型未必天然理解这些约束。`hello2cc` 的价值就在于把这些宿主语义显式补给模型，并在真正执行前做一层宿主侧保护。

## 工作机制

### 1. SessionStart：建立宿主状态快照

在会话开始时，`hello2cc` 会读取当前 session context，并向模型注入一份“宿主状态快照”。

这份快照关注的不是抽象理念，而是当前会话的真实情况，例如：

- 当前主模型槽位
- 已暴露的工具
- 已暴露的 agent surface
- MCP resource / connected tools 是否可用
- 某些失败前提是否已经发生过
- WebSearch 在当前代理或 base URL 下是否处于退化状态

这一层的作用是让模型不要把“可能存在的能力”和“当前真的可用的能力”混为一谈。

### 2. UserPromptSubmit：对当前请求做意图分析

当用户发出新消息时，`hello2cc` 会先抽取 prompt 文本，再根据内容判断当前请求更接近哪种任务类型。

典型意图包括：

- 代码探索
- 实现修改
- 验证或 review
- 规划或 trade-off 分析
- 外部系统 / MCP / connected tool 访问
- 是否真的需要 team 协作

然后它会生成一个 route context，告诉模型：

- 当前意图是什么
- 宿主已知的能力边界是什么
- 哪类能力应该优先使用
- 哪些能力不应该在没有必要时提前使用

所以它不是简单说一句“优先使用工具”，而是给出一张和当前问题相关的路由图。

### 3. Route Guidance：把能力面整理成结构化上下文

`hello2cc` 的关键做法不是堆更多自然语言，而是把宿主状态压缩成一份结构化快照，再附上少量 prose 作为 tie-breaker。

这能解决一个很现实的问题：

- 宿主能力信号通常分散在 system prompt、tool surface、前文对话、插件提示、失败反馈里
- 第三方模型即使理论上都“看得到”，也很容易漏读或错误加权

通过把这些信息压缩成一份可读的 JSON snapshot，模型更容易稳定地理解：

- 当前 surfaced 的能力有哪些
- 哪些是 deferred / discovery 路径
- 当前最推荐的执行顺序是什么
- 更高优先级规则在哪里

这也是它能够“让模型知道项目能力”的核心原因之一。

更准确地说，它做的不是让模型知道“整个项目的全部能力”，而是让模型知道“当前回合宿主确认暴露的能力面”。

### 4. PreToolUse：在执行边界前做输入纠偏

这一层是 `hello2cc` 和纯 prompt engineering 的最大区别。

它不会只停留在提示词层，而是在模型即将调用某些关键工具时检查输入是否合理，并在必要时修正或 fail-closed。

最典型的是这些动作：

- `Agent`
  - 修正普通 worker 与 teammate 的语义混淆
  - 修正隔离方式或 worktree 前提
  - 给缺失的 `model` 补宿主安全槽位
- `TeamCreate`
  - 在团队前提不成立时阻止无意义建队
- `SendMessage`
  - 为纯文本消息补齐兼容字段，例如 `summary`
- `EnterWorktree`
  - 当仓库或前提不成立时，避免模型一错再错

这意味着 `hello2cc` 的能力有两层：

- 认知层：告诉模型“应该怎么走”
- 执行层：在模型准备走错时把它拉回来

### 5. PostToolUse / PostToolUseFailure：把经验写回 session state

`hello2cc` 会把某些关键结果写回 session 级状态，例如：

- team 是否已经成功建立
- 某个 tool 或路径是否刚刚失败
- worktree 前提是否不满足
- 当前 transport 下 WebSearch 是否已经出现连续失败或 cooldown

这样下一轮再做 route guidance 时，模型看到的不再是“静态能力说明”，而是“带运行时经验的能力说明”。

这也是它能减少机械重试的重要原因。

## 为什么它能让模型“知道我们项目的能力”

因为在很多真实系统里，模型对能力的理解有三个缺口：

1. 可见性缺口

模型不知道当前回合到底暴露了哪些真实能力。

2. 优先级缺口

模型不知道先用哪一个入口，容易把 Tool、Agent、MCP、Workflow 混着选。

3. 执行边界缺口

模型即使理解了能力分布，也可能在调用时把参数组织错，导致明明选对了方向却执行失败。

`hello2cc` 分别对这三个缺口补强：

- 用 session snapshot 解决可见性缺口
- 用 route guidance 解决优先级缺口
- 用 pre-tool normalization 解决执行边界缺口

因此，它不是“增强了模型通用智力”，而是增强了模型对宿主能力面的可感知性和可执行性。

## 它和纯插件提示的差别

如果只有一段系统提示，通常会遇到两个问题：

- 模型未必稳定遵循
- 提示无法替代执行边界的真实校验

`hello2cc` 的效果更稳定，是因为它不是单点提示，而是“多事件、多阶段”的协同：

- 会话开始时注入初始能力态
- 每次用户提问时注入针对当前问题的 route context
- 每次关键工具调用前做输入修正
- 每次成功或失败后更新宿主记忆

所以它更像一个小型运行时编排器，而不是一段孤立的 system prompt。

## 从宿主角度看，它的真正价值

从宿主系统视角看，`hello2cc` 实际上定义了一种非常通用的模式：

- 宿主拥有真实能力面
- 模型负责语义理解和选择
- 路由规则由宿主明确表达
- 最终执行边界由宿主保护
- 历史成功与失败继续反馈给下一轮模型决策

这是一种“host-guided model orchestration”模式。

如果把它映射到 Gateway 入口层，可以理解成：

1. Gateway 收集会话能力与状态
2. Gateway 在 query 前补充 route guidance
3. Gateway 在 tool dispatch 前做规范化
4. Gateway 在 tool result 后写回 session memory

## v2 架构变更（2026-04-09）

v2 对 hello2cc 进行了大幅精简：

### 删除
- 策略注册系统（`strategy.ts` / `defaultStrategies.ts`）：7 条 default + 1 条 extra，大部分只加 1-2 行 prompt
- 复杂配置（`.claude/hello2cc.json` / `extraStrategies`）：JSON 嵌套太深
- `/hello2cc-init` 命令：不再需要生成配置

### 新增
- **多阶段意图推导**（`intentProfile.ts`）：从单一正则短路升级为 seed → artifact → workflow → planning 四层推导，信号从 5 个扩展到 25+
- **单通用策略**（`universalStrategy.ts`）：一个 `buildUniversalGuidance()` 函数取代策略注册表，输出 role / specialization / decision_backbone / execution_playbook / recovery_playbook / output_contract / tie_breakers
- **文件编辑失败保护**（`fileEditProtection.ts`）：记录 Edit/Write 失败按 path+errorType 去重，≥3 次自动 block，并在 guidance 中注入 recovery 建议
- **简化配置**：settings 中仅保留 `enabled` 和 `strategyProfile`（balanced | strict）

### 简化配置

```json
{
  "hello2cc": {
    "strategyProfile": "balanced"
  }
}
```

## 映射到本项目的集成视角

如果要把这套能力整合进当前项目，不应把它理解为“再接一个插件”，而应理解为一层 Gateway orchestration enhancement。

最适合沉淀成宿主内建能力的模块包括：

- `session-state`
- `intent-profile`
- `route-guidance`
- `tool-normalization`
- `preconditions`
- `subagent-guidance`

这些模块共同完成的事情是：

- 让模型知道当前项目和当前会话已经具备什么能力
- 让模型理解这些能力的优先级
- 让模型在真正执行前不轻易越界或走错入口
- 让上一轮的真实运行结果参与下一轮决策

## 适合落地的能力清单

如果只保留 `hello2cc` 最有价值的部分，推荐优先集成这些能力：

1. 会话能力快照
2. 用户请求的 intent profile 分析
3. route guidance 注入
4. `Agent / TeamCreate / SendMessage / EnterWorktree` 的 pre-tool normalization
5. tool success / failure 的 session 级记忆

如果需要继续增强，再逐步加入：

1. Explore / Plan / general-purpose 的差异化 guidance
2. subagent stop quality gate
3. WebSearch 健康与 cooldown 策略
4. 更细的 capability policy registry

## 非目标

下面这些不应由 `hello2cc` 风格层承担：

- provider / model API 适配
- OAuth 或账号生命周期设计
- 底层工具是否存在的创建逻辑
- 真实权限系统
- 领域业务规则本身

这些仍然应该留在底层网关、认证层、工具注册层和业务系统里。

## 最终结论

`hello2cc` 之所以能让其他模型“知道我们项目的能力”，并不是因为它替模型增加了知识，而是因为它把宿主已经知道的事实，以模型更容易理解和更不容易走错的方式，在多个生命周期事件中持续暴露给模型。

它的本质不是模型增强，而是宿主编排增强：

- 把能力显式化
- 把优先级结构化
- 把输入边界规范化
- 把运行时经验记忆化

当这四件事同时成立时，第三方模型就会更像一个真正理解宿主能力面的参与者，而不是一个只会泛化推理的外部模型。
