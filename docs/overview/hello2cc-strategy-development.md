# hello2cc Strategy Development

更新时间：2026-04-06

## 目的

这篇文档面向后续开发者，说明如何在当前项目里继续扩展 `hello2cc` 的策略层，而不破坏现有的深度集成主链。

适用场景：

- 为不同 provider / model 增加专属 orchestration policy
- 为长任务增加更强的质量门控
- 为特定团队或项目增加自定义 route guidance
- 排查为什么某条策略生效或没有生效

## 当前架构

当前 `hello2cc` 已采用“深度集成内核 + 可插拔策略层”的结构：

- 深度集成内核负责：
  - query 入口接线
  - tool normalization
  - preconditions
  - session memory
  - transcript persistence
  - `/resume`
  - `/status`
- 策略层负责：
  - session start guidance
  - route recommendations
  - subagent guidance
  - 部分质量门控 preconditions

代码入口：

- [src/orchestration/hello2cc/strategy.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/orchestration/hello2cc/strategy.ts)
- [src/orchestration/hello2cc/defaultStrategies.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/orchestration/hello2cc/defaultStrategies.ts)

## 策略接口

当前 `Hello2ccStrategy` 支持这些扩展点：

- `buildSessionStartLines`
- `buildRouteRecommendations`
- `suggestSubagentGuidance`
- `checkPreconditions`

并支持：

- `priority`
- `when(context)`
- `scope`

其中 `context` 已包含：

- `sessionId`
- `cwd`
- `provider`
- `model`
- `strategyProfile`
- `qualityGateMode`
- `providerPoliciesEnabled`
- `sessionState`

其中 `scope` 当前支持：

- `sessionIds`
- `cwdPrefixes`
- `providers`
- `modelPatterns`

## 推荐扩展方式

### 1. provider / model policy

适合放在：

- `buildRouteRecommendations`

推荐用途：

- 提醒某类 provider 更依赖显式 host facts
- 对容易误用工具的模型补更明确的 routing 文案
- 对代理 / 非官方模型强调“短路径、少猜测、显式 tool name”

注意：

- 这类策略优先做 guidance，不要一上来就做 hard block
- 只有在高置信度风险下才考虑进入 `checkPreconditions`

当前仓库里已经有一层参考实现：

- provider-aware 通用策略
- GPT-family 策略
- Qwen-family 策略
- DeepSeek-family 策略

这意味着后续如果继续补模型族，不需要改主链，只要新增 strategy。

### 2. 长任务质量门控

适合放在：

- `buildRouteRecommendations`
- `checkPreconditions`

推荐用途：

- retry 压力升高时提醒先 verify / diagnose
- active team 已存在时提醒复用
- strict 模式下阻止重复 TeamCreate
- strict 模式下阻止高 retry 压力下继续 implement worker

注意：

- `advisory` 模式优先给 note，不要直接 block
- `strict` 模式才做真正的 fail-closed

### 3. subagent guidance

适合放在：

- `suggestSubagentGuidance`

推荐用途：

- 根据宿主暴露的 subagent type 自动补 `Plan` / `Explore`
- 在不改写 `subagent_type` 时补 shaping notes
- 对特定模型或 provider 进一步强调 read-only / bounded task 形态

## 设置项

当前可通过 `settings.json` 中的 `hello2cc` 配置控制策略行为：

```json
{
  "hello2cc": {
    "resumeSummaryStyle": "compact",
    "strategyProfile": "balanced",
    "qualityGateMode": "advisory",
    "enableProviderPolicies": true,
    "extraStrategies": [
      {
        "id": "gateway-long-task-policy",
        "priority": 90,
        "scope": {
          "cwdPrefixes": ["/Users/gclm/workspace/lab/ai/gclm-code"],
          "strategyProfiles": ["balanced", "strict"],
          "qualityGateModes": ["advisory", "strict"]
        },
        "activation": {
          "intents": ["implement", "verify", "plan"],
          "minRetryPressure": 2
        },
        "sessionStartLines": [
          "- project policy: keep Gateway long tasks phase-oriented and prefer reusing the current execution surface."
        ],
        "routeRecommendations": [
          "Prefer reusing the active Gateway worker set before creating another parallel branch.",
          "If retries are accumulating, switch to diagnosis or verification before another implementation hop."
        ],
        "subagentGuidance": {
          "toolNames": ["Agent"],
          "shapingNotes": [
            "When delegating a long-running Gateway slice, keep the worker prompt phase-scoped and ask for touched files plus verification evidence."
          ]
        },
        "preconditions": [
          {
            "toolNames": ["TeamCreate"],
            "requireActiveTeam": true,
            "block": false,
            "notes": [
              "Project policy: an active team already exists, so prefer SendMessage unless a brand-new parallel split is explicitly required."
            ]
          }
        ]
      }
    ]
  }
}
```

