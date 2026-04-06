# hello2cc Gateway Diagnostics

更新时间：2026-04-06

## 目的

这篇文档面向 Gateway 开发者，说明当前 `hello2cc` 编排增强层的诊断入口、日志信号，以及 `/resume` 之后如何判断编排状态是否真正恢复。

本文重点回答：

- 当前 hello2cc 编排层会输出哪些 debug 信号
- 这些信号分别对应哪一段主链
- 遇到“模型像没感知到能力”时应该先看什么
- `/resume` 之后如何确认 session memory 已恢复

如果你要看的不是排查路径，而是日常使用里的 `/status`、`/resume` 提示和配置项，请先看：

- [docs/overview/hello2cc-gateway-status-and-resume.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/overview/hello2cc-gateway-status-and-resume.md)

## 当前可观测范围

第一阶段已经覆盖的观测点有 5 类：

1. route guidance 构建
2. tool input normalization 命中
3. precondition fail-closed 命中
4. tool success memory 写回
5. tool failure memory 写回

另外，当前 `/status` 中的 `Host facts` 与 `Routing posture` 也已经成为排查入口，可以直接看到：

- 当前 provider / model 对应的宿主事实
- 当前启用的 strategy profile 与 quality gate
- 当前命中的 active strategy IDs
- `Debug snapshot` 中的完整 hello2cc 结构化快照

另外，hello2cc session state 现在已经会持久化到 transcript，并在 `/resume` 时恢复到内存态。

这意味着当前既能看运行时日志，也能看恢复后的行为是否延续上一个 session。

## 日志入口

hello2cc 当前复用现有 `logForDebugging(...)`，没有另起一套 telemetry channel。

相关实现位置：

- [src/orchestration/hello2cc/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/orchestration/hello2cc/index.ts)
- [src/utils/debug.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/debug.ts)

查看方式：

1. 启动时带 `--debug` 或 `-d`
2. 运行中开启 `/debug`
3. 直接查看当前 session debug 文件，默认位于 `~/.claude/debug/<session-id>.txt`

如果需要把 debug 直接打印到终端，可使用 `--debug-to-stderr`。

## 事件与日志对照

### 1. Route Guidance 构建

对应链路：

- [src/query.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/query.ts)
- [src/orchestration/hello2cc/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/orchestration/hello2cc/index.ts)

典型日志：

```text
[hello2cc] built route guidance for session <session-id>: {"intent":"implement","provider":"firstParty","strategyProfile":"balanced",...}
```

这条日志出现，说明以下动作已经发生：

- 已从当前对话里抽取最新用户 prompt
- 已完成 intent profile 分析
- 已生成 `gateway_orchestration` system context
- 已生成 `gateway_orchestration_state` user context snapshot
- 已把最新 orchestration state 写入 session 持久化缓存

如果这条日志一直没有出现，优先排查：

1. 当前轮是否真的进入了 `queryLoop`
2. 用户消息是否为空或被视为 meta message
3. [src/query.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/query.ts) 中 `buildGatewayOrchestrationContext(...)` 是否被主链调用

### 2. Tool Normalization 命中

对应链路：

- [src/services/tools/toolExecution.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/tools/toolExecution.ts)
- [src/orchestration/hello2cc/toolNormalization.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/orchestration/hello2cc/toolNormalization.ts)

典型日志：

```text
[hello2cc] normalized Agent: changed=yes, notes=Filled Agent.description from the task prompt so the worker is easier to route and track.
```

或：

```text
[hello2cc] normalized SendMessage: changed=yes, notes=Filled SendMessage.summary from the message body so the routing preview is explicit.
```

这类日志表示：

- 模型已经走到真实 tool dispatch 前
- hello2cc 已参与工具输入修正
- schema validation 看到的是修正后的输入，而不是模型原始输入

如果明明期望命中 normalization，但日志没有出现，优先检查：

1. 工具名是否正好是 `Agent` / `SendMessage` / `TeamCreate` / `EnterWorktree`
2. 输入是否其实已经满足规范，没有触发变化
3. 当前 tool call 是否在 [src/services/tools/toolExecution.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/tools/toolExecution.ts) 的主执行链里，而不是别的旁路

### 3. Precondition Fail-Closed 命中

对应链路：

- [src/services/tools/toolExecution.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/tools/toolExecution.ts)
- [src/orchestration/hello2cc/preconditions.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/orchestration/hello2cc/preconditions.ts)
- [src/orchestration/hello2cc/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/orchestration/hello2cc/index.ts)

典型日志：

```text
[hello2cc] checked preconditions for EnterWorktree: blocked=yes, notes=Blocked duplicate EnterWorktree because the session already tracks an active worktree.
```

这类日志表示：

- hello2cc 已经能在真实执行边界前拦截高置信度的确定性失败
- 当前工具调用被宿主 fail-closed，而不是继续撞进工具内部再报错
- 当前优先覆盖的是重复 worktree、无 team 广播、同输入重复失败等场景

### 4. Success Memory 写回

对应链路：

- [src/services/tools/toolExecution.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/tools/toolExecution.ts)
- [src/orchestration/hello2cc/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/orchestration/hello2cc/index.ts)

典型日志：

```text
[hello2cc] remembered tool success: tool=TeamCreate, successes=2, failures=0
```

