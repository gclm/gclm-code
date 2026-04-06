# 项目状态

更新时间：2026-04-06（Gateway post-login cleanup 与 smoke 补强已收口）

## 当前阶段

- Active phase：`release scope-refresh 已收口，进入 ship / release-check`
- 当前 focus：
  - 维持 `single-package + vendor runtime` 作为默认发布主链
  - 保持发布态运行时边界为 `bin/ + vendor/`
  - 继续让 GitHub Release 产出双架构 mac runtime 资产
  - 功能侧维持持续维护，不新增 release 之外的大改造
  - 补齐 Gateway `login/logout/model` 真实流程文档，降低后续回归与排查成本

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
  - `tests/utils/env.test.ts` 的 Docker 断言前已显式清掉 deployment/CI 环境变量，避免 GitHub Actions 上被 `github-actions` 分支提前命中
  - 根因已确认包括：GitHub Actions `macos-15-intel` runner 上 CLI 冷启动较慢导致集成测试子进程返回 `143`，以及 `Bun.which` 在测试动态改写 `PATH` 时未稳定反映新环境
  - 最新本地验证（2026-04-06）：`bun run test` 全绿，`221 pass / 0 fail`

## 已知未完成项

- Linux / Windows runtime 资产仍未纳入本轮 npm 发布范围
- 通过真实公网 npm 发布后的“fresh install 闭环”仍要等下一次正式单包版本发版时再补最终证据
- `runtimeConfig/growthbook.ts` 仍沿用 `GrowthBook` 命名，后续可再判断是否继续去历史语义
- 文档中的功能开关计数与源码现状存在轻微偏差，需后续同步
- 当前全量 typecheck 在仓库基线上仍有大量既有错误，无法作为本轮唯一阻断标准
- 本轮 CI 报错已确认为测试稳定性与环境探测实现问题，不属于新的 release 架构阻断

## 执行边界

- 当前 must-fix：
  - 无新的 release 结构 must-fix；主线已收口
  - 本轮 CI flaky 已完成修复并通过本地全量测试验证
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
- 当前目标发版版本：`1.0.1`（已发布）
- 最新正式 npm 发布版本：`1.0.1`
  - 说明：该版本已切换到 single-package + vendor runtime 主链
  - `latest / stable` 均已指向 `1.0.1`
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
  - 全仓补扫后，当前未发现第二套独立 logo 图形实现；`Onboarding`、`setup-token`、主消息页均已落到 `WelcomeV2` / `LogoV2` / `CondensedLogo` -> `Clawd` 共享链路
  - 仍可见的其余品牌入口主要是文案或小图标，例如 `IdeOnboardingDialog` 的欢迎文案与 `GuestPassesUpsell` 的 `[✻]` 装饰，不属于独立 logo 样式分叉
  - 已继续补扫欢迎态 / 弹窗头部：`IdeOnboardingDialog` 标题前缀 `✻` 已统一改为 `startupAccent`，与欢迎页品牌 accent 一致
  - `ResumeTask`、`HelpV2`、权限弹窗等其余页面当前未发现旧 logo 图形入口；剩余差异主要是功能文案或业务色彩，不属于 logo 样式问题
- 备注：真实公网 npm 发布后的最终消费者闭环仍需在下一次正式单包版本发布时补齐
