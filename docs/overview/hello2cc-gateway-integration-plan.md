‘# hello2cc Gateway Integration Plan

更新时间：2026-04-06

## 目的

这篇文档承接 [hello2cc-capability-orchestration.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/overview/hello2cc-capability-orchestration.md)，把 `hello2cc` 的能力从“原理说明”进一步落成适用于当前项目的 Gateway 集成方案。

本文重点回答：

- 如果要把 `hello2cc` 的价值真正落进当前项目，应该放在哪一层
- Gateway 入口应该接哪些生命周期
- 应该拆成哪些模块
- 第一版应该先做什么，后做什么
- 哪些内容属于非目标，不要混到这一轮里

## 结论摘要

推荐把 `hello2cc` 视为一层 Gateway orchestration enhancement，而不是独立的模型插件或 provider 适配器。

最合适的落地方式是：

1. 保留你们现有的模型调用、认证和 provider 逻辑不动
2. 在 Gateway 主循环前后补一层宿主编排逻辑
3. 用 session state、route guidance 和 pre-tool normalization 承接 `hello2cc` 的核心价值
4. 分两期落地，先做最值钱的主线程路由能力，再做 subagent 和 quality gate

一句话说：

把 `hello2cc` 的“会话理解和执行纠偏”能力，内嵌到 Gateway 的 query 和 tool dispatch 入口，而不是把它当作一个外置插件原样搬进来。

## 当前落地现状

截至 2026-04-06，这份方案里第一阶段最关键的一批能力已经落地，当前状态可以理解为：

- 已落地：
  - `sessionState` 基础能力快照
  - `intentProfile` 轻量意图分析
  - `routeGuidance` 接入主 query 链路
  - `toolNormalization` 接入主 tool dispatch 链路
  - `preconditions` 独立 fail-closed 前置条件层
  - `PostToolUse` / `PostToolUseFailure` 的 success/failure memory 写回
  - `hello2cc-state` transcript 持久化与 `/resume` 恢复
  - `/status` hello2cc 健康摘要与详细字段
  - `/resume` hello2cc 恢复提示
  - 恢复后复用旧 memory 的回归测试
- 部分落地：
  - `subagentGuidance` 已从最小版扩展为更完整的保守策略：会结合宿主已暴露的 subagent type 决定是否自动补 `Plan` / `Explore`，并在不自动改写时补充 read-only shaping notes，但仍未下沉到更细粒度的 agent-specific prompt 模板
  - `strategy` 层已落地为第一版可插拔接口：当前 `session start lines`、`route recommendations`、`subagent guidance` 三类规则已从主链中抽成 strategy registry，默认仍以内建策略提供能力
- 尚未落地：
  - 面向 Phase 2 的质量门控和更强的 orchestrator policy
  - 更细粒度的策略插件化抽象，目前仍以内建策略 + 轻量 registry 为主

如果你要先看已落地后的日常使用与排查方式，可以直接跳到：

- [docs/overview/hello2cc-gateway-status-and-resume.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/overview/hello2cc-gateway-status-and-resume.md)
- [docs/overview/hello2cc-gateway-diagnostics.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/overview/hello2cc-gateway-diagnostics.md)

## 设计目标

这一轮集成的目标是：

- 让第三方模型更稳定地感知当前会话已经暴露的能力
- 让模型更倾向走宿主真实存在的最短路径
- 让关键工具调用在执行边界前得到规范化和 fail-closed 保护
- 让已发生的成功与失败影响下一轮模型决策

## 非目标

这一轮不应承担的内容：

- 重写 provider 接入层
- 改造 OAuth / login 生命周期
- 重新设计底层工具注册框架
- 重构全部 agent 体系
- 用一个新插件替代现有 Gateway

也就是说，这是一层 orchestration 增强，不是底层平台重写。

## 当前宿主基础

当前仓库已经具备实现这套方案的基础能力：

- 插件装载与 plugin 目录结构支持
- 持久化 hooks schema
- session-scoped hooks
- prompt hook 和 agent hook 执行器
- 内建 / 插件 agent 定义

