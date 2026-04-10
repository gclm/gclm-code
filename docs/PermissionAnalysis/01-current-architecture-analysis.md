# Permission System Architecture Analysis

## 1. 系统全貌

Permission 系统是整个代码库最复杂的子系统之一，核心目标是：**控制 AI Agent 能够执行哪些操作，何时需要人类审批**。

### 核心文件地图

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/types/permissions.ts` | ~440 | 类型定义（Mode、Behavior、Rule、Decision） |
| `src/Tool.ts` | ~793 | Tool 接口 + `checkPermissions` 合约 + `buildTool` 工厂 |
| `src/utils/permissions/permissions.ts` | ~1487 | 主决策 pipeline `hasPermissionsToUseTool` |
| `src/utils/permissions/permissionSetup.ts` | ~1533 | 初始化、模式转换、危险权限检测、auto mode gate |
| `src/utils/permissions/permissionsLoader.ts` | - | 从磁盘加载规则（user/project/local settings） |
| `src/utils/permissions/PermissionUpdate.ts` | - | 规则应用与持久化 |
| `src/tools/BashTool/bashPermissions.ts` | ~2600 | Bash 专用权限检查（tree-sitter AST 解析） |
| `src/tools/PowerShellTool/powershellPermissions.ts` | ~1650 | PowerShell 专用权限检查 |
| `src/utils/permissions/filesystem.ts` | - | 文件读写权限检查（8 步 / 5 步 pipeline） |
| `src/utils/permissions/dangerousPatterns.ts` | ~80 | 危险模式列表 |
| `src/utils/permissions/classifierDecision.ts` | ~100 | auto mode 安全工具白名单 |
| `src/utils/permissions/yoloClassifier.ts` | - | AI 分类器（auto mode 核心） |

---

## 2. 权限模式（Permission Modes）

系统有 **7 种模式**，但语义边界高度重叠：

| 模式 | 语义 | 关键行为 |
|------|------|----------|
| `default` | 默认 | 遵循规则，必要时询问用户 |
| `plan` | 规划模式 | 不执行工具，只做规划 |
| `acceptEdits` | 接受编辑 | 工作目录内的文件写入免审批 |
| `bypassPermissions` | 跳过权限检查 | 跳过大部分检查（但有"免疫"例外） |
| `dontAsk` | 不问 | 把"ask"变为"deny"（拒绝而非询问） |
| `auto` | 自动模式 | 用 AI 分类器代替用户审批 |
| `bubble` | 向上冒泡 | 将权限决策委托给父上下文/远程环境 |

### 模式交叉问题（核心痛点）

```
hasPermissionsToUseToolInner 的执行流：

Step 1: 规则检查（deny → ask → tool.checkPermissions → safetyCheck）
Step 2a: bypassPermissions 模式 → 直接 allow
Step 2b: 整工具 allow 规则 → allow
Step 3:  passthrough → ask 转换

hasPermissionsToUseTool 外层：
  ├─ allow → 重置拒绝计数
  ├─ ask + dontAsk 模式 → 转为 deny
  ├─ ask + auto 模式 → AI 分类器
  │   ├─ safetyCheck 且 !classifierApprovable → 强制 deny
  │   ├─ requiresUserInteraction → 保持 ask
  │   ├─ acceptEdits fast-path（重新调用 checkPermissions(mode=acceptEdits)）
  │   ├─ allowlist check → 直接 allow
  │   ├─ 运行 yolo classifier → allow / deny
  │   └─ denial limit exceeded → 降级为 ask
  └─ ask + shouldAvoidPermissionPrompts → hook 决策 → 无决策则 deny
```

**问题清单：**

1. **bypassPermissions 的"假绕过"**：2a 步骤说 bypass，但 1g（safetyCheck）和 1e（requiresUserInteraction）已经在之前返回了——bypass 只能跳过规则检查。命名误导。
2. **auto 模式嵌入主流程**：`hasPermissionsToUseTool` 的 520-927 行是 auto mode 逻辑，占据了函数的 56%，但它是一个"模式特性"而非核心路径。
3. **dontAsk 的语义奇怪**：它把 ask 转为 deny，而不是允许。这不是"不问"，是"不问就拒绝"。与 bypassPermissions 完全相反的行为逻辑。
4. **acceptEdits fast-path 嵌套在 auto 里**：auto 模式内部重新调用 `tool.checkPermissions(mode=acceptEdits)` 来判断是否可以跳过分类器。这是两个模式的交叉耦合。
5. **plan + auto 交叉**：`shouldPlanUseAutoMode()` 让 plan 模式在特定条件下使用 auto 语义，导致 `(mode === 'plan' && isAutoModeActive())` 这样的复合判断遍布代码。

---

## 3. 决策类型体系

```
PermissionResult =
  | PermissionDecision            ← 标准决策
  | { behavior: 'passthrough' }   ← "我不知道，交给上层判断"