说明：

- `resumeSummaryStyle`
  - 控制 `/resume` 后 hello2cc 恢复提示的样式
- `strategyProfile`
  - `balanced` 或 `strict`
  - 用于控制 route guidance 的总体激进程度
- `qualityGateMode`
  - `off` / `advisory` / `strict`
  - 用于控制长任务质量门控强度
- `enableProviderPolicies`
  - 是否启用 provider / model-specific route policy
- `extraStrategies`
  - 从 settings 声明额外的 declarative policy
  - 当前支持：
    - `sessionStartLines`
    - `routeRecommendations`
    - `subagentGuidance`
    - `preconditions`
    - `activation`
    - `scope.strategyProfiles`
    - `scope.qualityGateModes`

## 推荐默认配置

如果当前项目以 Gateway 深度集成为主，并且经常存在长任务与 `/resume` 续跑，推荐先从下面这个默认片段起步：

```json
{
  "hello2cc": {
    "resumeSummaryStyle": "compact",
    "strategyProfile": "balanced",
    "qualityGateMode": "advisory",
    "enableProviderPolicies": true,
    "extraStrategies": [
      {
        "id": "gclm-code-default-long-task",
        "priority": 90,
        "scope": {
          "cwdPrefixes": ["/Users/gclm/workspace/lab/ai/gclm-code"],
          "strategyProfiles": ["balanced", "strict"],
          "qualityGateModes": ["advisory", "strict"]
        },
        "activation": {
          "intents": ["implement", "verify", "plan"],
          "minRetryPressure": 2
        },
        "sessionStartLines": [
          "- project default: keep Gateway long tasks phase-oriented, resume-friendly, and biased toward execution-surface reuse."
        ],
        "routeRecommendations": [
          "Prefer SendMessage or reuse of the active team/worktree before creating another parallel branch.",
          "If retries are accumulating, switch to diagnosis or verification before another implementation hop."
        ],
        "subagentGuidance": {
          "toolNames": ["Agent"],
          "shapingNotes": [
            "For this repository, long-running Agent tasks should stay phase-scoped and always report touched files plus validation evidence."
          ]
        },
        "preconditions": [
          {
            "toolNames": ["SendMessage"],
            "requireActiveTeam": true,
            "block": false,
            "notes": [
              "Project default: an active team already exists, so prefer reusing it rather than spinning up another parallel group."
            ]
          }
        ]
      }
    ]
  }
}
```

这份默认配置的意图是：

- 先保持 `balanced + advisory`，避免一上来把长任务硬阻断得太重
- 让 `/resume` 后的信息噪音更小，所以推荐 `compact`
- 通过 `extraStrategies` 给当前仓库加上“长任务优先复用现有执行面”的 repo policy
- 不把项目策略做成任意脚本，而是收敛成声明式 session-start / route / subagent / precondition 四类能力

## 约定式配置文件

除了直接写进主 `settings.json`，当前项目还支持两类 hello2cc 约定文件，并会自动加载：

- 用户级项目配置：
  - `~/.claude/hello2cc/<project>-<hash>.json`
- 仓库级项目配置：
  - `<repo>/.claude/hello2cc.json`

推荐优先级理解为：

1. `settings.json` 仍然是显式配置入口
2. 约定文件用于“当前项目的 hello2cc 默认策略”
3. 如果两边同时存在，显式 settings 仍然可以覆盖约定文件

这样做的目的，是避免每接一个新项目都去手改主 `settings.json`。

## 一键生成

当前已新增命令：

```bash
/hello2cc-init
```

默认会把当前项目的推荐 hello2cc 配置写到用户级项目配置文件。

也支持：

```bash
/hello2cc-init project
/hello2cc-init both
/hello2cc-init print
/hello2cc-init paths
```

含义：

- `project`
  - 写到当前仓库的 `.claude/hello2cc.json`
- `both`
  - 同时写用户级和仓库级
- `print`
  - 只打印生成的 JSON，不落盘
