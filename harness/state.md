# 项目状态

更新时间：2026-04-06（v1.0.3 已发布，并补充安装/升级、远程方案与 hello2cc 原理/集成/生命周期/诊断文档）

## 当前阶段

- Active phase：`release scope-refresh 已收口，进入 ship / release-check`
- 当前 focus：
  - 维持 `single-package + vendor runtime` 作为默认发布主链
  - 保持发布态运行时边界为 `bin/ + vendor/`
  - 继续让 GitHub Release 产出双架构 mac runtime 资产
  - 功能侧维持持续维护，不新增 release 之外的大改造
  - 补齐 Gateway `login/logout/model` 真实流程文档，降低后续回归与排查成本
  - 补充 hello2cc 原理与 Gateway 编排映射文档，沉淀后续能力集成设计依据
  - 补充 hello2cc Gateway 落地实施方案，明确模块边界、生命周期接线与分阶段实施顺序
  - 补充 hello2cc Gateway 生命周期时序图，作为编排增强层实现的接线依据
  - 补充 hello2cc Gateway 诊断与恢复文档，支撑后续排查与 `/resume` 行为确认
  - 给 `/status` 增加 hello2cc 编排摘要，并补 transcript 写入到 resume 恢复的回归测试

## 当前判断

- 这是一次 release 方向的 `scope-refresh` 收口，不是新的产品规划。
- 功能侧 `M1-M4` 已完成，当前重点从“发布方案选择”切到“单包主链落地后的放行与维护”。
- 当前默认发布模型已经冻结为：
  - npm 渠道只发布一个 `gclm-code`
  - GitHub Release 继续提供 `darwin-x64` / `darwin-arm64` runtime 资产与 `sha256`
  - 发布态运行时只认 `bin/ + vendor/`
  - `vendor/manifest.json` 是运行时单一事实源
  - `dist/` 仅保留为构建期 staging
  - `packages/*` 继续作为内部 workspace，不做 `references/cli` 式全仓库重排
- 当前单包方案采用“轻资产发布期物化 + 重型 runtime 安装期落盘”的混合模型：
  - `vendor/modules/` 收敛 workspace 运行时产物
  - `vendor/runtime/` 收敛平台 runtime 与 sidecar
  - 安装期通过 `postinstall` + GitHub Release 资产完成当前平台 runtime 落盘

## 已完成

- Logo V2 默认欢迎文案已从 `How are you` 调整为 `Are You Ok?`
- `scripts/build.ts` 已优化为统一产物命名：默认输出 `gc`、dev 输出 `gc-dev`，并联动更新 smoke / install / release 引用
- 发布 runtime 资产结构已调整为 `bin/gc` + `bin/claude -> gc` 软链，并通过 tar 包对外分发
- 已完成 `R1 - 单包发布骨架与 vendor manifest`：
  - 新增 `scripts/prepare-single-package-npm.mjs`
  - 新增 `scripts/lib/single-package-npm.mjs`
  - 新增发布态 `bin/gc.js`
  - 新增 `scripts/smoke-single-package-npm.mjs`
- 已完成 `R2 - 平台 runtime 落盘到 vendor/runtime/`：
  - 新增 `scripts/install-runtime.mjs`
  - 单包 staging 已接入 `postinstall -> node ./bin/install-runtime.js`
  - 已支持从 `runtime.baseUrl` / `GCLM_BINARY_BASE_URL` 下载 release 资产并校验 `sha256`
  - 当前本地回归已优先收敛到更强的 `smoke-single-package-npm-install` 与 `smoke:single-package`
- 已完成 `R3 - workspace 运行时物化到 vendor/modules/`：
  - 新增 `scripts/lib/vendor-runtime-modules.mjs`
  - 已将 8 个 runtime workspace 包物化到 `vendor/modules/node_modules/`
  - 已让单包 staging `package.json` 自动注入最小 runtime 依赖清单，并将 modules 边界回写到 `vendor/manifest.json`
  - vendor 物化步骤已内聚到 `scripts/prepare-single-package-npm.mjs`，不再暴露独立 `prepare:vendor-runtime` 顶层入口
  - 已新增 `scripts/smoke-single-package-vendor-modules.mjs`