PermissionDecision =
  | PermissionAllowDecision       ← behavior: 'allow'
  | PermissionAskDecision         ← behavior: 'ask'
  | PermissionDenyDecision        ← behavior: 'deny'
```

### 问题

1. **`passthrough` 是一个半状态**：不是真正的决策，只是"我没意见"。它在 pipeline 的 step 3 被转换为 `ask`。但它存在于 `PermissionResult`（tool.checkPermissions 的返回类型）中，意味着每个 tool 实现都要知道这个特殊值的存在。

2. **PermissionDecisionReason 是枚举式的联合类型**：
   ```
   'rule' | 'mode' | 'subcommandResults' | 'permissionPromptTool' |
   'hook' | 'asyncAgent' | 'sandboxOverride' | 'classifier' |
   'workingDir' | 'safetyCheck' | 'other'
   ```
   每个变体的结构不同，消费方（如 `createPermissionRequestMessage`）必须 switch 全部变体。添加新原因需要改所有消费方。

3. **`PermissionAskDecision` 独有字段最多**：message、suggestions、blockedPath、metadata、pendingClassifierCheck、isBashSecurityCheckForMisparsing、contentBlocks —— 这 7 个字段中大部分只在特定路径下使用。

---

## 4. 规则引擎

### 规则结构
```typescript
PermissionRule = {
  source: 'userSettings' | 'projectSettings' | 'localSettings' | 'flagSettings' |
          'policySettings' | 'cliArg' | 'command' | 'session'
  ruleBehavior: 'allow' | 'deny' | 'ask'
  ruleValue: { toolName: string, ruleContent?: string }
}
```

### 匹配模式
规则内容 (`ruleContent`) 支持三种语法：
- **精确匹配**: `"git status"` — 完全匹配
- **前缀匹配**: `"git "`（尾部空格）— 匹配所有以 "git " 开头的命令
- **通配符**: `"python:*"` — glob 风格匹配

### 优先级链

Pipeline 的隐式优先级（由 early-return 顺序决定）：
```
1. deny rules        (最高)
2. ask rules
3. tool.checkPermissions
4. safety checks
5. bypass check
6. allow rules
7. default → ask     (最低)
```

**这个优先级不是显式定义的，而是由代码执行顺序隐式决定的。**

### 问题

1. **规则优先级隐式而非显式**：没有类似 `score > threshold` 的评估函数，而是靠 if-else 顺序。添加新规则类型时必须精确知道该插在哪个位置。

2. **Bash 子命令规则与顶层规则的关系不透明**：`Bash(git status)` 和 `Bash`（工具级）规则的交互由 `bashPermissions.ts` 内部实现，不在主 pipeline 中。

3. **`PermissionRuleSource` 和 `PermissionUpdateDestination` 不完全对齐**：source 有 8 种，destination 只有 5 种（少了 flagSettings、policySettings、command）。这意味着某些来源的规则不能被更新。

---

## 5. 工具专用权限检查模式

### 5.1 BashTool — Sequential Early-Return (~2600 行)

```
bashToolHasPermission():
  1. sandbox auto-allow
  2. deny rules check
  3. exact match rules
  4. prefix/wildcard rules
  5. compound command splitting
  6. security checks (cd+git, bare repo, output redirection)
  7. bash allow classifier
  8. suggestion generation
```

**模式**: sequential early-return，遇到 deny 立即返回，遇到 ask 继续检查是否有 deny 在后面。

**问题**: ask-before-deny 风险 —— 如果前一个子命令需要 ask，但后一个子命令应该 deny，用户会先被问到 ask 的那个，然后才发现应该 deny。

### 5.2 PowerShell — Collect-then-Reduce (~1650 行)

```
powershellToolHasPermission():
  1. 分割所有子命令
  2. 对每个子命令收集结果
  3. 全部收集完后 reduce：deny > ask > allow
```

**模式**: collect-then-reduce，先评估所有子命令，最后统一裁决。

**优势**: 没有 ask-before-deny 问题 —— 如果任何子命令应该 deny，整体结果就是 deny，不会先问用户。

### 5.3 Filesystem — 编号 Pipeline

- `checkReadPermissionForTool`: 8 步 pipeline
- `checkWritePermissionForTool`: 5 步 pipeline

**模式**: numbered steps with early return.

**问题**: 读和写的 pipeline 长度不同，步骤不对应，维护时需要分别理解。

### 三种模式对比

| | Bash | PowerShell | Filesystem |
|---|---|---|---|
| 模式 | sequential early-return | collect-then-reduce | numbered steps |
| ask-before-deny | 有风险 | 免疫 | 有风险 |
| 复杂度 | 2600 行 | 1650 行 | 中等 |
| 可测试性 | 差（分支多） | 中（可单测子命令） | 中 |
| 可扩展性 | 差（加 check 要插对位置） | 好（只需加子评估函数） | 中 |

---

## 6. Auto Mode 分类器

```
auto mode 决策树（在 hasPermissionsToUseTool 内）:

