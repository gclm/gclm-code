# 项目状态

更新时间：2026-04-05（M4 收尾完成）

## 当前阶段

- Active phase：`M4 - 收尾清理（已完成）`
- 当前 focus：
  - 落地网关优先方案：客户端统一走 `anthropic-compatible + ANTHROPIC_BASE_URL`
  - 协议切换与多 provider 聚合全部下沉网关
  - 模型发现优先读取网关 `/models`（含 `/v1/models` 回退）
  - 登录流重构：去除 Codex 登录选项，新增网关参数输入并自动保存

## 当前判断

- 这是一次 `scope-refresh`，不是全新规划。
- 发布链路已基本落地，当前不以 release 作为主阻塞项。
- 当前重点从“新增 provider 适配”转为“客户端收敛到网关参数化入口”。
- 客户端不继续扩展 provider 协议分支，统一依赖 `ANTHROPIC_BASE_URL/KEY` + 网关能力。
- 仓库开发态继续保留 `workspace:*` 结构，但对外交付主路径已切到 `mac binary-first`：
  - npm 渠道当前主形态为 `gclm-code` + `gclm-code-darwin-x64` + `gclm-code-darwin-arm64`
  - GitHub Release 同步产出双架构 mac 资产与 `sha256`
- 若后续重新投入 release 架构，长期优先探索 `binary-first`（原 Option B）作为产品分发主形态：
  - 当前进一步收敛为 `mac binary-first`：优先支持 `darwin-x64`、`darwin-arm64`
  - `linux-x64` 暂不纳入首批目标，除非后续产品侧重新确认有明显收益
  - 若需要单一 mac 下载入口，可评估产出一个对外“macOS 通用包”，内部仍以双架构构建为基础
  - 其余平台按实现复杂度决定是否补齐，不作为首批阻塞
  - 该方向的价值主要在后期扩展性与交付一致性，不在当前短期发布收益
- 若通过 npm 分发二进制，当前推荐形态不是继续发布源码 workspace 包，而是：
  - 根包 `gclm-code` 作为 npm 入口与命令包装层
  - 子包按架构拆分为 `gclm-code-darwin-x64` 与 `gclm-code-darwin-arm64`
  - 根包通过 `optionalDependencies + os/cpu + bin` 选择并转发到匹配架构二进制
  - 不优先推荐“单个 npm 包同时内置两份 mac 二进制”，原因是当前单个 `gc` 本地体积已约 171MB，合包后体积会显著上升
  - 当前已落地首批组装骨架：通过脚本生成三包目录，并在本地验证 `npm pack + launcher` 主链
- 不推荐直接复用 `references/cli` 作为 npm 发布方案蓝本：
  - 该参考项目保留 `workspace:*` 依赖且 `prepublishOnly` 阻止直发，更接近受控内部发布链路，而非面向 npm 消费者的安装模型
- “把 workspace 一起打进二进制”只能解决一部分模块解析问题，不能替代运行时能力分发：
  - 当前 external 包中仍包含依赖 `sharp`、`bun:ffi`、`osascript`、`swiftc`、`screencapture`、`rec/play` 等宿主能力的模块
  - 若转为二进制优先，还需同时解决多平台构建矩阵与 sidecar/runtime 依赖交付

## 已完成

