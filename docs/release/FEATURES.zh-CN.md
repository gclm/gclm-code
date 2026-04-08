# 功能开关审计（中文对照）

审计日期：2026-03-31
对应英文原文：`docs/release/FEATURES.en.md`

本仓库当前共引用 88 个 `feature('FLAG')` 编译期开关。按当前外部构建参数逐个校验后结果如下：

- 55 个开关可正常打包
- 33 个开关仍无法打包

说明：
- “可打包”不等于“运行时一定可用”。
- 部分功能仍依赖可选原生模块、`claude.ai` OAuth、GrowthBook 配置或外部 `@ant/*` 包。

## 构建变体（Build Variants）

- `bun run build`
  构建常规外部二进制到 `./dist/gc`。
- `bun run compile`
  构建常规外部二进制到 `./gc`。
- `bun run build:dev`
  构建 `./dist/gc-dev`（开发版本号 + 实验 GrowthBook key）。
- `bun run build:dev:full`
  构建 `./dist/gc-dev`，启用当前“可工作的实验功能集合”（不含 `CHICAGO_MCP`，该项虽可编译但当前外部运行时会触发缺失包）。

## 默认构建开关

- `VOICE_MODE`
  已纳入默认构建流程（不再仅限 dev）。
  提供 `/voice`、按键说话、语音提示和听写能力。
  运行时仍依赖 `claude.ai` OAuth 以及本地录音后端（原生模块或 SoX 回退路径）。
- `TRANSCRIPT_CLASSIFIER`
  已纳入默认构建流程，因此标准构建会直接暴露 `--permission-mode auto`
  与 `auto-mode` 检查命令。外部构建使用仓库内补齐的
  `yolo-classifier-prompts/*.txt` 资产。

## 可工作的实验功能（中文分组）

以下是当前可编译通过、且对行为或界面有影响的实验项。

### 1. 交互与界面类

- `AWAY_SUMMARY`：离开键盘后的摘要行为
- `HISTORY_PICKER`：交互式历史提示选择器
- `HOOK_PROMPTS`：在 hook 流程中传递 prompt/request 文本
- `KAIROS_BRIEF`：精简 transcript 布局与 BriefTool 相关 UX
- `KAIROS_CHANNELS`：频道通知与 channel 回调链路
- `LODESTONE`：深链/协议注册相关流程
- `MESSAGE_ACTIONS`：消息操作入口
- `NEW_INIT`：新版 `/init` 路径
- `QUICK_SEARCH`：提示词快速搜索
- `SHOT_STATS`：shot 分布统计视图
- `TOKEN_BUDGET`：Token 预算跟踪与告警
- `ULTRAPLAN`：`/ultraplan` 与退出计划流
- `ULTRATHINK`：额外深度思考模式
- `VOICE_MODE`：语音开关、快捷键、语音提示与 UI

### 2. Agent / 记忆 / 规划类

- `AGENT_MEMORY_SNAPSHOT`
- `AGENT_TRIGGERS`
- `AGENT_TRIGGERS_REMOTE`
- `BUILTIN_EXPLORE_PLAN_AGENTS`
- `CACHED_MICROCOMPACT`
- `COMPACTION_REMINDERS`
- `EXTRACT_MEMORIES`
- `PROMPT_CACHE_BREAK_DETECTION`
- `TEAMMEM`
- `VERIFICATION_AGENT`

### 3. 工具 / 权限 / 远程类

- `BASH_CLASSIFIER`
- `BRIDGE_MODE`
- `CCR_AUTO_CONNECT`
- `CCR_MIRROR`
- `CCR_REMOTE_SETUP`
- `CHICAGO_MCP`
- `CONNECTOR_TEXT`
- `MCP_RICH_OUTPUT`
- `NATIVE_CLIPBOARD_IMAGE`
- `POWERSHELL_AUTO_MODE`
- `TREE_SITTER_BASH`
- `TREE_SITTER_BASH_SHADOW`
- `UNATTENDED_RETRY`

## 仅“可编译”但偏底层支撑的开关

这些项能编译，但更偏 rollout、平台、遥测或基础设施，不是面向用户的主功能开关：

- `ABLATION_BASELINE`
- `ALLOW_TEST_VERSIONS`
- `ANTI_DISTILLATION_CC`
- `BREAK_CACHE_COMMAND`
- `COWORKER_TYPE_TELEMETRY`
- `DOWNLOAD_USER_SETTINGS`
- `DUMP_SYSTEM_PROMPT`
- `FILE_PERSISTENCE`
- `HARD_FAIL`
- `IS_LIBC_GLIBC`
- `IS_LIBC_MUSL`
- `NATIVE_CLIENT_ATTESTATION`
- `PERFETTO_TRACING`
- `SKILL_IMPROVEMENT`
- `SKIP_DETECTION_WHEN_AUTOUPDATES_DISABLED`
- `SLOW_OPERATION_LOGGING`
- `UPLOAD_USER_SETTINGS`

## 可编译但存在运行时前提（重点提示）

- `VOICE_MODE`：需要 `claude.ai` OAuth + 本地录音后端
- `NATIVE_CLIPBOARD_IMAGE`：在安装 `image-processor-napi` 时效果最佳
- `BRIDGE_MODE` / `CCR_*`：受 OAuth 与 GrowthBook entitlement 约束
- `KAIROS_*`：只恢复到保留下来的简版能力，不是完整旧栈
- `CHICAGO_MCP`：当前外部运行态仍会触发 `@ant/computer-use-*` 缺包
- `TEAMMEM`：需环境中真实启用 team memory 才有实际效果

## 当前建议

- 对外发布与验收建议继续以 `bun run verify`（即 `bun run build`）为唯一门槛。
- 新增或恢复实验开关时，应先验证“是否可编译 + 是否可运行”，避免只通过编译就进入默认构建。