ask → safetyCheck 免疫? → deny (不可分类)
    → requiresUserInteraction? → 保持 ask
    → acceptEdits fast-path? → allow (跳过分类器)
    → tool in allowlist? → allow (跳过分类器)
    → 运行 yolo classifier →
        ├─ shouldBlock → deny
        │   ├─ transcript too long? → 降级为 manual ask
        │   ├─ classifier unavailable → fail closed/open
        │   └─ denial limit exceeded → 降级为 ask
        └─ not blocked → allow
```

### 问题

1. **分类器逻辑嵌在 400+ 行的函数体内**（permissions.ts:520-927）。这 400 行包含了 analytics、denial tracking、error handling、fast-paths、fallbacks 全部混在一起。

2. **acceptEdits fast-path 重新调用 checkPermissions**：这是一个 hack —— 用 mode='acceptEdits' 重新检查来判断当前操作是否"安全到可以跳过分类器"。但这创建了递归式的依赖。

3. **denial tracking 嵌入在分类器决策流中**：计数器更新、limit 检查、fallback 逻辑都在同一个函数里。

---

## 7. permissionSetup.ts — 模式转换与初始化

这个文件承载了过多职责：

| 职责 | 函数 |
|------|------|
| 危险权限检测 | `isDangerousBashPermission`, `isDangerousPowerShellPermission`, `isDangerousTaskPermission` |
| 宽泛规则检测 | `isOverlyBroadBashAllowRule`, `isOverlyBroadPowerShellAllowRule` |
| 危险权限剥离/恢复 | `stripDangerousPermissionsForAutoMode`, `restoreDangerousPermissions` |
| 模式转换 | `transitionPermissionMode` |
| CLI 模式解析 | `initialPermissionModeFromCLI` |
| 工具解析 | `parseBaseToolsFromCLI`, `parseToolListFromCLI` |
| 上下文初始化 | `initializeToolPermissionContext` |
| Auto mode gate | `verifyAutoModeGateAccess`, `isAutoModeGateEnabled`, ... |
| Bypass killswitch | `shouldDisableBypassPermissions`, `checkAndDisableBypassPermissions` |
| Plan mode auto | `shouldPlanUseAutoMode`, `prepareContextForPlanMode`, `transitionPlanAutoMode` |

**1533 行，至少 10 个不同职责。**

---

## 8. 设计模式总结

### 现有模式及其利弊

| 模式 | 使用场景 | 利 | 弊 |
|------|----------|-----|-----|
| **Sequential Early-Return** | Bash, filesystem, 主 pipeline | 简单直观、短路高效 | 顺序敏感、ask-before-deny、难以测试所有路径 |
| **Collect-then-Reduce** | PowerShell | 正确的优先级裁决、可测试 | 需要评估所有子命令（稍慢） |
| **Feature Flag Gating** | auto mode, terminal, overflow | 可按需启用/禁用 | `require()` 动态导入导致类型不安全、代码分支膨胀 |
| **Transform Function** | `verifyAutoModeGateAccess` 返回 `(ctx) => ctx` | 避免 async 竞态覆盖用户操作 | 概念抽象度高、调试困难 |
| **Rule String Parsing** | `permissionRuleValueFromString` / `toString` | 持久化为字符串 | 解析逻辑与匹配逻辑分散 |
| **Mode-as-Context** | `ToolPermissionContext.mode` 控制整体行为 | 一个字段控制全局 | 模式间语义重叠、复合判断复杂 |

---

## 9. 核心问题清单

### P0 — 架构级

1. **Pipeline 不是可组合的评估器**：`hasPermissionsToUseToolInner` 是 160 行单一函数，每一步都是 if-else early-return。无法单独测试步骤、无法插入新步骤、无法重排序。

2. **bypass / auto / dontAsk 交叉耦合**：三个模式在同一个函数体内通过嵌套 if 判断交互，导致分支爆炸。`hasPermissionsToUseTool` 有 30+ 个 return 语句。

3. **permissionSetup.ts 职责爆炸**：1533 行、10+ 个职责，包括初始化、模式转换、危险检测、gate 检查、工具解析。

### P1 — 设计级

4. **Collect-then-Reduce 未统一**：只有 PowerShell 用这个更好的模式，Bash 和 filesystem 仍然用 sequential early-return。

5. **危险模式列表分散**：`dangerousPatterns.ts`、`classifierDecision.ts`、`permissionSetup.ts`、`bashPermissions.ts` 内联检查都有危险模式定义。

6. **PermissionResult vs PermissionDecision 边界模糊**：`passthrough` 作为第三种行为存在于 Result 但不在 Decision 中，调用方需要知道这个区别。

### P2 — 维护级

7. **规则优先级不透明**：没有显式的优先级定义，全靠代码执行顺序。

8. **lenient vs strict settings 解析**：`permissionsLoader.ts` 有两套解析路径，可能导致读/写不一致。

9. **类型重复**：`ToolPermissionContext` 在 `src/types/permissions.ts` 和 `src/Tool.ts` 中各有一份定义（后者用 `DeepImmutable` 包装）。