这意味着 `hello2cc` 的核心能力在当前项目里不是“能不能实现”的问题，而是“以最合理的边界放在哪里”的问题。

从当前代码现状看，这个边界已经基本验证成立：

- 主查询增强放在 [src/query.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/query.ts)
- 主执行增强放在 [src/services/tools/toolExecution.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/tools/toolExecution.ts)
- hello2cc 自身逻辑内聚在 [src/orchestration/hello2cc/](/Users/gclm/workspace/lab/ai/gclm-code/src/orchestration/hello2cc)

并且相比初版，当前已进一步补齐：

- capability snapshot 不再只看基础工具面，也会记录 MCP 连接状态、tool search optimistic 信号、web search 可用性与请求计数、available subagent types
- `/status` 已能显示 `Host facts` 与 `Routing posture`，便于快速判断 hello2cc 当前到底看到了哪些宿主事实
- route guidance 会显式提示 MCP 待授权 / pending、tool search 不可置信、以及已暴露的 subagent specializations
- route / subagent policy 已挂到 strategy registry，后续要做 provider-specific 或 team-specific 策略时，不需要再直接改 query / tool dispatch 主链
- `hello2cc` settings 已扩到 `strategyProfile`、`qualityGateMode`、`enableProviderPolicies`，可用于控制 provider-aware policy 与长任务质量门控强度
- strategy registry 已继续补 `scope` 选择器，当前可按 `sessionIds`、`cwdPrefixes`、`providers`、`modelPatterns` 做 project / session / provider / model 级策略选择
- provider-aware policy 已继续细分到模型族，当前已内建 GPT-family、Qwen-family、DeepSeek-family 的 route guidance 规则

这也进一步说明：hello2cc 作为 Gateway orchestration enhancement 的落点是对的，不需要回退成插件层嫁接方案。

## 推荐架构

### 总体结构

推荐新增一层内部模块，例如：

```text
src/orchestration/hello2cc/
  index.ts
  sessionState.ts
  intentProfile.ts
  routeGuidance.ts
  toolNormalization.ts
  preconditions.ts
  subagentGuidance.ts
  capabilityPolicy.ts
```

然后把 Gateway 生命周期和这些模块对应起来：

```text
User message in
  -> sessionState.captureHostFacts()
  -> intentProfile.analyze()
  -> routeGuidance.build()
  -> query()

Model proposes tool call
  -> toolNormalization.normalize()
  -> preconditions.check()
  -> dispatch tool

Tool success / failure
  -> sessionState.rememberSuccess() / rememberFailure()
  -> affect next routeGuidance
```

### 为什么不建议直接复制插件目录

直接复制 `references/hello2cc` 的插件目录能快速工作，但长期不够理想，原因有三点：

1. 你们已经有原生 TS hook、session hook 和 agent 机制，不需要再多一层 shell 子进程编排
2. shell command hook 风格更适合兼容现有宿主，不是最适合内建集成的边界
3. 长期维护时，状态同步、错误处理、日志归档都会比内嵌模块更散

因此，推荐：

- 设计参考 `hello2cc`
- 行为内化到 Gateway
- 必要时仅保留少量插件兼容壳层

## 模块边界

### 1. `sessionState`

职责：

- 维护 session 级运行时事实
- 记录宿主暴露能力
- 记录成功或失败的关键事件
- 提供给 route guidance 和 tool normalization 使用

建议记录的数据：

- `toolNames`
- `agentSurfaces`
- `mcpResourcesAvailable`
- `toolSearchAvailable`
- `webSearchHealth`
- `teamState`
- `worktreeFailure`
- `lastRouteSignature`
- `mainModelSlot`

边界要求：

- 只存“宿主已确认的事实”
- 不存模型猜测
- 不承担长期业务状态，只承担 session 运行时状态

### 2. `intentProfile`

职责：

- 分析当前用户请求的意图
- 输出宿主可消费的结构化意图信号

建议产出字段：

- `explore`
- `implement`
- `verify`
- `review`
- `plan`
- `externalSystem`
- `needTeam`
- `needWorktree`