- 已完成 `R4 - 单包 smoke / CI / release 切换`：
  - 新增单包 `pack / publish / tarball install / registry install` 脚本
  - `Release NPM` 已切到 `package-single-npm -> smoke-tarball(matrix) -> smoke-registry(matrix) -> publish-release-assets -> publish-npm` 主链
  - `CI Verify` 已补齐 single-package staging 与 macOS install/vendor smoke
- 已完成 `R5 - 默认发布切换与旧三包清理`：
  - 已删除旧三包脚本：`prepare-mac-binary-npm.mjs`、`pack-mac-binary-npm.mjs`、`publish-binary-npm-tarballs.mjs`、`smoke-mac-binary-npm*.mjs`
  - 已删除旧 helper：`scripts/lib/mac-binary-npm.mjs`
  - `scripts/lib/release-platforms.mjs` 已收敛为单包发布平台目录，不再维护三包发布顺序与子包名映射
  - `package.json` 已移除旧三包脚本入口，并新增中性的 `prepare:release-assets`
  - README / docs / roadmap / harness 已统一切到单包口径
  - `docs/release/mac-binary-first-npm-plan.md` 已删除，旧三包只保留在 history 中
  - `smoke-single-package-npm-install` 已提升为真实 `npm install <tarball>` 验证
  - `smoke-single-package-npm-registry` 已提升为 Verdaccio + npmjs upstream 的真实 registry 安装验证
- 已完成 release hardening 收口：
  - `publish-npm` 已显式依赖 `publish-release-assets`，消除 npm 包先于 GitHub Release runtime 资产发布的窗口期
  - `smoke-single-package-npm-install` 已切到临时 `.npmrc + --userconfig + 显式 env`，隔离宿主用户级 npm 配置
  - `smoke-single-package-npm-registry` 已为 Verdaccio bootstrap 增加独立 upstream registry 配置与更宽松的启动等待窗口

## 进行中

- 功能侧处于持续维护模式
- 发布侧当前进入 `ship / release-check`：等待下一次正式发版时验证单包主链的公网发布闭环
- 已完成一轮 CI 稳定性修复：
  - `tests/integration/cliTestUtils.ts` 将 CLI 子进程超时从 `15s` 提高到 `30s`
  - `tests/integration/cli-isolated-state.test.ts` 与 `tests/integration/cli-print-mode.test.ts` 的测试级超时统一提高到 `30s`
  - `src/utils/which.ts` 已改为按当前 `PATH` 进程内查找可执行文件，不再依赖 `Bun.which`
  - 第二轮收敛已完成：CLI 集成测试优先复用 `dist/cli.js`，仅 `--version/-v/-V` 保留源码快路径；测试环境默认开启 `CLAUDE_CODE_SIMPLE=1` 并关闭 background/auto-memory/nonessential traffic/auto-updater，以减少 CI 启动噪音
  - 第三轮收敛已完成：`scripts/smoke-test.mjs` 为 CLI smoke 子命令统一注入 `CLAUDE_CODE_SIMPLE=1` 与相关降噪环境变量，并为全部 smoke 子进程增加 `20s` 硬超时，避免 GitHub Actions 干净环境下 `auth status` 触发钥匙串/认证读取阻塞后把整条 job 挂到 workflow 级 `15m` 超时
  - workflow 维护已完成：`.github/workflows/ci-verify.yml` 与 `.github/workflows/release-npm.yml` 中的 `actions/checkout`、`actions/setup-node` 已从 `v4` 升级到 `v6`，对齐 GitHub Node 24 action runtime
  - `tests/utils/env.test.ts` 的 Docker 断言前已显式清掉 deployment/CI 环境变量，避免 GitHub Actions 上被 `github-actions` 分支提前命中
  - 根因已确认包括：GitHub Actions `macos-15-intel` runner 上 CLI 冷启动较慢导致集成测试子进程返回 `143`，以及 `Bun.which` 在测试动态改写 `PATH` 时未稳定反映新环境
  - 新根因已确认：GitHub Actions `CI Verify` run `24026280508` 中原始单测阶段已通过，但 `Run smoke test` 在 `./dist/gclm auth status --text` 的干净 CI 环境里进入阻塞，最终触发 job `15m` 上限取消
  - 最新验证（2026-04-06）：`bun run test` 全绿，`221 pass / 0 fail`；`bun run smoke` 与干净 `HOME + CI=1 + GITHUB_ACTIONS=1` 环境下的 `bun run smoke` 也均通过；GitHub Actions `CI Verify` run `24028484566` 已在 `1m52s` 内全绿