- `scripts/build.ts` 已优化为统一产物命名：默认输出 `gc`、dev 输出 `gc-dev`，并联动更新 smoke/install/release 引用
- release 产物结构已调整为 `bin/gc`（默认可执行）+ `bin/claude -> gc` 软链，并通过 tar 包对外分发
- `release-npm` workflow 已切换为 `mac binary-first` 主链，并已升级为 fan-out / matrix 流水线：`meta -> preflight -> build-binary(matrix) -> package-mac-npm -> smoke-tarball(matrix) -> smoke-registry(matrix) -> publish-*`
- `scripts/lib/release-platforms.mjs` 已成为当前发布平台单一事实源：统一维护 `platform_matrix`、runner 映射、artifact 命名、子包名与发布顺序
- `Release NPM` 已新增 `run_registry_smoke` 手动开关：dry-run 场景下可单独补 Verdaccio 私有 registry 验证，而不必真的发布 npm 或上传 release 资产
- `Release NPM` 的线上 dry-run 已验证该开关生效：run `23998338010` 在不发布 npm / 不上传 release assets 的前提下，仍成功执行 `smoke-tarball(matrix)` 与 `smoke-registry(matrix)`，且 `publish-*` / `tag-stable` 均按预期跳过
- `v1.0.0` 已完成正式发布：首次 tag run `23998582683` 成功上传 GitHub Release 资产，随后通过补丁提交 `edf2304` 修复 `publish-npm` 缺少 checkout 的 workflow 问题，并通过 workflow_dispatch run `23998704055` 完成 npm 发布与 `stable` 打标收尾
- 已完成本机真实安装验证：保留原有 `Claude Code 2.1.76` 不卸载的前提下，全局安装 `gclm-code@1.0.0` 后 `gc` 命令已可用；`claude` 仍优先指向 `/Users/gclm/.local/bin/claude`，未覆盖现有本机安装
- 已完成本机卸载/重装复验：删除旧 `/Users/gclm/.local/bin/claude` 与 `/Users/gclm/.local/share/claude/versions/2.1.76` 程序文件、保留 `/Users/gclm/.claude` 后重新全局安装 `gclm-code@1.0.0`；当前 `claude --version` 与 `gc --version` 均输出 `1.0.0 (Gclm Code)`，且 npm 全局 bin 仅落地 `claude` / `gc` 两个入口，未提供 `gclm`
- 已完成隔离 fresh install 对照验证：在全新 `prefix + cache` 下，`npm install -g gclm-code@1.0.0 --registry=https://registry.npmjs.org` 可安装出 `gclm-code + gclm-code-darwin-x64` 两包并正常执行；同条件下切到 `https://registry.npmmirror.com` 仍只会安装根包，`gc --version` 会报“未找到匹配架构包”
- npm 包名已从 `@gclm/gclm-code` 调整为 `gclm-code`，并同步 CLI 默认 PACKAGE_URL、发布 workflow 与相关文档
- 已为 npm 发布增加 `files` 白名单（`gc`、`README.md`、`install.sh`、`packages`），`npm pack --dry-run` 已验证发布内容收敛为 42 个文件
- README 已重写为“参考 free-code 项目实践”表述，并同步网关优先策略、验收入口与发布门禁说明
- npm 包基础发布配置已落地：`gclm-code`
- 已补充 `.gitignore`：忽略根目录 npm tarball、本地 `release-assets-check/` 目录与 `packages/*/node_modules/`，减少发布调试时的工作区噪音
- CI 验收工作流已落地，并已升级为 fan-out 结构：`preflight + build + smoke-packages(matrix)`
- npm tag 发布工作流已落地
- 第二批 telemetry 清理已有明显进展：
  - `feedbackSurvey*` 相关残留已不在主代码中
  - `IssueFlagBanner` 相关残留已删除
  - 多个 inert analytics sink / telemetry 壳模块已删除
- `analytics -> runtimeConfig` 语义迁移已完成：
  - 已新增 `src/services/runtimeConfig/` 中性边界
  - 已删除 `src/services/analytics/config.ts`
  - 已删除 `src/services/analytics/growthbook.ts`
  - 已删除 `src/services/analytics/sinkKillswitch.ts`
  - 当前策略为“不保留兼容层，直接修复断点”
- provider 诊断命名清理已完成：
  - `ForStatsig` 历史 helper 已迁移为中性命名
  - 对应调用点已完成收口并通过验证
- 工具日志边界清理已完成：
  - `src/services/analytics/metadata.ts` 已迁移为 `src/services/toolLogging/metadata.ts`
  - `SafeLogValue` 已替代旧的超长历史类型名
  - `src/utils/telemetry/bigqueryExporter.ts` 已删除
- `analytics/index.ts` 类型边界已完成中性化：
  - `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` -> `SafeEventValue`
  - `AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED` -> `PiiEventValue`