- `paths`
  - 查看当前项目解析出来的两个约定路径

当前 `/hello2cc` 也已支持多视图：

```bash
/hello2cc
/hello2cc summary
/hello2cc json
/hello2cc both
```

推荐用法：

- 人工排障默认看 `/hello2cc`
- AI 辅助排障时看 `/hello2cc json`
- 同时需要两者时看 `/hello2cc both`

其中 summary 视图当前已经不是只有静态摘要，而是一个轻量 mini console：

- `Severity`
  - 先判断当前是 `low / medium / high`
- `Detected anomalies`
  - 汇总 retry pressure、MCP auth/failed、active team/worktree reuse opportunity、tool search confidence 等异常或机会信号
- `Suggested actions`
  - 直接给出下一步建议，减少人工从原始 JSON 自己推断的成本

## 新增策略的步骤

1. 在 [defaultStrategies.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/orchestration/hello2cc/defaultStrategies.ts) 新增策略对象
2. 明确 `priority`
3. 如果策略只在部分会话生效，补 `when(context)`
4. 只在高置信度情况下使用 `checkPreconditions`
5. 为策略补最小回归测试
6. 如有用户可见变化，同步更新文档与 `harness/state.md`

如果只是想做轻量的项目定制，而不想改源码，可以优先使用 `hello2cc.extraStrategies`。

## priority 约定

当前约定：

- 数值越大，越早参与策略聚合
- provider/model-specific policy 通常优先级更高
- 通用 capability policy 次之
- 长任务 quality gate 和 advisory policy 居中
- 兜底或弱提示策略优先级更低
- model-family policy 通常比通用 provider-aware policy 更高

建议不要把多个策略都设成相同高优先级，避免调试时难以判断顺序。

## 什么时候该用 `when(context)`

推荐用于：

- 只在 `providerPoliciesEnabled === true` 时启用
- 只在特定 provider 下启用
- 只在 `qualityGateMode === 'strict'` 时启用 hard block
- 只在 `strategyProfile === 'strict'` 时启用更强 guidance

不推荐用于：

- 复杂业务流程判断
- 大段语义判断

这类逻辑仍应留在 intent profile 或具体策略函数内部。

## 什么时候该用 `scope`

推荐用于：

- 只在某个项目路径前缀下启用
- 只在指定 session 下启用
- 只在某个 provider 下启用
- 只在某类 model pattern 下启用

如果条件是明确的静态匹配，优先用 `scope`；如果条件依赖更复杂的运行时判断，再用 `when(context)`。

## 排查策略是否命中

当前可通过以下方式观察：

1. `/status`
   - `Host facts` 中可看到 provider、strategy profile、quality gate
   - `Routing posture` 中可看到 active strategies
   - `Debug snapshot` 中可一次性看到 host facts、strategySurface、memoryPressure、recent successes/failures
2. debug log
   - `build route guidance`
   - `normalize`
   - `checked preconditions`
3. transcript + `/resume`
   - 用于确认长任务恢复后策略上下文是否延续

如果策略没有生效，优先检查：

1. `when(context)` 是否返回了 `false`
2. 当前 provider / model / settings 是否符合预期
3. 该策略是否只写了 advisory notes，但当前观察点只看 block
4. 该策略是否被更高优先级策略覆盖了表达

## 测试建议

新增策略时，至少补以下一种测试：

- route guidance 内容测试
- subagent guidance 测试
- precondition block / advisory note 测试
- `/status` 的 host facts / routing posture 测试

已有参考：

- [tests/orchestration/hello2cc.test.ts](/Users/gclm/workspace/lab/ai/gclm-code/tests/orchestration/hello2cc.test.ts)
- [tests/orchestration/hello2cc.resume.test.ts](/Users/gclm/workspace/lab/ai/gclm-code/tests/orchestration/hello2cc.resume.test.ts)

## 当前仍未完成的部分

虽然策略层已经可插拔，但还没完全成熟，后续仍可继续补：

- 按 project / session 粒度选择策略
- 更细粒度的外部插件注册入口
- 更完整的策略冲突处理
- 更系统的 telemetry / debug dump

## 一句话原则

策略层负责“怎么引导和约束”，主链负责“怎么接线和持久化”。

扩展策略时，优先加 guidance，谨慎加 hard block；能放到策略层的，就不要再把判断散回 query 或 tool dispatch 主链。
