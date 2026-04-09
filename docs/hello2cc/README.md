# hello2cc 文档索引

更新时间：2026-04-09

这个目录集中 hello2cc 原理与使用文档。v2 重构后，hello2cc 从多策略注册系统简化为**单通用策略 + 意图推导 + 文件编辑保护**架构。

## 文档列表

| 文档 | 适用场景 |
|------|----------|
| [capability-orchestration.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/hello2cc/capability-orchestration.md) | 理解 hello2cc 原理与能力面编排机制 |
| [gateway-status-and-resume.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/hello2cc/gateway-status-and-resume.md) | 日常使用：`/status`、`/resume`、`/hello2cc` 诊断视图 |

## v2 架构概要

```
用户 prompt
    ↓
多阶段意图推导 (25+ signals)
    ├── seed 层：action/topic/collaboration/structure slots
    ├── artifact 层：review/research 判定
    ├── workflow 层：implement/release/continuation
    └── planning 层：plan/decisionHeavy
    ↓
通用策略 buildUniversalGuidance()
    ├── role: direct_executor | planner | researcher | reviewer | ...
    ├── specialization: implement | review | verify | plan | ...
    ├── decision_backbone: 3-6 条决策规则
    ├── execution_playbook: orderedSteps / primaryTools / avoidShortcuts
    ├── recovery_playbook: guards (trigger → recipe)
    ├── output_contract: openingStyle / sectionOrder
    └── tie_breakers: 路径选择优先级
    ↓
system context 注入 (markdown / JSON snapshot)
```

### 文件编辑失败保护

- 记录 Edit/Write 失败，按 `filePath + errorType` 去重
- 通用失败 ≥ 3 次或权限失败 ≥ 2 次 → 自动 block 并给 recovery 建议
- guidance 中注入历史失败信息："上次在 xxx 失败，建议 zzz"

### 配置

hello2cc 配置已简化，仅需在 settings.json 中指定：

```json
{
  "hello2cc": {
    "enabled": true,
    "strategyProfile": "balanced"
  }
}
```

- `enabled`：总开关，默认 true
- `strategyProfile`：`balanced`（默认，advisory 级别引导）| `strict`（更强的 fail-closed 保护）
