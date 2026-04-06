# hello2cc Plugin Vs Deep Integration

更新时间：2026-04-06

## 目的

这篇文档回答一个关键设计问题：

- `hello2cc` 应该像参考项目一样，以插件形式接入
- 还是应该作为 Gateway 的一层深度集成编排增强来落地

结论先说：

- 如果目标只是快速验证提示增强是否有效，插件式更轻
- 如果目标是让能力在当前项目里长期稳定发挥作用，尤其覆盖长任务、`/resume`、`/status`、tool precheck 和 session memory，深度集成更理想
- 对当前项目，推荐采用“深度集成内核 + 可插拔策略层”的混合方案

## 三种形态

### 1. 插件式

插件式通常指：

- 在会话开始时注入一段额外 system prompt
- 在 prompt hook / agent hook 上附加一些路由提示
- 在工具调用前后做少量外挂式改写

它更像是“给模型补一份宿主说明书”。

### 2. 深度集成式

深度集成式通常指：

- 在主 query 链路中构造能力快照和 route guidance
- 在主 tool dispatch 链路中做 normalization、preconditions、success/failure memory
- 把 orchestration state 接到 transcript、`/resume`、`/status`

它更像是“给 Gateway 加一层调度中枢”。

### 3. 混合式

混合式指：

- 核心状态机和主链路接线走内建集成
- 意图词典、subagent policy、prompt patch、provider-specific 适配规则做成插件化或配置化

这也是本文最终推荐的形态。

## 对比结论

### 插件式优点

- 接入快，改动面小
- 容易灰度、试验和回滚
- 不容易侵入主链
- 适合先验证“其他模型能不能更理解宿主能力”
- 如果后面决定替换方案，迁移成本较低

### 插件式缺点

- 宿主事实往往拿不全，只能看到局部上下文
- 更像提示增强，不像真正的执行编排
- 很难稳定接入长任务恢复链路
- 很难让 `/status`、`/resume`、transcript、tool memory 形成一致闭环
- 当模型偏航时，插件通常只能提醒，不能强约束执行路径

### 深度集成式优点

- 更容易拿到可靠宿主事实，例如当前工具面、agent 面、MCP 面、搜索面
- 更适合非官方模型，因为可以把“模型猜测”替换成“宿主显式约束”
- 更适合长任务场景，session memory 和 `/resume` 更容易做扎实
- 更容易把编排状态暴露到 `/status` 和日志，排查路径清晰
- 更容易在 tool 入口做高置信度 fail-closed 保护

### 深度集成式缺点

- 开发和维护成本更高
- 需要更熟悉 query、tool execution、session restore 这些主链边界
- 如果模块边界画不好，容易把编排增强和 Gateway 核心逻辑耦死
- 升级主链时要承担更多兼容责任

## 为什么当前项目更适合深度集成

当前项目已经明确有这些目标：

- 要把 `hello2cc` 集成到我们自己的 Gateway 入口
- 要让能力“完全发挥作用”
- 存在长任务场景
- 需要 `/resume`
- 需要 `/status`
- 需要让非官方模型更稳定地理解和使用宿主能力

这些目标叠加在一起后，单纯插件式通常不够。真正有价值的不是“多加一段 prompt”，而是下面这条闭环：

1. 会话开始时识别宿主真实能力
2. 根据用户意图构造 route guidance
3. tool 调用前做 normalization 和 precondition check
4. tool 成功或失败后写回 session memory
5. transcript 持久化
6. `/resume` 恢复后继续影响下一轮决策
7. `/status` 可观测

这条链越完整，`hello2cc` 越接近“编排增强层”；越不完整，就越接近“提示词插件”。

## 当前推荐方案

### 内核层走深度集成

建议长期固定在 Gateway 主链里的能力：

- `intentProfile`
- `sessionState`
- `routeGuidance`
- `toolNormalization`
- `preconditions`
- `success/failure memory`
- `transcript persistence`
- `/resume`
- `/status`

### 策略层保留可插拔

建议继续抽成策略接口或配置项的能力：

- 意图词典和触发规则
- subagent 路由策略
- provider / model-specific prompt patch
- 某些团队自定义 orchestration profile
- 更细粒度的 observability sinks

当前仓库已经开始按这个方向收敛：

- query / tool / resume / status 仍是内建集成
- `hello2cc` 的 `session start guidance`、`route recommendations`、`subagent guidance` 已抽成第一版 strategy registry
- 默认策略仍然内建，以保证主行为稳定

## 对参考项目插件形态的判断

参考项目用插件方式是合理的，因为它的目标更偏向：

- 快速兼容现有宿主
- 尽量少侵入原有主链
- 用少量 hook 和提示增强换取可观收益

但在当前项目里，如果我们已经决定把 `hello2cc` 视为 Gateway 自己的能力增强层，那么“只做插件”会限制它在长任务、恢复、状态观察和 tool boundary 保护上的效果。

## 现阶段落地原则

后续开发按下面原则推进：

1. 不动 provider、login、model 主流程
2. 只在 query / tool / session restore / status 这些编排边界增强
3. 保持 `src/orchestration/hello2cc/` 内聚，不把策略散落到业务模块里
4. 能抽成策略的地方继续抽，避免未来维护成本过高

## 一句话总结

- 插件式：像给模型发一份宿主说明书
- 深度集成式：像给 Gateway 装一层调度中枢

对于当前项目，深度集成仍是更理想的主方案；但为了长期维护，策略层应继续朝可插拔方向收敛。
