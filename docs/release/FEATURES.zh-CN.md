# 功能启用开关总表

更新日期：2026-04-10

## 构建体系概览

所有功能开关均为 **编译期开关**，通过 `feature('FLAG')`（来自 `bun:bundle`）在构建时注入。
未启用的 flag 会被 Bun 的 Tree Shaking 做 Dead Code Elimination（DCE），对应代码不会出现在产物中。

### 构建命令与默认行为

| 构建命令 | 默认启用 | 额外启用 |
|---------|---------|---------|
| `bun run build` | `VOICE_MODE`, `TRANSCRIPT_CLASSIFIER` | 无 |
| `bun run build:dev` | `VOICE_MODE`, `TRANSCRIPT_CLASSIFIER` | 无（仅版本号格式不同） |
| `bun run build:dev:full` | 默认 | 全部 57 个实验功能 |
| `--feature=XXX` | 默认 | 单个指定功能 |
| `--feature-set=dev-full` | 默认 | 全部实验功能 |

### 默认构建开关

| 参数名 | 功能描述 |
|-------|---------|
| `VOICE_MODE` | `/voice`、按键说话、语音提示与听写能力。运行时仍依赖 OAuth + 本地录音后端（原生模块或 SoX 回退） |
| `TRANSCRIPT_CLASSIFIER` | 使标准构建暴露 `--permission-mode auto` 与 `auto-mode` 检查命令。权限自动分类器 |

## 完整功能开关表

格式：`参数名` | `功能描述` | `能否启用` | `影响范围` | `效果`

### 交互与 UI 类

| 参数名 | 功能描述 | 能否启用 | 影响范围 | 效果 |
|-------|---------|---------|---------|------|
| `AWAY_SUMMARY` | 离开键盘后的摘要行为 | 实验性 | REPL UI | 用户暂离后生成对话摘要 |
| `HISTORY_PICKER` | 交互式历史选择器 | 实验性 | REPL UI | 可通过选择器浏览和恢复历史会话 |
| `HOOK_PROMPTS` | 在 hook 流程中传递 prompt 文本 | 实验性 | Hook 系统 | hook 脚本可获取请求原文 |
| `KAIROS_BRIEF` | 精简 transcript 布局 + BriefTool | 实验性 | REPL UI / 工具 | 仅展示简报级别的能力，非完整 assistant 栈 |
| `KAIROS_CHANNELS` | 频道通知与回调链路 | 实验性 | API / REPL | 启用 MCP/channel 消息的频道通知 |
| `LODESTONE` | 深链/协议注册相关流程 | 实验性 | CLI 入口 / 设置 | 支持 deep link 协议注册与相关设置 |
| `MESSAGE_ACTIONS` | 消息操作入口 | 实验性 | REPL UI / 快捷键 | 消息上出现操作按钮（如复制/重试等） |
| `NEW_INIT` | 新版 `/init` 路径 | 实验性 | 命令系统 | 启用较新的项目初始化决策路径 |
| `QUICK_SEARCH` | 提示词快速搜索 | 实验性 | REPL UI / 快捷键 | 启用 prompt 快速搜索功能 |
| `SHOT_STATS` | shot 分布统计视图 | 实验性 | Stats UI | 额外的 shot 分布统计展示 |
| `TOKEN_BUDGET` | Token 预算跟踪与告警 | 实验性 | Query / UI | Token 预算跟踪、提示触发器、Token 告警 UI |
| `ULTRAPLAN` | `/ultraplan` 与退出计划流 | 实验性 | 命令系统 | 启用 `/ultraplan` 命令及退出计划相关功能 |
| `ULTRATHINK` | 额外深度思考模式 | 实验性 | Query / 思考 | 启用额外的 thinking-depth 模式切换 |

### Agent / 记忆 / 规划类

