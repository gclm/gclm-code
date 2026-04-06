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

## 当前项目长任务续跑演练

下面这段演练基于当前仓库已经启用的默认 hello2cc 配置：

- `resumeSummaryStyle = "compact"`
- `strategyProfile = "balanced"`
- `qualityGateMode = "advisory"`

适用场景：

- 你正在推进一个 Gateway 实现类长任务
- 过程中已经创建过 team 或 worktree
- 中途退出后，希望下一次进入时继续沿着旧执行面工作

### 1. 开始长任务

先正常发起任务，例如：

```text
请继续并行推进这个 Gateway 实现
```

这一步之后，hello2cc 会逐步记住：

- 当前 intent
- 当前 surfaced capabilities
- active team
- active worktree
- recent successes / failures

如果你在这个阶段已经创建过 `gateway-workers`，或者已经进入过某个 worktree，后面这些信息就会成为续跑依据。

### 2. 中途查看当前记忆

在任务进行中，先看：

```text
/status
```

如果链路正常，当前项目里你应该能看到类似信号：

```text
Orchestration health: intent=implement · 4 capabilities · team=gateway-workers · worktree=active · 1 success · 1 failure · 2 total retries
```

这表示 hello2cc 已经不只是“知道你在做实现任务”，还记住了：

- 已存在的 team
- 已存在的 worktree
- 最近已有一次成功和一次失败
- 当前 session 已经存在 retry pressure

如果你想看得更细，再运行：

```text
/hello2cc
```

此时建议重点看三块：

- `Severity`
- `Detected anomalies`
- `Suggested actions`

在当前项目的长任务里，如果已经有 active team / worktree，通常会看到“优先复用已有执行面”的建议，而不是鼓励再新开一层并行。

### 3. 中断任务后恢复

当你退出后再次进入，先运行：

```text
/resume
```

当前仓库默认是 `compact` 风格，所以恢复提示更接近：

```text
Restored hello2cc orchestration memory: intent=implement · 4 capabilities · 2 MCP connected · team=gateway-workers · worktree=active · 1 success · 1 failure · 2 total retries
```

这一步最重要的不是看文案好不好看，而是确认这几个锚点有没有回来：

- `intent=implement`
- `team=gateway-workers`
- `worktree=active`
- `1 success`
- `1 failure`
- `2 total retries`

如果这些锚点都在，说明 transcript 里的 `hello2cc-state` 已经成功恢复回当前内存态。

### 4. 恢复后继续推进，而不是重新起盘

恢复后再次给任务，例如：

```text
请继续并行推进这个 Gateway 实现
```

在当前项目里，预期 hello2cc 会把模型往下面这个方向引导：

- 已有 active team，优先复用 `gateway-workers`
- 已有 active worktree，优先复用当前 worktree
- 如果前面某条路径刚失败过，要显式提醒避免重复同一路径

换句话说，恢复后的目标不是“重新开始一轮”，而是“沿着旧的执行面继续推进”。

### 5. 如何判断这次续跑是成功的

最实用的判断标准有三条：

1. `/resume` 恢复提示里还能看到 team / worktree / success / failure / retries
2. `/status` 里的 `Orchestration health` 没有退回到像“全新 session”那样的空状态
3. 继续提问后，route guidance 仍然体现：
   - active team already present
   - recent failures to avoid repeating

只要这三条同时成立，就说明 hello2cc 在当前项目里的长任务续跑主链是接上的。

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