边界要求：

- 只做轻量语义分类
- 不要把完整规划逻辑放进这里
- 不直接决定最终调用哪个 tool，只提供路由信号

### 3. `routeGuidance`

职责：

- 根据 session state 和 intent profile 生成附加上下文
- 明确告诉模型当前宿主的能力边界和优先级

输出形式建议：

- 一段简短 prose
- 一份紧凑 JSON snapshot

推荐表达内容：

- 当前意图摘要
- 当前 surfaced capability
- 推荐路径顺序
- 不推荐的默认动作
- 已知失败前提

边界要求：

- 强调“宿主事实优先”
- 不覆盖用户高优先级要求
- 避免篇幅过长，防止提示噪音反噬

### 4. `toolNormalization`

职责：

- 在关键工具 dispatch 前修正输入
- 避免常见的宿主级错误

首批建议覆盖：

- `Agent`
- `TeamCreate`
- `SendMessage`
- `EnterWorktree`

推荐行为：

- 缺失字段补齐
- 不安全字段归一化
- 语义冲突输入做纠偏
- 前提不成立时 fail-closed

边界要求：

- 只改宿主契约边界问题
- 不替模型发明新业务参数
- 所有自动改写都要尽量可解释、可日志化

### 5. `preconditions`

职责：

- 对已经真实失败过的前提做记忆与阻断
- 避免模型在同一错误路径上机械重试

首批建议覆盖：

- 非 git 仓库时的 worktree
- team 尚未准备好的 teammate 路径
- 近期持续失败的 WebSearch
- 明确的 deterministic 参数错误

边界要求：

- 只阻断确定性失败
- 不阻断概率性失败
- 允许在前提变化后自动恢复

### 6. `subagentGuidance`

职责：

- 给不同 agent type 注入不同的行为习惯

首批建议覆盖：

- `Explore`
- `Plan`
- `General-Purpose`

建议行为差异：

- `Explore`：只读、搜索、定位、整理事实
- `Plan`：比较方案、约束和执行顺序
- `General-Purpose`：实现、修复、验证

边界要求：

- 只影响 agent 行为风格
- 不在这里重复主线程全部规则
- 不把 quality gate 和 route guidance 全混进 agent prompt

## Gateway 生命周期接线

### 1. SessionStart

目标：

- 建立初始宿主状态
- 注入第一份 session capability snapshot

动作：

1. 读取当前模型槽位、工具可用性、agent surface、MCP 状态
2. 初始化 session state
3. 生成第一份 session start context
4. 附加到主线程初始上下文

### 2. UserPromptSubmit

目标：

- 在每轮用户输入进入 query 前，为模型补一份和当前问题相关的路由图

动作：

1. 提取 prompt 文本
2. 分析 intent profile
3. 结合 session state 构造 route guidance
4. 去重后附加到本轮 query context

### 3. PreToolUse

目标：

- 在执行边界前把模型最常犯的宿主错误修正掉

动作：

1. 读取 `toolName` 和 `toolInput`
2. 调用 normalization pipeline
3. 如果需要：
   - 改写输入
   - 阻断调用
   - 给出 fail-closed 原因
4. 记录日志

### 4. PostToolUse / PostToolUseFailure

目标：

- 把运行时经验沉淀回 session state

动作：

1. 记录成功路径
2. 记录失败前提
3. 更新 WebSearch / team / worktree 健康态
4. 为下一轮 route guidance 提供事实输入

### 5. Agent Spawn

目标：

- 针对不同 agent 类型注入差异化行为习惯

动作：

1. 在 agent system prompt 组装阶段插入 `subagentGuidance`
2. 如果是 Explore/Plan/general-purpose，则按类型补充专门 guidance
3. 不建议优先用 shell hook 子进程处理，建议内嵌在 prompt 生成路径

## 分阶段落地计划

### Phase 1：最小可用版

目标：

- 先拿到 `hello2cc` 70% 左右的关键收益

建议范围：

- `sessionState`
- `intentProfile`
- `routeGuidance`
- `toolNormalization`
- `preconditions`