- 登录流/网关配置本轮落地：
- 第二刀净化（codex 全量移除）已完成：
  - 已删除 `src/services/oauth/codex-client.ts`
  - 已删除 `src/services/api/codex-fetch-adapter.ts`
  - 已删除 `src/constants/codex-oauth.ts`
  - 已删除 `src/utils/codex-fetch-adapter.ts`
  - 已移除 `auth/config/model/providers/oauth` 中全部 codex/openai-codex 相关定义
  - `ConsoleOAuthFlow` 已移除 `OpenAI Codex account` 选项与登录分支
  - 旧“3rd-party platform”说明页改为可交互网关配置：依次输入 `ANTHROPIC_BASE_URL`、`ANTHROPIC_API_KEY`
  - 输入后自动保存到 `GlobalConfig.env`，并同步当前 `process.env`
  - 保存后清理显式 provider flag：`CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY/OPENAI`
  - 保存后立即触发 `refreshProviderModelOptions(true)`，执行 `/models` 自动发现
  - 同批清理关键路径 codex 引用：
    - `src/services/api/client.ts` 移除 codex fetch adapter 分支
    - `src/cli/handlers/auth.ts` 移除 codex token 存储分支
    - `src/hooks/useApiKeyVerification.ts` 移除 codex subscriber 判定依赖

## 进行中

- 当前进入持续维护模式：以 release gate 为发版前统一门禁

## 已知未完成项

- `docs` 历史文档中可能仍有 codex 文案残留（不影响运行时）；后续可按文档清理批次处理
- `runtimeConfig/growthbook.ts` 仍沿用 `GrowthBook` 命名，后续可再判断是否进一步去品牌化或去历史产品语义
- 文档中的功能开关计数与源码现状存在轻微偏差，需后续同步
- 当前全量 typecheck 在仓库基线上有大量既有错误，无法作为本轮单改动通过标准

## 执行边界

- 当前 must-fix：
  - 网关主链稳定性验证与 /models 回退路径覆盖
- same-batch can-include：
  - 文档与注释回写、后续阶段任务收敛
- follow-up：
  - provider 枚举进一步中性化（如 `firstParty`）
  - `runtimeConfig/growthbook.ts` 是否继续去品牌化
  - 第三方兼容 API 与 auth 策略层优化

## 新执行顺序（务实版）

1. `M1`：`/models` 动态模型发现 + 登录入口网关参数化
2. `M2`：网关优先接入（客户端不再扩展 openai/codex 协议适配）
3. `M3`：`anthropic-compatible` 补强
4. `M4`：收尾清理（含 codex 遗留能力全量摘除）

## OAuth 策略结论

- 当前不建议因 provider 协议适配做 OAuth 重设计
- 客户端维持已有 token 链路，网关负责上游认证与路由编排
- 触发 OAuth 重设计的条件：
  - 同一会话需要并发多 provider token 编排
  - 现有 token lifecycle 无法覆盖新 provider 的刷新/吊销语义
  - 现有 auth status 无法表达 provider 维度状态

## Phase 3 - Step 1 结论

- 已完成入口收敛，建议下一刀采用“最小可落地切口”：
  - 新增一个不依赖 `getSettings()` 的 first-party auth header helper（用于避免循环依赖）
  - 先在 `remoteManagedSettings` 与 `policyLimits` 两个重复度最高模块落地
  - `bootstrap` 暂可保持内联，作为第二批再迁移，降低回归面
- 该切口价值：
  - 直接减少认证 header 分叉逻辑
  - 不触碰 provider 选择主链（`getAPIProvider()`）
  - 风险可控，便于单批验证

## 环境与验收