## 已知未完成项

- Linux / Windows runtime 资产仍未纳入本轮 npm 发布范围
- 通过真实公网 npm 发布后的“fresh install 闭环”仍要等下一次正式单包版本发版时再补最终证据
- `runtimeConfig/growthbook.ts` 仍沿用 `GrowthBook` 命名，后续可再判断是否继续去历史语义
- 文档中的功能开关计数与源码现状存在轻微偏差，需后续同步
- 当前全量 typecheck 在仓库基线上仍有大量既有错误，无法作为本轮唯一阻断标准
- 本轮 CI 报错已确认为测试稳定性与环境探测实现问题，不属于新的 release 架构阻断
- 当前待补最终证据：`Release NPM` 在升级 workflow actions 后的下一次正式发版线上回执

## 执行边界

- 当前 must-fix：
  - 无新的 release 结构 must-fix；主线已收口
  - 本轮 CI flaky、smoke 阻塞与 workflow action 版本落后已完成修复，`CI Verify` 已线上通过
- same-batch can-include：
  - 下一次正式单包发版前的 release-check 与 dry-run 演练
- follow-up：
  - 公网 npm 发布后的最终消费者闭环验证
  - Linux / Windows runtime 扩展

## 当前发布迁移执行顺序

1. `R1`：单包发布骨架 + `vendor/manifest.json`（已完成）
2. `R2`：平台 runtime 落盘到 `vendor/runtime/`（已完成）
3. `R3`：workspace 运行时物化到 `vendor/modules/`（已完成）
4. `R4`：单包 smoke / CI / release 切换（已完成）
5. `R5`：默认发布切换与旧三包清理（已完成）

## OAuth 策略结论

- 当前不建议因 provider 协议适配做 OAuth 重设计
- 客户端维持已有 token 链路，网关负责上游认证与路由编排
- 触发 OAuth 重设计的条件：
  - 同一会话需要并发多 provider token 编排
  - 现有 token lifecycle 无法覆盖新 provider 的刷新 / 吊销语义
  - 现有 auth status 无法表达 provider 维度状态

## 环境与验收

- 运行环境：Bun 1.3.11 项目
- 当前统一验收门槛：`bun run verify`
- 当前策略已调整为“不保留兼容层，直接修复断点”
- 当前目标发版版本：`1.0.3`（已发布）
- 最新正式 npm 发布版本：`1.0.3`
  - 说明：`latest / stable` 已指向 `1.0.3`
- 当前最强本地证据级别：`scripted-flow`
- 最新单包验证结果（2026-04-05）：
  - `bun run verify`，通过
  - `bun run build`，通过
  - `bun run smoke:single-package`，通过
  - `bun run smoke:single-package -- --with-registry`，通过
  - `node ./scripts/smoke-single-package-npm-registry.mjs`，通过
  - 已新增文档 `docs/overview/nonessential-traffic-flag.md`，按代码路径盘点 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 当前影响面，明确它仍会影响 auto-update、trusted device enrollment、后台预取、错误上报与部分能力发现，不是“只关 telemetry”的无效开关
