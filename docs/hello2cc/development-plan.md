# hello2cc 开发计划

> 基于 v2 架构现状与项目维护阶段定位制定。
> 更新时间：2026-04-09

## 一、当前状态快照

### 已完成的核心管线

```
UserPrompt → IntentProfile(4层/25+signals) → UniversalGuidance
           → RouteGuidance → SystemContext注入
           → PreToolUse(normalize + precondition)
           → PostToolUse/Failure(记忆) → 恢复建议
```

- 13 个源文件，TypeScript 内嵌到 gclm-code 主链
- 5 个 Hook：SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / PostToolUseFailure
- 2 个测试文件，20 个用例
- transcript 持久化 + resume 恢复链路完整

### 已知待办（来自 harness/state.md）

1. 路由去重 / normalization / memory 命中的独立指标
2. `/status` 和 `/resume` 摘要增强（最近失败时间戳、匹配的路由片段）
3. `/hello2cc` 诊断摘要的控制台样式优化

## 二、优先级矩阵

按 **对用户可见价值 × 实现成本** 排序，结合项目当前处于"维护态、不做大改造"的定位。

### P0 — 必须做（阻塞发布质量）

| # | 项目 | 原因 | 预估工作量 |
|---|------|------|-----------|
| 1 | **补路由去重** | 原版有 `lastRouteStateSignature` 防止重复注入；当前实现在相似 prompt 上会重复分析并注入 guidance，浪费 context 窗口 | 半天 |
| 2 | **补测试覆盖** | 2 个测试文件 vs 原版 18 个。缺 SubagentStart、TeamCreate 边界、文件编辑保护边界、resume 异常路径的测试 | 1-2 天 |

### P1 — 应该做（提升日常使用体验）

| # | 项目 | 原因 | 预估工作量 |
|---|------|------|-----------|
| 1 | **`/status` 和 `/resume` 摘要增强** | 已知待办，用户在长任务续跑时需要看到"上次失败在哪里、哪个 guidance 被匹配" | 半天 |
| 2 | **独立可观测指标** | 路由引导次数 / normalization 触发次数 / memory 命中次数，当前只能通过 `/hello2cc` 诊断 dump 看瞬时状态 | 半天 |

### P2 — 值得做（增强鲁棒性）

| # | 项目 | 原因 | 预估工作量 |
|---|------|------|-----------|
| 7 | **WebSearch 健康追踪** | 原版有 cooldown / probe-once / proxy-conditional 三种模式；当前无法感知外部搜索能力退化 | 1 天 |
| 8 | **`/hello2cc` 诊断样式优化** | 已知待办，当前输出为纯文本 dump | 半天 |
| 9 | **轻量级 Team 状态追踪** | 非完整 Team 管理，仅记录"当前活跃 team 名称 + 成员列表快照"，用于跨 turn 连续性 | 半天 |

### P3 — 可选做（视后续需求）

| # | 项目 | 原因 | 预估工作量 |
|---|------|------|-----------|
| 10 | Task 生命周期质量验证 | 原版 TaskCreated/Completed 质量检查；当前完全缺失 | 1-2 天 |
| 11 | SubagentStop 质量校验 | 原版子代理完成后的自动验证 | 1 天 |
| 12 | 配置项扩充 | 当前仅 2 个配置项（resumeSummaryStyle, strategyProfile）；原版有 10 个 | 待定 |

## 三、推荐执行顺序

基于项目当前处于"单包发布维护态"的定位，推荐分三批执行：

### 第一批：路由去重 + 测试（本周）

**目标：修补最影响日常体验和发布质量的两个问题**

1. [x] 补路由去重（P0-1）— `computeRouteGuidanceSignature()` + hook 级别去重
2. [x] 补测试覆盖（P0-2）— 20 → 43 用例，覆盖：
   - [x] SubagentStart 上下文注入（4 个用例）
   - [x] TeamCreate 边界场景（重复创建 + SendMessage 非广播放行）
   - [x] 文件编辑保护边界（3 次通用阈值 + 2 次权限阈值 + 不同文件不受影响）
   - [x] resume 异常路径（空状态 + 部分状态 + 缺少数组的损坏状态）

### 第二批：可观测性与摘要增强（下周）

**目标：让 hello2cc 的行为可观测、可排查**

4. [ ] `/status` 和 `/resume` 摘要增强（P1-1）
5. [ ] 独立可观测指标（P1-2）

### 第三批：选择性增强（按需）

**目标：根据实际使用反馈决定是否投入**

1. [ ] WebSearch 健康追踪（P2-1）
2. [ ] `/hello2cc` 诊断样式优化（P2-2）
3. [ ] 轻量级 Team 状态追踪（P2-3）

## 四、不推荐做的事

在项目当前维护态定位下，**不建议**投入以下工作：

| 项目 | 原因 |
|------|------|
| 完整 Team 管理重写 | 项目定位是"单包发布维护"，非大改造 |
| 配置项扩充到 10 个 | 2 个配置已覆盖主要使用场景，增加配置项会带来维护负担 |
| SubagentStop 质量校验 | 需要额外的模型调用成本，收益不明确 |
| Task 生命周期完整实现 | 涉及任务系统重构，超出 hello2cc 编排层的职责边界 |

## 五、决策记录

| 决策 | 原因 | 日期 |
|------|------|------|
| 路由去重放在 P0 | 影响 context 窗口效率，是日常使用中最容易感知的问题 | 2026-04-09 |
| 不追求测试数量对等 | 原版 18 个文件中有部分是插件特有 hook 测试（TeammateIdle 等），当前架构不需要对等覆盖 | 2026-04-09 |
| WebSearch 健康放在 P2 | 当前项目使用场景中 WebSearch 不是核心路径 | 2026-04-09 |
