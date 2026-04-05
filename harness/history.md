# 变更历史

## 2026-04-04

- 基于 `docs` 现有文档重新梳理项目阶段，确认当前属于 `scope-refresh` 而非新规划。
- 判断发布链路已基本完成，主线从“是否能发布”切换为“是否完成 runtime config 与 provider 语义收口”。
- 新增项目状态文件，建立 `roadmap + harness` 作为当前阶段单一状态源。
- 确认当前执行顺序：
  - 先做 `analytics -> runtime config` 语义迁移
  - 再做 provider 旧命名清理
- 按“不要保留兼容层，直接修复断点”的策略完成本轮迁移：删除了 `src/services/analytics/config.ts`、`growthbook.ts`、`sinkKillswitch.ts` 等旧路径。
- 将 `src/services/analytics/metadata.ts` 迁移为 `src/services/toolLogging/metadata.ts`，并把工具日志类型名收口为 `SafeLogValue`。
- 删除无引用旧实现 `src/utils/telemetry/bigqueryExporter.ts`。
- 完成 `src/services/analytics/index.ts` 类型边界中性化：统一改为 `SafeEventValue / PiiEventValue`，并通过 `bun run verify`。
- 确认兼容层已按策略移除后提交检查点：`3745dc6`（runtimeConfig 迁移、旧路径删除、状态文件回写）。
- 完成 `Phase 3 / step 1` 入口收敛：定位 `provider/auth` 下一刀应先收敛 first-party auth header 分叉实现，再进入更大范围 provider/auth 重构。
- 根据新决策撤销 `Phase A` 相关提交：`8aad550`（Revert `241a3da`）。
- 路线切换为务实版：`M1 /models 动态发现 -> M2 openai-compatible -> M3 anthropic-compatible 补强 -> M4 收尾`。
- 明确 OAuth 策略：接入 OpenAI SDK 不做 OAuth 重设计，优先复用现有 Codex OAuth token 存储与刷新链路。
- 完成 M1 最小实现：新增 openai provider `/models` 动态发现（后台触发 + 定时刷新），结果写入 `additionalModelOptionsCache`。
- 新增缓存时间戳 `additionalModelOptionsCacheFetchedAt`，引入 TTL 与失败降级（刷新失败保留旧缓存）。
- 保持 OAuth 策略不变：未做 OAuth 重设计，继续复用现有 Codex OAuth token 链路。
- 根据新决策切换为网关优先：回滚客户端 openai-compatible 适配提交（`229802e`、`f6ffe92`），请求协议统一回到 anthropic-compatible。
- 动态模型发现改为网关路径：优先 `ANTHROPIC_BASE_URL/models`，失败回退 `ANTHROPIC_BASE_URL/v1/models`。

## 2026-04-05