- 已完成 logo 样式入口排查：`WelcomeV2` 不再维护独立字符画，已改为复用共享 `Clawd`
- 已完成 Gateway auth/model 流程收口：
  - Gateway 登录配置明确保存到 `~/.claude/settings.json`
  - `/logout` 已改为精确清理 Gateway env，不再受 settings deep merge 残留影响
  - `/model` 在 Gateway 场景下会先刷新 `/models` 列表再提供选择
  - 手动 `/model` 刷新已明确绕过 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
  - `/login` 成功后的后置逻辑已抽到共享 helper；Gateway / 自定义 base URL 场景现在只保留本地 cache reset，不再触发 Anthropic 官方账号专属的 remote managed settings / policy limits / GrowthBook / trusted-device 流程
  - `/logout` 成功文案与 CLI help 已切换为中性 “login and gateway configuration” 表述
  - 已新增文档 `docs/release/gateway-auth-model-flow.md`
  - 已新增 `smoke:login-gateway` / `smoke:login-gateway:matrix`，使用临时 `CLAUDE_CONFIG_DIR` 覆盖“登录保存 -> 交互式模型刷新 -> 退出清理”链路，不污染真实 `~/.claude`
  - 上述 Gateway smoke 默认改为 mock `axios` `/models` 请求，不依赖真实 Gateway、环境变量或本地监听端口；仅在显式传入 `SMOKE_GATEWAY_BASE_URL` / `SMOKE_GATEWAY_API_KEY` 时切到真实网关
  - 最新本地验证（2026-04-06）：`bun run smoke:login-gateway` 与 `bun run smoke:login-gateway:matrix` 在零环境变量下均已通过
  - `.github/workflows/ci-verify.yml` 已接入 `bun run smoke:login-gateway` 与 `bun run smoke:login-gateway:matrix`，默认用 mock 路径覆盖 Gateway 登录保存、模型刷新与退出清理链路
  - `.github/workflows/release-npm.yml` 已同步接入 Gateway smoke，并将 `build-and-test` runner 统一到 `macos-15-intel`
  - `release-npm` 的 `publish-npm` job 已改为下载并发布 `build-and-test` 上传的 `dist` artifact，不再在发布 job 中重新构建一份未复验产物
  - 已新增文档 `docs/overview/install-and-upgrade.md`，明确区分 npm 全局安装版与仓库本地构建版的安装、升级与判断方式
  - 已新增远程方案文档：
    - `docs/gclm-code-server/remote-capabilities.md`
    - `docs/gclm-code-server/architecture.md`
    - `docs/gclm-code-server/module-design.md`
    - `docs/gclm-code-server/api-dto-design.md`
    - `docs/gclm-code-server/feishu-remote-architecture.md`
    - `docs/gclm-code-server/self-hosted-web-plan.md`
  - 远程方案判断已继续收敛：若目标包含 Web、飞书及后续钉钉等多渠道，建议引入第一方 `gclm-code-server` 作为统一会话与渠道中台，但第一阶段保持薄实现，仅承接统一 session、stream、permission 与 channel adapter contract
  - `gclm-code-server` 模块与技术栈建议已补充：当前推荐 `Bun + TypeScript + Hono + zod + Bun WebSocket + SQLite`，目录先落在 `src/gclm-code-server/`，按 app/config/identity/sessions/transport/permissions/channels/web/audit 等九个一级模块推进；当前明确不采用 Rust 作为第一阶段主技术栈
  - `gclm-code-server` API / DTO 设计已补充：第一阶段接口收敛为 Session / Input / Stream / Permission / Channel 五组 contract，Web 与飞书统一复用同一套 session、permission 与 stream 语义
  - 远程方案文档已进一步收口到 `gclm-code-server + SQLite`：一期正式引入本地 `SQLite` 作为控制面状态存储，覆盖 session metadata、channel binding、pending permission、webhook 幂等与轻量审计；同时明确 `web/` 属于第一方 Presentation，不再与 `channels/*` 混层
  - `gclm-code-server` API / DTO 边界已继续修正：`CreateSessionResponse` 不再直接返回 Web 专属 `wsUrl`，改为单独 `GET /sessions/:id/stream-info`；飞书 / 钉钉原始 webhook payload 与控制面内部标准 DTO 已明确分层
  - 已新增 `docs/gclm-code-server/sqlite-schema-design.md`：收敛 `gclm-code-server` 一期 `SQLite` 控制面存储模型，明确 `sessions`、`session_bindings`、`permission_requests`、`webhook_idempotency`、`audit_events` 与 `schema_migrations` 的表结构、索引、状态流转和 migration 策略
  - 已新增 `docs/gclm-code-server/README.md`，并将 `gclm-code-server` 相关文档从 `docs/overview/` 归档到独立目录，统一做专题索引与管理
  - 已继续修正文档设计问题：统一 `webhook idempotency key` 生成规则、明确 `channel_identities` 为身份事实源并让 `session_bindings` 仅承接上下文绑定、补充 `stream token` 一期采用短 TTL 签名令牌的策略、统一技术栈口径为 `Bun + TypeScript + Hono + zod + Bun WebSocket + SQLite`，并修正架构分层口径
  - 已新增文档 `docs/overview/hello2cc-capability-orchestration.md`，说明 hello2cc 如何通过会话能力快照、路由提示、工具前纠偏与 session state 记忆，让第三方模型更稳定地感知并使用宿主已暴露能力，并给出映射到当前 Gateway 编排层的集成视角
  - 已新增文档 `docs/overview/hello2cc-gateway-integration-plan.md`，给出将 hello2cc 能力内建到当前 Gateway 的推荐方案，包括模块拆分、生命周期接线、两阶段实施计划、风险与验收建议
  - 已新增文档 `docs/overview/hello2cc-gateway-lifecycle-sequence.md`，通过时序图拆解 `SessionStart -> UserPromptSubmit -> PreToolUse -> PostToolUse/PostToolUseFailure` 的闭环，明确 Gateway 编排增强层在单次会话中的主链流转
  - 已新增文档 `docs/overview/hello2cc-gateway-diagnostics.md`，面向开发者说明当前 hello2cc 编排层的 debug 入口、关键信号、`hello2cc-state` transcript 持久化，以及 `/resume` 后如何判断 session memory 是否真正恢复
  - 已新增 `src/orchestration/hello2cc/` Phase 1 编排增强层骨架，并已把 route guidance 接到 `src/query.ts` 主查询链路、把 input normalization 与 success/failure memory 接到 `src/services/tools/toolExecution.ts` 主执行链路：当前已覆盖 session capability snapshot、intent profile、route guidance、关键工具 input normalization，以及 PostToolUse/PostToolUseFailure 的 session memory
  - 已补 hello2cc 编排层 debug 可观测性：当前会记录 route guidance 构建、关键工具 normalization 命中、success/failure memory 写回等关键节点，便于后续排查 Gateway 编排层是否真正介入主链
  - 已补 hello2cc session memory 持久化与恢复：当前会把编排状态以 `hello2cc-state` metadata entry 追加写入 transcript，在 `/resume` / print resume 过程中通过通用恢复链路回填到内存态，使 route guidance、recent success/failure、active team/worktree 等信息可跨进程续接
  - 已把 hello2cc 编排摘要接入 `/status`：当前状态页会展示 surfaced capabilities、last intent、active team/worktree、recent successes/failures 与 failure counts，便于不翻 debug log 先判断编排层是否仍持有预期 session memory
  - 已继续收敛 `/status` 的 hello2cc 展示：当前在详细字段之前增加 `Orchestration health` 单行摘要，用于快速判断 intent、capability 数量、team/worktree、success/failure 与 retry 压力
  - 已补 `/resume` 的 hello2cc 恢复提示：恢复 transcript 中的 `hello2cc-state` 后，会追加一条 system info，直接提示已恢复的 team/worktree/intent 与 success/failure/capability 轮廓，适配长任务续跑场景
  - 已给 `/resume` 的 hello2cc 恢复提示补设置开关：当前支持 `hello2cc.resumeSummaryStyle = "detailed" | "compact"`，默认 `detailed`，便于长任务用户按噪音偏好切换
  - 已新增文档 `docs/overview/hello2cc-gateway-status-and-resume.md`，专门说明 `/status`、`/resume`、`hello2cc-state` 三者关系，以及 `resumeSummaryStyle` 配置与长任务场景下的推荐使用方式
  - 已补 hello2cc 文档互链与口径校正：`status-and-resume` 文档增加诊断入口，`diagnostics` 文档增加日常使用入口，并移除已经过时的“`/status` / `/resume` 尚未接入”表述
  - 已补 `docs/overview/hello2cc-gateway-integration-plan.md` 的“当前落地现状”小节，明确 Phase 1 已完成项、部分落地项与尚未落地项，避免方案文档与当前实现状态脱节
  - 已把 hello2cc `preconditions` 独立成正式模块并接到主执行链路：当前会对重复 worktree、无 active team 的广播消息、同输入重复失败等高置信度场景做 fail-closed 阻断
  - 已补“恢复后影响下一轮决策”的回归测试：当前不仅验证 `hello2cc-state` 能恢复，还验证恢复出的 memory 会继续影响后续 route guidance 与 precondition 判断
  - 已补最小版 `subagentGuidance`：当前 planning 请求会优先补 `Plan`，explore / review 请求会优先补 `Explore`，作为更完整 agent-specific guidance 的第一步
  - 已同步更新 hello2cc 方案文档与诊断文档，纳入 `preconditions`、恢复后行为验证与最小版 `subagentGuidance` 的现状说明
  - 已新增回归测试 `tests/orchestration/hello2cc.resume.test.ts`，覆盖两条主线：`/status` 的 hello2cc 摘要展示，以及真实 transcript 中写入 `hello2cc-state` 后经 `getLastSessionLog(...) -> restoreSessionStateFromLog(...)` 恢复回内存态的闭环
  - 已新增文档 `docs/overview/hello2cc-plugin-vs-deep-integration.md`，专门比较插件式、深度集成式与混合式方案，并明确当前项目继续以深度集成为主、策略层后续再收敛到可插拔
  - 已扩 hello2cc capability snapshot：当前除基础 tool 面外，还会记录 available subagent types、MCP connected / pending / needs-auth / failed 计数、tool search optimistic 信号、web search 可用性与请求计数
  - 已补 hello2cc 结构化观测层：当前会生成 host facts 与 routing posture，并接到 `/status`，方便直接判断宿主事实、会话锚点与 retry 压力
  - 已增强 `routeGuidance`：当前除 intent 与 tool 能力外，还会显式提示 MCP 待授权 / pending、tool search 不可置信、已暴露 subagent specializations 与 web search 使用痕迹
  - 已增强 `subagentGuidance`：当前会结合宿主已暴露的 subagent type 决定是否自动补 `Plan` / `Explore`，并在不自动改写时补只读 shaping notes，避免 investigation / planning 请求误走实现型 worker
  - 已抽 hello2cc 第一版 strategy registry：当前 `session start guidance`、`route recommendations`、`subagent guidance` 已可通过 registry 叠加自定义策略，默认仍以内建策略提供主行为
  - 已补保守版长任务 orchestrator policy：当前会在 active team / active worktree 已存在、或 retry pressure 升高时，显式引导复用现有执行面并优先诊断，不再只给基础 capability 提示
  - 已继续扩 hello2cc settings：当前新增 `strategyProfile`、`qualityGateMode`、`enableProviderPolicies`，用于控制 provider-aware policy 与长任务质量门控强度
  - 已补 provider/model-specific policy：当前策略层会根据 provider 与 model 提示是否需要更显式的 host scaffolding，并在非 first-party provider 下强调 lean / explicit 的 tool routing
  - 已继续升级 strategy registry：当前支持 `priority`、`when(context)`、`checkPreconditions(...)`，并将 provider、model、strategyProfile、qualityGateMode 一并注入策略上下文
  - 已继续扩 hello2cc 结构化观测：当前 `Host facts` 已显示 provider / strategy / qualityGate，`Routing posture` 已显示 active strategy IDs，route guidance debug log 也已输出结构化 provider / strategy 信息
  - 已新增开发文档 `docs/overview/hello2cc-strategy-development.md`，说明如何新增 strategy、如何使用 hello2cc 设置项，以及如何排查策略命中与优先级
  - 已继续细分 provider/model 策略：当前在 provider-aware 通用策略之外，已内建 GPT-family、Qwen-family、DeepSeek-family 的 route guidance 规则，用于不同模型族的编排提示收敛
  - 已继续升级 strategy registry 的选择能力：当前支持 `scope`，可按 `sessionIds`、`cwdPrefixes`、`providers`、`modelPatterns` 做 project / session / provider / model 级策略选择，不必每次都手写 `when(context)`
  - 已补 hello2cc declarative config 策略入口：当前支持在 `settings.json -> hello2cc.extraStrategies` 中声明额外 route strategy，并通过 scope 挂到特定 session / project / provider / model
  - 已补 `/status` 的 hello2cc `Debug snapshot`：当前可一次性看到 host facts、active strategies、memory pressure、recent success/failure 与 toolFailureCounts，更适合线上排查
  - 已补独立 `/hello2cc` 命令入口：当前无需进入 `/status` 也可直接拿到 hello2cc 结构化 debug snapshot，更适合长任务排障与 `/resume` 后的快速确认
  - 已把 hello2cc declarative strategy 扩成更强的 declarative policy：`settings.json -> hello2cc.extraStrategies` 现支持 `activation`、`sessionStartLines`、`subagentGuidance`、`preconditions`，并支持按 `strategyProfiles` / `qualityGateModes` 做 scope 选择
  - 已补当前项目的 hello2cc 推荐默认配置片段，并同步写入策略开发文档，便于直接落到项目 `settings.json`
  - 已补 hello2cc 约定式项目配置：当前会自动加载 `~/.claude/hello2cc/<project>.json` 与 `<repo>/.claude/hello2cc.json`，不必每次手改主 `settings.json`
  - 已新增 `/hello2cc-init` 命令：可为当前项目一键生成推荐 hello2cc 配置，并写到用户级、仓库级或两者同时写入的约定位置
  - 已完成 hello2cc 焦点回归验证：`bun test tests/orchestration/hello2cc.test.ts tests/orchestration/hello2cc.resume.test.ts` 当前为 `25 pass / 0 fail`
  - 全仓补扫后，当前未发现第二套独立 logo 图形实现；`Onboarding`、`setup-token`、主消息页均已落到 `WelcomeV2` / `LogoV2` / `CondensedLogo` -> `Clawd` 共享链路
  - 仍可见的其余品牌入口主要是文案或小图标，例如 `IdeOnboardingDialog` 的欢迎文案与 `GuestPassesUpsell` 的 `[✻]` 装饰，不属于独立 logo 样式分叉
  - 已继续补扫欢迎态 / 弹窗头部：`IdeOnboardingDialog` 标题前缀 `✻` 已统一改为 `startupAccent`，与欢迎页品牌 accent 一致
  - `ResumeTask`、`HelpV2`、权限弹窗等其余页面当前未发现旧 logo 图形入口；剩余差异主要是功能文案或业务色彩，不属于 logo 样式问题
- 备注：真实公网 npm 发布后的最终消费者闭环仍需在下一次正式单包版本发布时补齐