| 参数名 | 功能描述 | 能否启用 | 影响范围 | 效果 |
|-------|---------|---------|---------|------|
| `AGENT_MEMORY_SNAPSHOT` | 自定义 Agent 记忆快照 | 实验性 | AppState / Agent | 存储 extra custom-agent memory snapshot 状态 |
| `AGENT_TRIGGERS` | 本地 cron/触发器工具 | 实验性 | 工具 / 命令 / 技能 | 启用 ScheduleCronTool（创建/删除/列表）及相关技能 |
| `AGENT_TRIGGERS_REMOTE` | 远程触发器工具 | 实验性 | 工具 | 启用 RemoteTriggerTool |
| `BUILTIN_EXPLORE_PLAN_AGENTS` | 内置 explore/plan agent 预设 | 实验性 | Agent 系统 | 启用内置的探索/规划 agent 预设 |
| `CACHED_MICROCOMPACT` | 缓存的 microcompact 状态 | 实验性 | Query / API / 压缩 | 在查询和 API 流中保留缓存的 microcompact 状态 |
| `COMPACTION_REMINDERS` | 压缩提醒文案 | 实验性 | 压缩 / prompt | 在压缩和附件流程中启用提醒文案 |
| `EXTRACT_MEMORIES` | 查询后记忆提取 | 实验性 | Query stop hooks | 查询完成后触发记忆提取钩子 |
| `PROMPT_CACHE_BREAK_DETECTION` | 缓存失效检测 | 实验性 | 压缩 / Query / API | 检测 prompt 缓存是否失效并在日志中标记 |
| `TEAMMEM` | Team Memory 文件与监控 | 实验性 | 服务 / UI / 提取 | 启用 team memory 文件、watcher 钩子及相关 UI 提示 |
| `VERIFICATION_AGENT` | 验证 Agent 指引 | 实验性 | Prompt / Todo 工具 | 在 prompt 和 task/todo 工具中增加验证 Agent 指引文案 |

### 工具 / 权限 / 远程类

| 参数名 | 功能描述 | 能否启用 | 影响范围 | 效果 |
|-------|---------|---------|---------|------|
| `BASH_CLASSIFIER` | 分类器辅助的 Bash 权限判定 | 实验性 | Bash 工具 / 权限 | 使用 ML 分类器辅助决定 bash 命令的权限等级 |
| `BRIDGE_MODE` | 远程控制 / REPL 桥接 | 实验性 | CLI 入口 / 命令 / 桥接 | 启用 `remote-control` 等远程接入命令（需 OAuth + GrowthBook 授权） |
| `CCR_AUTO_CONNECT` | CCR 自动连接默认路径 | 实验性 | CCR 连接 | 启用 CCR 的自动连接行为 |
| `CCR_MIRROR` | 出站-only CCR 镜像会话 | 实验性 | CCR 连接 | 启用仅出站方向的 CCR 镜像 |
| `CCR_REMOTE_SETUP` | 远程 setup 命令路径 | 实验性 | 命令 (`web`) | 启用远程 setup 命令 (`/web`) |
| `CHICAGO_MCP` | Computer Use MCP 集成 | 实验性 | MCP / CLI 入口 | 启用 computer-use MCP 服务和 wrapper 加载。运行时需 `@ant/computer-use-*` 包 |
| `CONNECTOR_TEXT` | 连接器文本块处理 | 实验性 | API / 日志 / UI | 启用 connector-text block 在 API 响应、日志和 UI 中的渲染 |
| `MCP_RICH_OUTPUT` | 更丰富的 MCP UI 渲染 | 实验性 | MCP UI | MCP 工具输出使用更丰富的 UI 渲染 |
| `NATIVE_CLIPBOARD_IMAGE` | macOS 剪贴板图片快速路径 | 实验性 | 粘贴 / 图片 | 在存在 `image-processor-napi` 时加速 macOS 剪贴板图片读取 |
| `POWERSHELL_AUTO_MODE` | PowerShell 专属 auto-mode 权限处理 | 实验性 | 权限系统 | 为 PowerShell 提供专用的 auto-mode 权限行为 |
| `TREE_SITTER_BASH` | Tree-sitter Bash 解析器后端 | 实验性 | Bash 分析 | 启用 tree-sitter 对 bash 脚本的语法解析 |
| `TREE_SITTER_BASH_SHADOW` | Tree-sitter Bash 影子部署 | 实验性 | Bash 分析 | 启用 tree-sitter bash 的 shadow rollout 路径（并行运行但不影响主流程） |
| `UNATTENDED_RETRY` | 无人值守重试行为 | 实验性 | API 重试 | 在非交互环境下启用 API 重试逻辑 |