如果成功工具是 `TeamCreate` 或 `EnterWorktree`，还会额外更新：

- `activeTeamName`
- `activeWorktreePath`

这些字段随后会进入下一轮 route guidance 和 route state snapshot。

### 5. Failure Memory 写回

对应链路：

- [src/services/tools/toolExecution.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/services/tools/toolExecution.ts)
- [src/orchestration/hello2cc/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/orchestration/hello2cc/index.ts)

典型日志：

```text
[hello2cc] remembered tool failure: tool=Agent, failureCount=1, recentFailures=1
```

这类日志表示：

- 工具主执行链已经落到失败分支
- hello2cc 已把失败摘要与 failure count 写入 session memory
- 下一轮 route guidance 和 normalization 可以引用这些失败信息，避免机械重试

## `/resume` 的恢复机制

当前 hello2cc 不依赖单纯的进程内内存。

它会把 session state 作为 transcript metadata entry 持久化，entry 类型为：

```text
type: "hello2cc-state"
```

相关实现位置：

- [src/utils/sessionStorage.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/sessionStorage.ts)
- [src/utils/sessionRestore.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/sessionRestore.ts)
- [src/utils/conversationRecovery.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/conversationRecovery.ts)

恢复链路如下：

1. `query` 或 `toolExecution` 更新 hello2cc state
2. state 通过 `saveHello2ccState(...)` 追加写入 transcript
3. `/resume` 时 `loadTranscriptFile(...)` 读取最后一条 `hello2cc-state`
4. `loadConversationForResume(...)` 把该状态挂到恢复结果上
5. `restoreSessionStateFromLog(...)` 调用 `restoreHello2ccSessionState(...)`
6. 下一轮 query 重新进入时，hello2cc 能带着上一个 session 的 memory 继续工作

## 如何判断恢复是否生效

最实用的判断方法不是只看 transcript 文件，而是看恢复后的行为是否延续：

1. 恢复前曾成功创建 team
2. `/resume` 之后再次提问
3. route guidance 日志中继续体现已有 success count
4. 生成的 guidance 文本中可再次出现 `active team already present`

另一种判断方式是看 failure memory 是否延续：

1. 某个工具刚失败过
2. `/resume` 之后再次触发相关请求
3. normalization 日志里继续出现 `Recent session failure on <tool>`

如果这些延续信号都消失，通常说明恢复链路没有真正接上。

## 常见排查顺序

当你怀疑“模型没有感知到 hello2cc 能力”时，建议按这个顺序看：

1. 先看有没有 `built route guidance`
2. 再看对应 tool call 有没有 `normalized ...`
3. 再看成功或失败后有没有 `remembered tool success/failure`
4. 如果是 `/resume` 后异常，再检查恢复后的第一轮是否还能延续旧的 success/failure memory
5. 最后看 `/status` 里的 `Host facts` 和 `Routing posture`，确认 provider、quality gate、active strategies 是否符合预期
6. 需要人工可读的摘要时，直接运行 `/hello2cc`
7. 需要给 AI 或脚本消费的原始数据时，运行 `/hello2cc json`

这个顺序有一个好处：

- 第一步确认 query 主链是否接上
- 第二步确认 tool 主链是否接上
- 第三步确认 memory 写回是否接上
- 第四步确认 persistence / resume 是否接上

## 正常信号与异常信号

正常信号通常长这样：

- 同一 session 中先出现 `built route guidance`
- 后续某次工具调用出现 `normalized ...`
- 紧接着出现 `remembered tool success` 或 `remembered tool failure`
- `/resume` 后再次出现 guidance 日志时，successes / failures 不是从 0 开始

值得警惕的异常信号包括：

- 整个 session 完全没有任何 `[hello2cc]` 日志
- 每轮都有 guidance，但从来没有 normalization / memory 日志
- success/failure 日志存在，但 `/resume` 后计数总是重新归零
- guidance 一直生成，但内容从不反映 `activeTeamName` / `activeWorktreePath`

## 当前局限

当前诊断仍然偏 debug-friendly，而不是产品级观测：

- 还没有独立 metric 或 event taxonomy
- 还没有把 route guidance 文本本身做结构化采样
- 已有专用 `/hello2cc` debug 命令，并支持 `summary/json/both` 三种视图，但还没有独立 metric 面板或结构化观测后台

所以当前最可靠的方式仍然是：

1. 看 debug 日志
2. 先看 `/resume` 提示与 `/status`
3. 需要人工摘要时运行 `/hello2cc`
4. 需要原始 JSON 时运行 `/hello2cc json`
5. 再看恢复后行为是否延续
6. 必要时直接查看 transcript 中的 `hello2cc-state` entry

如果你希望当前项目默认就带 hello2cc 策略，而不是每次手改主 `settings.json`，现在还可以：

1. 运行 `/hello2cc-init`
2. 让系统把推荐配置写到约定位置
3. 后续由约定文件自动加载

## 推荐后续增强

如果后面继续做 Phase 2，最值得补的是：

1. 把 `/hello2cc` 的 summary 视图继续升级成更强的结构化观测面板
2. 为 route guidance / normalization / memory hit 单独打 metric
3. 为 `/status` 与 `/resume` 的 hello2cc 摘要补更多可操作字段，例如最近一次失败时间与最近命中的 route guidance 片段