- 运行环境：Bun 1.3.11 项目
- 当前统一验收门槛：`bun run verify`
- 当前策略已调整为“不保留兼容层，直接修复断点”
- 最新发布链修复验证：2026-04-05 已执行 `bun install --frozen-lockfile`，通过
- 最新发布链修复验证：2026-04-05 已执行 `bun run verify`，通过
- 最新发布链真实安装验证：2026-04-05 GitHub Actions `Release NPM` run `23998338010` 已通过，证明 `run_registry_smoke=true` 可在 dry-run 场景独立触发 Verdaccio 私有 registry 安装链路，而不会误触发 `publish-npm`、`publish-release-assets`、`tag-stable`
- 最新真实发版验证：2026-04-05 GitHub Actions `Release NPM` run `23998582683` 中 `build-binary(matrix)`、`package-mac-npm`、`smoke-tarball(matrix)`、`smoke-registry(matrix)` 与 `publish-release-assets` 均通过；唯一失败点是 `publish-npm` 缺少 checkout，属于 workflow 编排问题而非包内容或消费者安装链路问题
- 最新正式发布结果：2026-04-05 GitHub Actions `Release NPM` run `23998704055` 已通过，`publish-npm` 与 `tag-stable` 成功；npm registry 已确认 `gclm-code@1.0.0`、`gclm-code-darwin-x64@1.0.0`、`gclm-code-darwin-arm64@1.0.0` 可见，且 `latest/stable` 均指向 `1.0.0`
- 最新本机安装验证：2026-04-05 在本机以 `npm install -g gclm-code@1.0.0` 安装时，默认 registry 为 `https://registry.npmmirror.com`，根包 `optionalDependencies` 未落地，首次 `gc --version` 报“未找到匹配架构包”；随后改用官方 npm registry 补装 `gclm-code-darwin-x64@1.0.0` 后恢复正常
- 最新本机卸载重装验证：2026-04-05 本机先删除旧 `Claude Code 2.1.76` 程序文件、保留 `/Users/gclm/.claude`，再执行全局卸载/重装；结果 `command -v claude` 与 `command -v gc` 均已命中 `gclm-code` 提供的入口，`claude --version` / `gc --version` 均输出 `1.0.0 (Gclm Code)`，`gclm` 仍不存在；当前已确认根包内 `node_modules/gclm-code-darwin-x64` 实际落地
- 最新 registry 交叉验证：2026-04-05 通过 `npm view gclm-code-darwin-x64@1.0.0 dist.tarball --registry=https://registry.npmmirror.com` 已可返回 tarball 地址，但这只能证明镜像元数据可查；进一步在全新 `prefix + cache` 下执行隔离 fresh install 时，`npmmirror` 仍只安装根包而未落地 `gclm-code-darwin-x64`，`gc --version` 继续报“未找到匹配架构包”，而官方 npm 在同条件下可正常安装两包并运行
- 最新验证结果：2026-04-04 已执行 `bun run build`，构建通过（含第二刀 codex 全量移除）
- smoke 脚本已新增：`bun run smoke`、`bun run smoke:gui`
- 已修复网关模型发现回归：清空 provider flag 后仍可基于 `ANTHROPIC_BASE_URL` 刷新 `/models`
- 备注：全量 `bun run typecheck` 当前受仓库既有错误影响，不作为本轮唯一阻断
- 已按网关 URL 规则收敛模型发现端点：
  - `ANTHROPIC_BASE_URL=http://host` -> `http://host/v1/models`
  - `ANTHROPIC_BASE_URL=http://host/vN` -> `http://host/vN/models`
- 回归验证：
  - `http://localhost:8086` 场景通过，命中 `/v1/models`
  - `http://localhost:8086/v1` 场景通过，命中 `/v1/models`（由 base `/v1` + `/models` 组成）
  - `http://localhost:8086/v2` 场景失败（网关该版本路径无模型列表，属环境能力差异）
- 新增逐包接入回归脚本：`bun run smoke:packages`
- `smoke:packages` 已覆盖并验证 8 个本地 package 的主流程可加载能力：
  - `audio-capture-napi`
  - `image-processor-napi`
  - `modifiers-napi`
  - `url-handler-napi`
  - `@ant/claude-for-chrome-mcp`
  - `@ant/computer-use-input`
  - `@ant/computer-use-mcp`
  - `@ant/computer-use-swift`
