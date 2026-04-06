# hello2cc Gateway Status And Resume

更新时间：2026-04-06

## 目的

这篇文档说明当前 hello2cc 编排增强层在 Gateway 中的三个日常观察面：

- `/status` 能看到什么
- `/resume` 后会提示什么
- `hello2cc-state` 在 transcript 中扮演什么角色

如果你正在跑长任务，这篇文档的目标是帮助你快速回答两个问题：

1. hello2cc 现在到底记住了什么
2. `/resume` 之后这些记忆有没有真的恢复回来

如果你要继续排查“为什么恢复了但行为还是不对”或“模型为什么像没感知到能力”，请继续看：

- [docs/hello2cc/gateway-diagnostics.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/hello2cc/gateway-diagnostics.md)

## 三者关系总览

当前链路可以理解为：

1. 运行时内存里维护一份 hello2cc session state
2. 这份 state 会定期持久化为 transcript metadata entry
3. `/resume` 时从 transcript 里恢复回内存
4. `/status` 和 `/resume` 提示都基于这份恢复后的 state 展示

对应关系如下：

- `/status`
  - 用来查看当前 session 持有的 hello2cc 状态快照
- `/resume`
  - 用来把上一次 session 的 hello2cc 状态恢复回内存，并立刻给出一条恢复提示
- `hello2cc-state`
  - 用来把 hello2cc 的 session memory 持久化到 transcript，保证跨进程、跨重启还能续上

## `hello2cc-state` 是什么

当前 hello2cc 不只是“进程内记忆”。

它会把编排增强层使用到的关键 session state 作为 transcript metadata entry 写入日志，entry 类型是：

```text
type: "hello2cc-state"
```

这份 state 目前主要包含：

- capability snapshot
- last intent
- last route guidance
- active team
- active worktree
- recent successes
- recent failures
- tool failure counts

相关实现位置：

- [src/utils/sessionStorage.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/sessionStorage.ts)
- [src/utils/conversationRecovery.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/conversationRecovery.ts)
- [src/utils/sessionRestore.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/sessionRestore.ts)

## `/status` 会展示什么

当前 `/status` 已经接入 hello2cc 状态展示，分成两层：

1. 一条紧凑健康摘要
2. 若干详细字段

### 1. 健康摘要

`/status` 会先显示：

```text
Orchestration health: intent=implement · 4 capabilities · team=gateway-workers · worktree=active · 1 success · 1 failure · 2 total retries
```

这条摘要的价值是让你在不翻 debug log 的情况下，先快速判断：

- 当前轮的主意图是什么
- hello2cc 认为当前 Gateway 暴露了多少关键能力
- 是否已经存在 active team / worktree
- 最近是不是在连续失败或重试

### 2. 详细字段

摘要下面会继续展示详细状态，例如：

- `Gateway orchestration`
- `Surfaced capabilities`
- `Last intent`
- `Active team`
- `Active worktree`
- `Recent successes`
- `Recent failures`
- `Failure counts`

相关实现位置：

- [src/utils/status.tsx](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/status.tsx)
- [src/orchestration/hello2cc/summary.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/orchestration/hello2cc/summary.ts)

## `/resume` 后会发生什么

当前 `/resume` 成功加载 transcript 后，会走一条通用恢复链路，把 `hello2cc-state` 回填到内存态。

恢复完成后，系统会追加一条 info message，告诉你“刚刚恢复了哪些 hello2cc 记忆”。

默认示例：

```text
Restored hello2cc orchestration memory: team=gateway-workers · worktree=/tmp/gateway-workers · intent=implement · 1 success · 1 failure · 4 capabilities
```

这条提示的作用不是替代 `/status`，而是让长任务续跑场景下，你在恢复瞬间就能确认：

- team 有没有恢复
- worktree 有没有恢复
- 上一轮 intent 还在不在
- recent success / failure 有没有延续

相关实现位置：

- [src/screens/REPL.tsx](/Users/gclm/workspace/lab/ai/gclm-code/src/screens/REPL.tsx)
- [src/cli/print.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/cli/print.ts)
- [src/orchestration/hello2cc/summary.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/orchestration/hello2cc/summary.ts)

## `resumeSummaryStyle` 配置

当前支持用 settings 控制 `/resume` 后这条 hello2cc 提示的详细程度。

配置项：

```json
{
  "hello2cc": {
    "resumeSummaryStyle": "detailed"
  }
}
```

可选值：

- `detailed`
  - 默认值
  - 展示 team、worktree、intent、success/failure、capability 轮廓
  - 更适合长任务和需要强确认感的续跑场景
- `compact`
  - 使用更短的健康摘要风格
  - 更适合你已经熟悉链路，只想快速确认恢复是否发生

`compact` 示例：

```text
Restored hello2cc orchestration memory: intent=implement · 4 capabilities · team=gateway-workers · worktree=active · 1 success · 1 failure · 2 total retries
```

配置 schema 与读取位置：

- [src/utils/settings/types.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/settings/types.ts)
- [src/utils/settings/settings.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/utils/settings/settings.ts)

## 推荐使用方式

如果你们经常跑长任务，建议这样配合使用：

1. 平时先看 `/resume` 后的恢复提示，确认关键记忆已经回来了
2. 如果要进一步核对细节，再看 `/status`
3. 如果 `/resume` 提示看起来不对，再去看 transcript 与 debug log

这套顺序的好处是：

- 第一眼先确认“恢复是否发生”
- 第二眼确认“恢复内容是否完整”
- 第三眼才进入开发者排查路径

## 什么时候该怀疑恢复不完整

以下情况值得警惕：

- `/resume` 后完全没有 hello2cc 恢复提示
- `/status` 里看不到预期的 active team / active worktree
- 之前已有 success/failure memory，但恢复后全部归零
- 下一轮 route guidance 不再体现既有 team/worktree 或 recent failure

遇到这些情况，建议回到诊断文档继续排查：

- [docs/hello2cc/gateway-diagnostics.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/hello2cc/gateway-diagnostics.md)

## 一句话理解

可以把三者关系记成一句话：

`hello2cc-state` 负责“记住”，`/resume` 负责“恢复并提示”，`/status` 负责“随时查看当前记住了什么”。
