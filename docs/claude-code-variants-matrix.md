# Claude Code 三版本差异矩阵

## 结论摘要

### 推荐结论

1. 如果目标是研究“原版 Claude Code”的结构与边界，优先参考 `claude-code-rebuilt`
2. 如果目标是做“我们自己的 Claude Code 定制版”，推荐以 `free-code-main` 为开发基线
3. 如果目标是做一款更轻量、更偏 OpenAI-compatible 的新 agent，可以借鉴 `claude-ace` 的思路，但不建议直接把它当作 Claude Code 分支基线

### 判断原则

这次判断不是只看 README 宣传语，而是同时看了：

- 仓库自述
- 目录规模与结构
- 入口文件
- 构建脚本
- Provider / Auth 接入
- 工具系统和主循环
- 遥测与安全策略处理方式

## 总体印象

### `claude-code-rebuilt`

最接近“原版 Claude Code 的外部可运行重建版”。它更像一个还原样本。

### `free-code-main`

建立在 `claude-code-rebuilt` 相同谱系上的工程化 fork。它已经对多 provider、去遥测、特性解锁做了更适合继续演进的改造。

### `claude-ace`

已经不是“Claude Code 的一个版本”，而是一款借 Claude Code 启发、重新设计过的 agent 产品。

## 差异矩阵

| 维度 | `claude-code-rebuilt` | `free-code-main` | `claude-ace` | 结论 |
|---|---|---|---|---|
| 定位 | 明确是把泄露的 Claude Code `src/` 重建成可运行 CLI | 明确是基于 Claude Code 快照做的可构建 fork，主打去遥测、去 guardrail、开实验特性 | 明确是从第一性原理重构的新 agent | `rebuilt` 最像原版样本，`free-code-main` 最像可维护 fork，`ace` 最像新产品 |
| 与原版架构距离 | 最近，保留了 Claude Code 主骨架 | 与 `rebuilt` 同谱系，整体骨架仍是 Claude Code | 已换成自定义 agent loop 和自定义工具体系 | 想做 Claude Code 定制版，不应离开 `rebuilt/free-code` 这条谱系 |
| 构建与运行时 | Bun 重建工程，靠 shim 和 feature-off 跑通 | Bun 工程化更完整，支持多种构建变体 | Node 单包结构，轻量直接 | `free-code-main` 更适合持续产品化 |
| Provider / 模型接入 | 仍以 Anthropic 外部可运行化为核心 | 已有 `firstParty / bedrock / vertex / foundry / openai` provider 抽象，并接入 Codex OAuth | 直接走 OpenAI-compatible API | 如果要做自己的 provider 层，`free-code-main` 优势最明显 |
| 工具系统 | 保留 Claude Code 原命令/工具骨架 | 同样保留 Claude Code 工具系统与主循环 | 只有 ACE 自定义工具集 | 想保留 Claude Code 生态，不能以 `ace` 为基线 |
| MCP / skills / plugins / tasks | 主结构都还在，但许多能力被 feature 或外部依赖限制 | 仍保留完整主结构 | 不是这一套体系 | `free-code-main` 更适合继续保留扩展生态 |
| Feature flags | 非常保守，只开少量安全 feature | 已对 88 个 flag 做审计，支持按 feature-set 打包 | 没有 Claude Code 这套 feature 体系 | 想挑选性开放功能，`free-code-main` 最顺手 |
| 遥测 / 安全指令 | 主要通过 external build 和兼容层限制运行面 | 直接把 telemetry 做成 inert stub，并把 cyber risk 指令清空 | 安全策略完全是它自己的 | 如果要建立自己的策略边界，`free-code-main` 是更好的出发点 |
| 法律 / 分发风险 | README 明确写了仅研究/教育/归档，且 no license | 也明确承认来源于暴露快照，本质上不是干净授权 | `package.json` 为 MIT，但也承认有 Claude Code 源码提取背景 | 商业化都不够干净，内部研究和原型验证时 `free-code-main` 最现实 |

## 逐个版本判断

### 1. `claude-code-rebuilt`

#### 优点

- 最接近“原版 Claude Code”的结构和目录组织
- 适合做原版行为和架构参考
- 对缺失 build/type/shim 的重建非常系统

#### 不足

- 更像 reconstruction artifact，不像长期产品分支
- 对私有能力的处理大量依赖 `feature-off` 和 shim
- 更适合作为参考仓库，不是最理想的长期开发主分支

#### 适用场景

- 研究原版 Claude Code 是如何组织的
- 对照上游结构
- 在分歧时回看“原始骨架语义”

### 2. `free-code-main`

#### 优点

- 与 `claude-code-rebuilt` 同谱系，但更实用
- 已经完成多 provider 接入方向的关键工作
- 已把 telemetry 处理成兼容边界，方便继续接自己的实现
- 构建系统和 feature 体系更适合持续迭代

#### 不足

- 改动比 `rebuilt` 更深，不能再把它视为“纯原版”
- README 强调去 guardrail 和全开实验特性，这需要后续再收口
- 法律边界仍然不干净

#### 适用场景

- 做自己的 Claude Code 定制版
- 基于原骨架替换 provider、auth、policy、branding
- 继续演进 feature 选择和产品体验

### 3. `claude-ace`

#### 优点

- 思路鲜明，目标清晰
- 在 token 节省、骨架读取、验证闭环方面有明显差异化
- 更轻量，技术负担更小

#### 不足

- 已经不再保留 Claude Code 原主循环
- 不具备 Claude Code 风格的 MCP / skills / plugins / tasks 主结构
- 如果以后想追回原版 Claude Code 的生态与能力，会比在 `free-code-main` 上收敛更费力

#### 适用场景

- 作为“新产品”灵感来源
- 借鉴工具设计和上下文压缩策略
- 不适合作为 Claude Code 风格分支的基础仓库

## 为什么推荐 `free-code-main` 作为定制基线

### 核心理由

`free-code-main` 处在一个很合适的位置：

1. 它没有脱离 Claude Code 原骨架
2. 它已经把外部用户最痛的几层先拆开了
3. 它比 `claude-code-rebuilt` 更适合继续做工程演进

### 一句话理解

- `claude-code-rebuilt` 是“原版结构参考样本”
- `free-code-main` 是“最适合继续改造成我们自己版本的基线”
- `claude-ace` 是“值得借鉴方法论，但不适合作为 Claude Code 分支基线的另一路产品”

## 最值得从 `claude-ace` 借鉴的部分

虽然不推荐用 `claude-ace` 做基线，但以下方向值得后续引入到 `free-code-main`：

1. Skeleton / ExpandSymbol 的按需展开策略
2. IntentVerify 的验证闭环
3. CallGraph 的影响面分析
4. CriticalArchitect 这类高层架构评审工具

建议方式：

- 借“能力与工具设计”
- 不借“整体主循环与产品骨架”

## 风险提醒

### 最大风险不是技术，是合规

这三个版本都不适合直接被视为“可放心商业化分发”的干净上游。即使后续技术上选择 `free-code-main`，也建议把当前仓库定位为：

- 内部研究
- 原型验证
- 架构参考

如果后续目标是正式商业化，最好把这里的结论沉淀为 clean-room 重实现输入，而不是直接把当前代码作为最终分发基底。