- 端到端回归结果：
  - `bun run smoke:packages` 通过
  - `SMOKE_GATEWAY_BASE_URL=http://localhost:8086 ... bun run smoke` 通过（models=9）
  - `bun run smoke:gui` 通过
- smoke 包回归已升级为分层模式（core/gui/gateway/all）
- 新增脚本：
  - `bun run smoke:packages:core`
  - `bun run smoke:packages:gui`
  - `bun run smoke:packages:gateway`
  - `bun run smoke:packages`（all）
- 分层验收结果（2026-04-04）：
  - core 通过
  - gui 通过
  - gateway 通过（`http://localhost:8086/v1/models`, models=9）
  - all 通过
- CI `preflight + build + smoke-packages(matrix)` 已补充分层 smoke：
  - `smoke:packages:core`
  - `smoke:packages:gateway`
  - gateway 依赖 Secrets：`SMOKE_GATEWAY_BASE_URL`、`SMOKE_GATEWAY_API_KEY`
- 新增运维文档：`docs/release/gateway-smoke-and-login.md`
- 新增登录等效验收脚本：`bun run smoke:login-gateway`
  - 脚本对齐 `/login` 平台路径核心逻辑：保存 `ANTHROPIC_BASE_URL/KEY` + 清理 provider flags + 强制刷新模型
  - 本地验收通过：`http://localhost:8086` 场景发现 9 个模型并写入缓存
- 已修复 brand-guard 阻断：清理 `packages/computer-use-mcp` 中一处 legacy 品牌注释
- 最新验证：`bun run verify` 通过
- 已检查新拷贝 packages 中 legacy 品牌文案用途：
  - 对外可见提示文案已替换为 `Gclm Code`
  - 协议/工具标识（如 `mcp__Claude_in_Chrome__*`）保持不变以避免兼容性风险
- 已替换位置（用户可见）：
  - `packages/computer-use-mcp/src/mcpServer.ts`
  - `packages/computer-use-mcp/src/toolCalls.ts`
  - `packages/computer-use-mcp/src/tools.ts`
- 验证结果：
  - `bun run brand:guard` 通过
  - `bun run smoke:packages:gui` 通过
- 已完成 docs 下一步 1+2 开发：
  - 1) `docs/overview/roadmap.md` 已将 M2 收口为“已完成”，并同步 M1/M3 当前状态
  - 2) 新增 `docs/release/release-gate.md`（手动发版前必过清单）
- `docs/README.md` 已补充新文档索引（gateway 验收 + release gate + overview）
- 校验结果：
  - `bun run verify` 通过
  - `bun run smoke:packages:gateway` 通过（无 env 时按预期 skip）
  - `SMOKE_GATEWAY_* bun run smoke:login-gateway` 通过（discovered=9）
- M3-1 已开始并落地首批改造（错误语义统一）：
- M3-2 已完成（模型发现可观测性补强）：
- M3-3 已完成（回归矩阵加固）：
- M3-4 已完成（文档收口与 release gate 对齐）：
  - `release-gate` 已升级为标准命令集（verify + smoke:packages + smoke:login-gateway:matrix）
  - `roadmap` 已更新为 M3 完成、当前推荐动作切换到 M4
  - `docs/README` 已标注 release gate 包含 matrix 回归入口
  - 新增 `bun run smoke:login-gateway:matrix`，统一执行登录网关成功路径 + 404 错误语义用例
  - 支持可选扩展 env：`SMOKE_GATEWAY_EXPECT_401_KEY`、`SMOKE_GATEWAY_EXPECT_429_BASE_URL`、`SMOKE_GATEWAY_EXPECT_5XX_BASE_URL`
  - 文档已补充 matrix 用法与可选场景，便于发版前固定回归
  - 新增 `GlobalConfig.providerModelDiscoveryLastStatus` 持久化最近一次 discovery 诊断
  - 成功记录：状态/端点/模型数；失败记录：错误类型/状态码/端点/压缩错误文案
  - `/status` 的 API provider 区域新增 Model discovery 诊断展示（success/error + message）
  - `refreshProviderModelOptions` 新增 `interactive` 模式，供 `/login` 平台配置路径直出可操作错误
  - 网关模型发现新增结构化错误分类：`auth/not_found/rate_limit/gateway_unavailable/empty_models/invalid_payload/unknown`
  - 401/403、404、429、5xx、网络超时/连接失败均映射为明确提示文案
  - `/login` 平台保存后刷新改为 `refreshProviderModelOptions({ force: true, interactive: true })`
  - `smoke:login-gateway` 新增 `SMOKE_GATEWAY_EXPECT_ERROR` 断言能力，可回归错误语义稳定性