- 基于已确认的 `mac binary-first + npm 根包/架构子包` 方向，新增首批可执行骨架。
- 新增 `scripts/prepare-mac-binary-npm.mjs`：可生成 `dist/npm/gclm-code`、`gclm-code-darwin-x64`、`gclm-code-darwin-arm64` 三包目录。
- 新增 `scripts/lib/mac-binary-npm.mjs`：统一维护包名、架构映射与根包 launcher 模板。
- 新增 `scripts/smoke-mac-binary-npm.mjs` 与脚本入口 `prepare:mac-binary-npm`、`smoke:mac-binary-npm`。
- 新增 `scripts/pack-mac-binary-npm.mjs` 与 `scripts/prepare-mac-release-assets.mjs`，用于把 staging 三包打成 npm tarball，并同步生成双架构 mac release 资产与 `sha256`。
- `release-npm` workflow 已切换为 `mac binary-first` 主链：在 `macos-15-intel` 与 `macos-15` 分别构建二进制，随后统一执行三包组装、双架构 smoke、npm 顺序发布与 GitHub Release 资产上传。
- 已按当前决策删除 legacy workspace 发布兼容链，不再维护 `prepack/postpack` manifest 重写与 `smoke:npm-install`。
- 仓库根 `package.json` 已改为 `private: true`，避免误把开发工作区 manifest 当作对外交付入口。
- 已删除 `prepare-mac-binary-npm.mjs` 中遗留的 `--local-links` 路径，不再保留任何 `file:` 型发布兼容入口。
- 已新增 `smoke-mac-binary-npm-install.mjs`：通过“当前架构子包 tarball -> 根包 tarball -> 离线安装”验证更接近 npm 消费者的安装路径。
- 已新增 `smoke-mac-binary-npm-registry.mjs`：通过 Verdaccio 私有 registry 按顺序发布三包，再从 registry 安装根包验证真实安装链路。
- 已补齐收尾对齐：`registry-smoke-*` 仅在需要发布 npm 或上传 release assets 时触发，避免 workflow dry-run 也依赖 Verdaccio；文档同步明确 CI 当前固定覆盖 `tarball install + private registry` 两层验证。
- 已修复 GitHub Actions 的冻结锁文件阻断：更新 `bun.lock` 中 workspace 依赖解析记录，解决 `CI Verify` 与 `Release NPM` 在 `bun install --frozen-lockfile` 阶段报 `lockfile had changes, but lockfile is frozen` 的问题。
- 已补充仓库忽略规则：忽略根目录 npm 打包产物、`release-assets-check/` 与 `packages/*/node_modules/`，避免本地发布演练污染工作区状态。
- 已按 Option C 重构 CI / release workflow：`CI Verify` 拆为 `preflight + build + smoke-packages(matrix)`，`Release NPM` 改为 `meta` 输出统一 `platform_matrix`，驱动 `build-binary(matrix)`、`smoke-tarball(matrix)` 与 `smoke-registry(matrix)`，为后续多平台扩展预留统一入口。
- 已根据 review 收紧矩阵门禁顺序：`CI Verify` 的 `smoke-packages(matrix)` 改为依赖 `build`；`Release NPM` 的 `smoke-registry(matrix)` 改为依赖 `smoke-tarball(matrix)`，避免在已知前置失败后继续消耗重型 smoke 资源。
- 已继续推进 Option C 的平台目录抽象：新增 `scripts/lib/release-platforms.mjs` 作为发布平台单一事实源，并让 workflow matrix、artifact 下载、tarball 发布顺序与打包脚本统一消费该目录。
- 已为 `Release NPM` 增加 `run_registry_smoke` 手动开关：允许在 `publish_to_npm=false` 且 `attach_release_assets=false` 时，单独补跑 Verdaccio 私有 registry 安装验证。
- 已完成线上 dry-run 验证：GitHub Actions `Release NPM` run `23998338010` 在 `publish_to_npm=false`、`attach_release_assets=false`、`run_registry_smoke=true` 下全绿，`Tarball smoke` 与 `Registry smoke` 双矩阵均实际执行成功，`publish-npm`、`publish-release-assets`、`tag-stable` 均保持 `skipped`，证明可在无发布副作用前提下单独补跑私有 registry 安装验证。
- 已触发真实 `v1.0.0` 发布：run `23998582683` 中构建、`Tarball smoke`、`Registry smoke` 与 GitHub Release 资产上传全部成功，但 `publish-npm` 因缺少 `actions/checkout` 导致 `./scripts/publish-binary-npm-tarballs.mjs` 不存在而失败。
- 已修复 `publish-npm` job：补回 `Checkout` 步骤，确保正式发布时可读取仓库内发布脚本，随后可通过 `workflow_dispatch` 补跑 `v1.0.0` 的 npm 发布。
- 已完成 `v1.0.0` 正式补发：workflow_dispatch run `23998704055` 全绿，`publish-npm`、`tag-stable` 均成功；npm registry 已可见 `gclm-code@1.0.0`、`gclm-code-darwin-x64@1.0.0`、`gclm-code-darwin-arm64@1.0.0`，且 `latest/stable` 均指向 `1.0.0`。
- 已完成一轮真实本机安装验证：在本机保留原有 `Claude Code 2.1.76` 的前提下，全局安装 `gclm-code@1.0.0` 后新增 `gc` 命令入口，但因本机 npm registry 指向 `https://registry.npmmirror.com`，镜像缺少 `gclm-code-darwin-x64@1.0.0` tarball，导致根包的 `optionalDependencies` 被跳过，首次 `gc --version` 失败。
- 已在本机通过官方 npm registry 补装 `gclm-code-darwin-x64@1.0.0` 修复该问题；随后 `gc --version` 成功输出 `1.0.0 (Gclm Code)`，而 `claude` 仍继续指向原有 `/Users/gclm/.local/bin/claude`，未被新包覆盖。
- 已完成一轮本机卸载/重装复验：删除旧 `Claude Code 2.1.76` 程序文件并保留 `/Users/gclm/.claude` 后，重新全局安装 `gclm-code@1.0.0`；当前 `claude --version` 与 `gc --version` 均输出 `1.0.0 (Gclm Code)`，说明在旧本体移除后两者都已映射到新包。
- 已确认当前 npm 包元数据只声明 `gc` 与 `claude` 两个 bin，未声明 `gclm`；因此本机全局 bin 也仅生成这两个入口，不会自动得到 `gclm` 命令。
- 已补做 registry 交叉验证：`npm view gclm-code-darwin-x64@1.0.0 dist.tarball --registry=https://registry.npmmirror.com` 已可返回 tarball 地址，表明默认 `npmmirror` 当前能够解析该架构子包；但根包 launcher 仍通过 `require.resolve()` 依赖已安装的架构子包，因此发布模型本身依然受 registry 子包可用性影响。
- 已完成本地验证：
  - 三个生成包均可执行 `npm pack`
  - `pack-mac-binary-npm` 已验证可输出 `gclm-code`、`gclm-code-darwin-x64`、`gclm-code-darwin-arm64` 三个 tarball
  - `prepare-mac-release-assets` 已验证可输出双架构 `tar.gz + sha256`
  - 模拟安装布局下，根包 launcher 可在 `darwin-x64` 环境成功选择架构子包并执行 `gc --version`
- 记录实现细节：本地目录 `npm install` 会优先走 symlink 布局，不能完整代表后续 registry 安装时 `optionalDependencies` 的真实行为；后续需在 CI 或私有 registry 场景补真实 install 验证。