### 底层支撑 / 运维类

| 参数名 | 功能描述 | 能否启用 | 影响范围 | 效果 |
|-------|---------|---------|---------|------|
| `ABLATION_BASELINE` | CLI 消融/基线入口 | 内部 | CLI 入口 | 设置多个环境变量（SIMPLE, DISABLE_THINKING, DISABLE_COMPACT 等），用于 L0 消融实验 |
| `ALLOW_TEST_VERSIONS` | 允许测试版本 | 内部 | 原生安装 | 原生安装流程中允许使用测试版本号 |
| `ANTI_DISTILLATION_CC` | 反蒸馏请求元数据 | 内部 | 系统 prompt | 在系统头中添加反蒸馏请求元数据 |
| `BREAK_CACHE_COMMAND` | break-cache 命令路径 | 内部 | 命令系统 | 注入 break-cache 命令 |
| `COWORKER_TYPE_TELEMETRY` | coworker 类型遥测字段 | 内部 | 遥测 | 在遥测数据中添加 coworker-type 字段 |
| `DOWNLOAD_USER_SETTINGS` | 用户设置同步拉取路径 | 内部 | 设置同步 | 启用远端设置同步的拉取（pull）路径 |
| `DUMP_SYSTEM_PROMPT` | 系统 prompt 导出路径 | 内部 | CLI 入口 | 启用 `--dump-system-prompt` 参数，输出渲染后的系统 prompt |
| `FILE_PERSISTENCE` | 文件持久化链路 | 内部 | Query / 打印 | 启用文件持久化相关逻辑 |
| `HARD_FAIL` | 更严格的失败/日志行为 | 内部 | 错误处理 | 启用更严格的失败和日志记录行为 |
| `IS_LIBC_GLIBC` | 强制检测 glibc 环境 | 内部 | 平台检测 | 强制将环境标记为 glibc |
| `IS_LIBC_MUSL` | 强制检测 musl 环境 | 内部 | 平台检测 | 强制将环境标记为 musl |
| `NATIVE_CLIENT_ATTESTATION` | 原生客户端认证标记 | 内部 | 系统 prompt | 在系统头中添加原生认证标记文本 |
| `PERFETTO_TRACING` | Perfetto 性能追踪钩子 | 内部 | 性能分析 | 启用 perfetto tracing 钩子 |
| `SKILL_IMPROVEMENT` | 技能改进钩子 | 内部 | 技能系统 | 启用技能改进相关钩子 |
| `SKIP_DETECTION_WHEN_AUTOUPDATES_DISABLED` | 禁用自动更新时跳过检测 | 内部 | 更新检测 | 当自动更新关闭时跳过更新器检测 |
| `SLOW_OPERATION_LOGGING` | 慢操作日志 | 内部 | 日志系统 | 启用慢操作日志记录 |
| `UPLOAD_USER_SETTINGS` | 用户设置同步推送路径 | 内部 | 设置同步 | 启用远端设置同步的推送（push）路径 |

### 当前不可用的开关（缺少依赖文件）

以下 flag 在源码中被引用，但对应依赖文件在当前仓库中不存在，启用后构建会失败：