- 已移除 legacy workspace 发布兼容链：
  - 不再维护 `prepack/postpack` 的 `workspace:* -> file:` 重写
  - 不再维护 `smoke:npm-install`
  - 仓库根 `package.json` 已改为 `private: true`，防止误走根目录直发
  - 对外交付只保留 `mac binary-first` 主路径
- 已新增 mac binary-first 组装与发布脚手架：
  - `node ./scripts/prepare-mac-binary-npm.mjs`
  - `node ./scripts/pack-mac-binary-npm.mjs`
  - `node ./scripts/prepare-mac-release-assets.mjs`
  - `bun run smoke:mac-binary-npm`
- `release-npm` 当前门禁已切换为：
  - `preflight`
  - `build-binary`（matrix）
  - `package-mac-npm`
  - `smoke-tarball`（matrix）
  - `smoke-registry`（matrix）
- 当前骨架能力：
  - 可生成 `dist/npm/gclm-code`、`gclm-code-darwin-x64`、`gclm-code-darwin-arm64`
  - 可生成三包 npm tarball 与双架构 GitHub Release 资产
  - 根包 launcher 已能按 `process.arch` 选择架构子包并转发到真实二进制
  - 本地已验证三包 `npm pack` 成功
  - 本地已验证模拟安装布局下 `darwin-x64` launcher 执行 `gc --version` 成功
- 当前已识别的实现细节：
  - 本地目录 `npm install` 会优先走 symlink 路径，不足以代表未来 registry 安装对 `optionalDependencies` 的最终行为
  - 已新增 tarball 安装 smoke：先装当前架构子包，再离线装根包，验证 `node_modules/.bin/gc` 消费者路径
  - 已新增 Verdaccio 私有 registry smoke：按顺序发布三包后，再从 registry 安装根包验证消费者路径
  - 当前整体验证已提升为“staging + tarball install + private registry install”三层；其中 CI 固定覆盖后两层，staging smoke 保留为本地演练入口；公网 npm registry 闭环仍留待后续最终补齐
  - 已定位并修复 2026-04-05 两次 Actions 失败（`23992808000`、`23992815249`）的共同根因：`bun.lock` 仍保留旧的 `file:` workspace 解析结果，导致 GitHub Actions 上的 `bun install --frozen-lockfile` 报 `lockfile had changes, but lockfile is frozen`
  - 已按 Option C 升级 workflow：平台列表由 `meta` 输出统一 `platform_matrix`，供 `build-binary`、`smoke-tarball`、`smoke-registry` 复用，便于后续追加 Linux / Windows 平台
  - 已收紧门禁层次：`CI Verify` 中 `smoke-packages(matrix)` 依赖 `build`；`Release NPM` 中 `smoke-registry(matrix)` 依赖 `smoke-tarball(matrix)`，避免基础构建或轻量安装失败后继续展开重型 smoke
  - 已继续抽象平台元数据：workflow 改为调用 `scripts/release-platform-matrix.mjs` 生成矩阵，`package-mac-npm` 改为按 `gc-*` artifact 模式下载二进制，`publish-npm` 改为调用统一脚本按平台目录顺序发布 tarball
  - 已新增 `run_registry_smoke` 输入：可在 `workflow_dispatch` 的“只做 dry-run”场景中，显式要求执行 `smoke-registry(matrix)`，补齐更接近真实消费者安装链路的验证