覆盖生命周期：

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `PostToolUseFailure`

首批支持的 tool：

- `Agent`
- `TeamCreate`
- `SendMessage`
- `EnterWorktree`

预期收益：

- 模型更少绕路
- 普通并行 agent 更少误入 team 路径
- 纯文本 `SendMessage` 更稳定
- 明确失败前提减少机械重试

### Phase 2：agent 深化版

目标：

- 进一步提升 agent/team 使用质量

建议范围：

- `subagentGuidance`
- 更细的 capability policy
- task / subagent stop quality gate
- WebSearch degradation policy

覆盖生命周期：

- `SubagentStart`
- `SubagentStop`
- `TaskCompleted`

预期收益：

- Explore / Plan / General-Purpose 的分工更稳定
- team 协作路径更少歧义
- subagent 结果质量更可控

## 验收建议

### 功能验收

至少验证下面几类场景：

1. 已存在 tool / MCP resource 时，模型是否更倾向直接使用 surfaced capability
2. 普通并行 agent 请求时，是否仍保持普通 worker 路径
3. 需要 team 的场景下，是否会更稳定地进入 team 路径
4. worktree 前提不满足时，是否停止机械重试
5. 纯文本 `SendMessage` 是否被稳定规范化

### 回归验收

重点关注：

1. route guidance 是否引入明显 prompt 噪音
2. pre-tool normalization 是否误改正常输入
3. session state 是否在切换会话或配置时正确清理
4. 失败记忆是否会在前提恢复后卡死

### 可观测性

建议为这层增加轻量日志：

- route guidance 生成次数
- normalization 命中次数
- fail-closed 次数
- 被记忆的 deterministic failure 类型
- 经过集成后 tool direct-hit 比例变化

## 风险与控制

### 风险 1：提示过多，反而让模型更吵

控制：

- route guidance 保持短
- 只注入当前相关能力
- 有 signature 去重，避免重复注入

### 风险 2：自动纠偏过度，掩盖真实模型行为

控制：

- 只纠偏宿主契约层问题
- 改写行为可日志化
- 保留关闭开关

### 风险 3：状态记忆错误，导致后续路径被误阻断

控制：

- 只记确定性失败
- 设置恢复条件
- 将 session state 严格限制在会话作用域

## 推荐实施顺序

推荐顺序如下：

1. 建 `sessionState` 数据结构和更新入口
2. 建 `intentProfile` 和 `routeGuidance`
3. 接入 `UserPromptSubmit` 前的上下文注入
4. 实现 `Agent / TeamCreate / SendMessage / EnterWorktree` 的 normalization
5. 接入 `PostToolUse / PostToolUseFailure`
6. 跑最小闭环验证
7. 再做 `subagentGuidance` 和质量门

## 最终建议

最推荐的方案不是“把 hello2cc 当成一个外置插件搬进来”，而是：

把它的有效机制拆成 Gateway 内建编排模块，让 Gateway 自己承担：

- 当前会话能力理解
- 当前请求意图理解
- 路由提示构造
- 工具调用前规范化
- 失败前提记忆

这样做的结果是：

- 保留 `hello2cc` 的核心价值
- 复用当前项目已有基础设施
- 避免额外进程边界和壳层复杂度
- 更适合长期演进成项目自己的能力

## 对应关系速查

`hello2cc` 原始能力到本项目落点的推荐映射如下：

| hello2cc 能力 | 本项目建议落点 |
| --- | --- |
| SessionStart context | Gateway query 前的 session capability snapshot |
| UserPromptSubmit route | query 前 route guidance builder |
| PreToolUse Agent normalization | tool dispatch 前 normalization pipeline |
| Team / worktree fail-closed | preconditions + session state |
| PostToolUse failure memory | session state updater |
| SubagentStart guidance | agent system prompt augmentation |
| SubagentStop quality gate | agent/task completion verifier |

## 后续文档建议

如果要继续完善这一组文档，建议后续再补：

- Gateway 生命周期时序图
- Phase 1 实施 checklist
- route guidance payload 示例
- normalization rules 规则表