| 参数名 | 功能描述 | 缺失文件 |
|-------|---------|---------|
| `AUTO_THEME` | 自动主题切换 | `src/utils/systemThemeWatcher.js` |
| `BG_SESSIONS` | 后台会话管理 | `src/cli/bg.js` |
| `BUDDY` | Buddy 功能 | `src/commands/buddy/index.js` |
| `BUILDING_CLAUDE_APPS` | 构建 Claude Apps 相关 | `src/claude-api/csharp/claude-api.md` |
| `COMMIT_ATTRIBUTION` | 提交归属钩子 | `src/utils/attributionHooks.js` |
| `FORK_SUBAGENT` | 子 Agent 分叉 | `src/commands/fork/index.js` |
| `HISTORY_SNIP` | 历史片段裁剪 | `src/commands/force-snip.js` |
| `KAIROS_GITHUB_WEBHOOKS` | GitHub PR 订阅通知 | `src/tools/SubscribePRTool/SubscribePRTool.js` |
| `KAIROS_PUSH_NOTIFICATION` | 推送通知工具 | `src/tools/PushNotificationTool/PushNotificationTool.js` |
| `MCP_SKILLS` | MCP 技能注册 | `src/skills/mcpSkills.js` |
| `MEMORY_SHAPE_TELEMETRY` | 记忆形状遥测 | `src/memdir/memoryShapeTelemetry.js` |
| `OVERFLOW_TEST_TOOL` | 溢出测试工具 | `src/tools/OverflowTestTool/OverflowTestTool.js` |
| `RUN_SKILL_GENERATOR` | 技能生成器入口 | `src/runSkillGenerator.js` |
| `TEMPLATES` | 模板系统 | `src/cli/handlers/templateJobs.js` |
| `TORCH` | Torch 命令 | `src/commands/torch.js` |
| `BYOC_ENVIRONMENT_RUNNER` | BYOC 环境运行器 | `src/environment-runner/main.js` |
| `CONTEXT_COLLAPSE` | 上下文折叠工具 | `src/tools/CtxInspectTool/CtxInspectTool.js` |
| `COORDINATOR_MODE` | 协调器模式 | `src/coordinator/workerAgent.js` |
| `DAEMON` | 守护进程 | `src/daemon/workerRegistry.js` |
| `DIRECT_CONNECT` | 直接连接 | `src/server/parseConnectUrl.js` |
| `EXPERIMENTAL_SKILL_SEARCH` | 实验性技能搜索 | `src/services/skillSearch/localSearch.js` |
| `MONITOR_TOOL` | 监控工具 | `src/tools/MonitorTool/MonitorTool.js` |
| `REACTIVE_COMPACT` | 响应式压缩 | `src/services/compact/reactiveCompact.js` |
| `REVIEW_ARTIFACT` | 审查工件 | `src/hunter.js` |
| `SELF_HOSTED_RUNNER` | 自托管运行器 | `src/self-hosted-runner/main.js` |
| `SSH_REMOTE` | SSH 远程连接 | `src/ssh/createSSHSession.js` |
| `TERMINAL_PANEL` | 终端面板 | `src/tools/TerminalCaptureTool/TerminalCaptureTool.js` |
| `UDS_INBOX` | UDS 消息 | `src/utils/udsMessaging.js` |
| `WEB_BROWSER_TOOL` | Web 浏览器工具 | `src/tools/WebBrowserTool/WebBrowserTool.js` |
| `WORKFLOW_SCRIPTS` | 工作流脚本 | `src/commands/workflows/index.js` |
| `KAIROS` | 完整 assistant 栈 | `src/assistant/index.js` + 大部分 assistant 栈 |
| `KAIROS_DREAM` | Dream 任务行为 | `src/dream.js` |
| `PROACTIVE` | 主动任务/工具栈 | `src/proactive/index.js` |

## 运行时前提（重点提示）

以下功能虽可编译，但存在运行时前提，实际效果受环境约束：

| 参数名 | 运行时前提 |
|-------|-----------|
| `VOICE_MODE` | 需要 `claude.ai` OAuth + 本地录音后端（原生模块或 SoX 回退） |
| `NATIVE_CLIPBOARD_IMAGE` | 安装 `image-processor-napi` 时效果最佳 |
| `BRIDGE_MODE` / `CCR_AUTO_CONNECT` / `CCR_MIRROR` / `CCR_REMOTE_SETUP` | 受 OAuth 与 GrowthBook entitlement 约束 |
| `KAIROS_BRIEF` / `KAIROS_CHANNELS` | 仅恢复到保留下来的简版能力，不是完整旧栈 |
| `CHICAGO_MCP` | 当前外部运行态仍会触发 `@ant/computer-use-*` 缺包 |
| `TEAMMEM` | 需环境中真实启用 team memory 才有实际效果 |

## 建议

- 对外发布与验收继续以 `bun run verify`（即 `bun run build`）为唯一门槛
- 新增或恢复实验开关时，应先验证"是否可编译 + 是否可运行"，避免只通过编译就进入默认构建
