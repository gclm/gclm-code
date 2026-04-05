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
- 已完成本地验证：
  - 三个生成包均可执行 `npm pack`
  - `pack-mac-binary-npm` 已验证可输出 `gclm-code`、`gclm-code-darwin-x64`、`gclm-code-darwin-arm64` 三个 tarball
  - `prepare-mac-release-assets` 已验证可输出双架构 `tar.gz + sha256`
  - 模拟安装布局下，根包 launcher 可在 `darwin-x64` 环境成功选择架构子包并执行 `gc --version`
- 记录实现细节：本地目录 `npm install` 会优先走 symlink 布局，不能完整代表后续 registry 安装时 `optionalDependencies` 的真实行为；后续需在 CI 或私有 registry 场景补真实 install 验证。
