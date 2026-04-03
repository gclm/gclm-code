# Claude Code 变体分析文档

这组文档整理了当前仓库内 3 个 `Claude Code` 相关变体的分析结论，目标是帮助后续确定：

1. 哪个版本最接近“原版 Claude Code”的结构与行为
2. 哪个版本最适合作为我们自己的定制基线
3. 基于推荐基线，第一阶段应该如何裁剪与收敛

## 文档列表

### 1. 三版本差异矩阵

文件：`docs/claude-code-variants-matrix.md`

内容包括：

- `claude-code-rebuilt`
- `free-code-main`
- `claude-ace`

围绕以下 9 个维度进行比较：

- 定位
- 与原版架构距离
- 构建与运行时
- Provider / 模型接入
- 工具系统
- MCP / skills / plugins / tasks
- Feature flags
- 遥测 / 安全指令
- 法律 / 分发风险

### 2. `free-code-main` 定制基线裁剪建议

文件：`docs/free-code-main-customization-baseline.md`

内容包括：

- 为什么推荐 `free-code-main` 作为开发基线
- 第一阶段建议保留和不保留的边界
- Feature、Provider、Branding、Policy 等层面的裁剪建议
- 哪些地方适合借鉴 `claude-ace`

### 3. `free-code-main` 当前特性清单

文件：`docs/free-code-main-feature-inventory.md`

内容包括：

- `free-code-main` 当前保留了哪些 Claude Code 核心能力
- 命令系统、工具系统、MCP、skills、plugins、tasks 的现状
- Provider、认证、模型选择与模型来源的现状
- 遥测、自动升级、品牌残留的现状
- 与我们当前 4 条改造目标的匹配度判断

### 4. 遥测取舍清单

文件：`docs/telemetry-keep-delete-checklist.md`

内容包括：

- 哪些能力 `必须保留`
- 哪些能力 `可选保留`
- 哪些内容 `必须删除`
- 只保留对后续自研版本真正有价值的工程能力
- 帮助快速拍板，不再被旧 telemetry 讨论干扰

### 5. 第二批清理清单

文件：`docs/telemetry-second-batch-checklist.md`

内容包括：

- 第一批之后还残留哪些高确定性尾巴
- 哪些模块适合 `直接删除`
- 哪些模块应该 `改名迁移`
- 哪些主干能力需要 `保留但迁移语义`
- 第二批建议按什么顺序拆提交

## 当前建议结论

### 原版结构参考

如果目标是研究“原版 Claude Code 的骨架与组织方式”，优先看：

- `references/claude-code-rebuilt`

### 推荐定制基线

如果目标是做“我们自己的 Claude Code 定制版”，推荐以：

- `references/free-code-main`

作为主开发基线。

### 不建议作为 Claude Code 定制基线

如果目标仍然是保留 Claude Code 主架构，则不建议直接以：

- `references/claude-ace`

作为基线，因为它已经更接近一款重新设计过的新产品，而不是 Claude Code 的同谱系分支。
