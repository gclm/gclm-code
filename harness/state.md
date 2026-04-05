# 项目状态

更新时间：2026-04-05（`R5` 已完成）

## 当前阶段

- Active phase：`release scope-refresh 已收口，进入 ship / release-check`
- 当前 focus：
  - 维持 `single-package + vendor runtime` 作为默认发布主链
  - 保持发布态运行时边界为 `bin/ + vendor/`
  - 继续让 GitHub Release 产出双架构 mac runtime 资产
  - 功能侧维持持续维护，不新增 release 之外的大改造

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
  - 新增 `scripts/smoke-single-package-runtime-install.mjs`
- 已完成 `R3 - workspace 运行时物化到 vendor/modules/`：
  - 新增 `scripts/lib/vendor-runtime-modules.mjs` 与 `scripts/prepare-vendor-runtime.mjs`
  - 已将 8 个 runtime workspace 包物化到 `vendor/modules/node_modules/`
  - 已让单包 staging `package.json` 自动注入最小 runtime 依赖清单，并将 modules 边界回写到 `vendor/manifest.json`
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

## 进行中

- 功能侧处于持续维护模式
- 发布侧当前进入 `ship / release-check`：等待下一次正式发版时验证单包主链的公网发布闭环

## 已知未完成项

- Linux / Windows runtime 资产仍未纳入本轮 npm 发布范围
- 通过真实公网 npm 发布后的“fresh install 闭环”仍要等下一次正式单包版本发版时再补最终证据
- `runtimeConfig/growthbook.ts` 仍沿用 `GrowthBook` 命名，后续可再判断是否继续去历史语义
- 文档中的功能开关计数与源码现状存在轻微偏差，需后续同步
- 当前全量 typecheck 在仓库基线上仍有大量既有错误，无法作为本轮唯一阻断标准

## 执行边界

- 当前 must-fix：
  - 无新的 release 结构 must-fix；主线已收口
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
- 最新正式 npm 发布版本：`1.0.0`
  - 说明：该版本是迁移前的历史三包正式版，不代表当前仓库的默认发布结构
  - 当前仓库下一次正式发版将默认走单包主链
- 当前最强本地证据级别：`scripted-flow`
- 最新单包验证结果（2026-04-05）：
  - `bun run build`，通过
  - `node ./scripts/smoke-single-package-npm.mjs`，通过
  - `node ./scripts/smoke-single-package-runtime-install.mjs`，通过
  - `node ./scripts/smoke-single-package-npm-install.mjs`，通过
  - `node ./scripts/smoke-single-package-npm-registry.mjs`，通过
  - `node ./scripts/smoke-single-package-vendor-modules.mjs`，通过
- 备注：真实公网 npm 发布后的最终消费者闭环仍需在下一次正式单包版本发布时补齐
