# 对比分析：gclm-code vs Claude Code 官方 vs Codex CLI

## 1. Claude Code 官方 — 权限模式设计

### 官方文档定义的模式（6 种）

| 模式 | 行为 | 语义清晰度 |
|------|------|-----------|
| `default` | 只读免审批，其他都问 | 清晰 |
| `acceptEdits` | 读 + 文件编辑 + 常见 fs 命令免审批 | 清晰 |
| `plan` | 只读，不编辑 | 清晰 |
| `auto` | 全部执行，后台分类器审查 | 清晰 |
| `dontAsk` | 只允许显式预批准的 tools，其他全 deny | 清晰 |
| `bypassPermissions` | 跳过所有检查（protected paths 除外） | 清晰 |

### 关键设计特征

1. **模式是用户界面概念，不是内部决策逻辑**。官方文档把模式定位为"convenience vs oversight"的 tradeoff selector，每种模式的语义一句话能说清。

2. **Protected Paths 是全局免疫层**。`.git`、`.claude`、`.bashrc` 等路径在任何模式下都不会自动批准写入。这是唯一横跨所有模式的例外。

3. **规则层与模式层分离**："Modes set the baseline. Layer permission rules on top to pre-approve or block specific tools in any mode except bypassPermissions."

4. **auto mode 的 classifier 是独立服务**。运行在单独的 `gpt-5.4` 模型上，90s timeout，fail-closed。不是嵌入主流程的函数。

5. **exec policy 前缀批准机制**。`prefix_rule(["git"], decision="allow")` 允许整个前缀的命令免审批，类似我们的 `git ` 前缀规则但更结构化。

## 2. Codex CLI — 权限设计

### 核心架构：两层分离

Codex 的设计与我们截然不同，它把权限分为两层：

**层 1：Sandbox Policy（沙箱策略）** — 决定能访问什么资源
```
SandboxPolicy:
  - DangerFullAccess      → 无沙箱，完全访问
  - ReadOnly              → 只读沙箱
  - WorkspaceWrite        → 工作区可写沙箱（有 writable_roots）
  - ExternalSandbox       → 外部沙箱
```

**层 2：AskForApproval（审批策略）** — 决定什么时候问用户
```
AskForApproval:
  - UnlessTrusted    → 总是问（除非是已知安全命令）
  - OnFailure        → 沙箱内自动，失败时问（已标记 DEPRECATED）
  - OnRequest        → 模型自己决定何时问（默认）
  - Granular(...)    → 细粒度开关（sandbox_approval, rules, skill_approval, ...）
  - Never            → 从不问
```

**层 3：Guardian（AI 审查）** — 类似我们的 auto mode classifier
- 独立模型（`gpt-5.4`）评估每个请求
- 输出结构化 JSON：`{ risk_level, user_authorization, outcome: Allow|Deny, rationale }`
- 90s 超时，fail-closed
- 支持 `GuardianSubagent` reviewer 模式

### 关键设计差异

| 维度 | gclm-code | Claude Code | Codex CLI |
|------|-----------|-------------|-----------|
| 模式数量 | 7 种（内部） | 6 种（用户可见） | 3 sandbox × 5 approval = 15 组合 |
| 审批策略 | 嵌入主 pipeline if-else | 文档层面描述 | `AskForApproval` 枚举 + trait |
| 沙箱策略 | 工具内部实现 | 全局概念 | 一级公民 `SandboxPolicy` |
| AI 审查 | 嵌入 `hasPermissionsToUseTool` | 独立 classifier 服务 | 独立 `Guardian` 子系统 |
| 规则匹配 | 字符串解析（`Bash(git *)`） | 字符串匹配 | `exec_policy` prefix_rule |
| 决策类型 | 3 种 + passthrough | allow/deny/ask | `ReviewDecision` 枚举 |
| 工具审批接口 | `checkPermissions(input, ctx)` | 同左 | `Approvable<Req>` trait |

## 3. 他们的设计优势

### Claude Code 官方

1. **模式语义正交**：每个模式的职责单一。`acceptEdits` 只管文件编辑免审批，不涉及 shell 命令分类器。
2. **规则与模式分层**：模式设 baseline，规则在上面叠加。bypassPermissions 完全跳过规则层。
3. **Protected Paths 统一处理**：不在每个工具/模式里重复判断，而是统一的全局层。

### Codex CLI

1. **Sandbox 和 Approval 正交**：sandbox policy 管"能碰什么"，approval policy 管"什么时候问"。组合灵活且可理解。
2. **Trait 抽象**：`Approvable<Req>` trait 让每个 tool 实现 `approval_keys()` 和 `start_approval_async()`。框架层统一处理缓存、决策、重试。
3. **Guardian 子系统**：AI 审查是独立的 review session，有自己的 transcript 构建、prompt 组装、输出解析。不污染主决策流。
4. **ExecPolicy prefix_rule**：结构化的前缀批准（`["git", "status"]`），不是字符串拼接。
5. **ApprovalStore 缓存**：序列化 key → `ReviewDecision` 的 map，支持 per-key 和 session-wide 缓存。

## 4. 我们的设计问题（对比视角）

### 4.1 模式不是正交的

我们的 `auto` 模式不是一个"模式"，而是一个"模式 + AI 审查器 + deny tracking + acceptEdits fast-path"的组合体。Codex 的做法是：sandbox policy 和 approval policy 分开，Guardian 是独立的 reviewer。Claude 官方也是模式只管 baseline，classifier 是独立服务。

### 4.2 Pipeline 是 monolithic 函数

Codex 用 `Approvable<Req>` trait + `with_cached_approval` 高阶函数把审批逻辑分散到工具实现中。我们用 `hasPermissionsToUseToolInner` 一个 160 行函数处理所有工具的审批。

### 4.3 规则匹配不结构化

Codex 用 `exec_policy` 的 `prefix_rule(["git", "pull"], Allow)` 结构化表示。我们用 `"git "` 字符串前缀匹配。

### 4.4 危险权限检测散落在各处

我们：`dangerousPatterns.ts` + `permissionSetup.ts` 中的 5 个 `isDangerous*` 函数 + `bashPermissions.ts` 内联检查
Codex：`GuardianAssessment` 结构化输出（risk_level + user_authorization + outcome）
Claude 官方：进入 auto mode 时自动 strip 特定模式规则（`Bash(*)`, `Bash(python*)` 等）

## 5. 建议的架构方向

基于对 Claude Code 官方和 Codex CLI 的分析，建议的改进方向：

### Phase 1：统一决策接口（最小破坏性）
- 将 `hasPermissionsToUseToolInner` 拆分为可组合的 evaluator 链
- 每个 evaluator 返回 `DecisionResult { verdict: Allow|Deny|Pass, reason }`
- 链式执行：deny_evaluator → rule_evaluator → tool_evaluator → safety_evaluator → mode_evaluator

### Phase 2：模式语义收敛
- 把 auto mode 的 classifier 从主 pipeline 中抽离为独立的 `evaluate_action` 服务
- dontAsk 改名为更准确的语义（如 `restrictToAllowlist`）
- bypassPermissions 的行为与命名对齐（要么真绕过，要么改名）

### Phase 3：规则引擎结构化
- 引入类似 Codex 的 `exec_policy` prefix_rule 概念
- 统一危险模式注册表
- Protected Paths 提升为全局层，不嵌入工具检查

### Phase 4：工具审批 trait 化
- 参考 Codex 的 `Approvable<Req>` trait
- 工具实现 `approval_keys()` 和自定义审批逻辑
- 框架层统一处理缓存、重试、决策转换
