# Release Gate（single-package + vendor runtime）

本文定义 `gclm-code` 当前单包发布链路的最小放行门槛。

目标：

- 保证双 mac 架构 runtime 资产都已产出
- 保证单包 staging、tarball 与 registry 安装链路都可验证
- 保证消费者只依赖 `bin/ + vendor/` 运行时边界
- 保证 GitHub Release 资产先于 npm 包发布，避免 postinstall 无法下载 runtime

## 1. 必过门禁

当前正式门禁以 `Release NPM` workflow 为准，至少需要以下 job 全部通过：

1. `preflight`
2. `build-binary` 矩阵中的全部平台实例
3. `package-single-package-npm`
4. `smoke-tarball` 矩阵中的全部平台实例
5. `smoke-registry` 矩阵中的全部平台实例
6. 若 `publish_to_npm=true`，还需 `publish-release-assets` 成功后再进入 `publish-npm`

判定标准：

- `preflight` 通过，锁文件与基础仓库门禁通过
- 两个 mac runner 都能产出并执行自己的 `gc --version`
- 单包 staging 目录可生成
- 单包 tarball 可执行 `npm pack`
- 在 `x64` 与 `arm64` 上都能通过 tarball 安装后的 `node_modules/.bin/gc` 成功启动
- 根包在临时私有 registry 中发布后，能在 `x64` 与 `arm64` 上从 registry 安装并成功启动
- 安装后的发布物内同时存在：
  - `vendor/runtime/<platform>/gc`
  - `vendor/runtime/<platform>/node_modules -> vendor/modules/node_modules`
  - `vendor/manifest.json`

## 2. 本地演练命令

如果需要在本地或临时 runner 演练当前发布链路，推荐顺序：

```bash
bun run verify
node ./scripts/prepare-single-package-npm.mjs \
  --output-dir dist/single-package-check \
  --release-tag v<version> \
  --runtime-base-url https://github.com/<owner>/<repo>/releases/download/v<version>/
node ./scripts/pack-single-package-npm.mjs \
  --staging-dir dist/single-package-check \
  --output-dir dist/single-package-tarballs-check
node ./scripts/prepare-mac-release-assets.mjs \
  --output-dir release-assets-check \
  --darwin-x64-binary /path/to/gc-darwin-x64 \
  --darwin-arm64-binary /path/to/gc-darwin-arm64
node ./scripts/smoke-single-package-npm.mjs \
  --skip-prepare \
  --staging-dir dist/single-package-check \
  --pack-dir dist/single-package-tarballs-check
node ./scripts/smoke-single-package-npm-install.mjs \
  --skip-prepare \
  --skip-pack \
  --tarballs-dir dist/single-package-tarballs-check \
  --release-assets-dir release-assets-check
node ./scripts/smoke-single-package-npm-registry.mjs \
  --skip-prepare \
  --skip-pack \
  --tarballs-dir dist/single-package-tarballs-check \
  --release-assets-dir release-assets-check
node ./scripts/smoke-single-package-vendor-modules.mjs
```

说明：

- `smoke-single-package-npm` 只验证 staging 目录、manifest 与 tarball 内容
- `smoke-single-package-npm-install` 验证真实 `npm install <tarball>` 消费者路径
- `smoke-single-package-npm-registry` 验证“发布到临时私有 registry -> 从 registry 安装根包”的真实消费者路径
- `smoke-single-package-vendor-modules` 验证 vendored workspace 包与 sidecar 文件已随发布物落地
- `x64` 与 `arm64` 双路径必须分别在对应机器或 CI runner 上补齐

## 3. GitHub Actions 输入与 Secrets

`Release NPM` workflow 当前支持：

- `release_tag`
- `publish_to_npm`
- `npm_tag`
- `attach_release_assets`
- `run_registry_smoke`

必需 Secrets：

- `NPM_TOKEN`

说明：

- `push tag v*` 时默认直接发布到 npm `latest`
- `workflow_dispatch` 可只做构建/打包/烟测，不必真的发布到 npm
- 若只想补跑私有 registry 验证，可设置：
  - `publish_to_npm=false`
  - `attach_release_assets=false`
  - `run_registry_smoke=true`
- 若 `publish_to_npm=true`，必须同时开启 `attach_release_assets=true`

## 4. 发布顺序

当前正式顺序为：

1. 上传 GitHub Release 资产
2. 发布 `gclm-code` 单包 tarball
3. 若 `npm_tag=latest`，再补 `stable`

这样可以避免 npm 消费者先拿到根包、但 GitHub Release runtime 资产尚未可下载的窗口期问题。

## 5. GitHub Release 资产要求

如果开启 `attach_release_assets=true`，应至少上传：

- `gclm-code-<version>-darwin-x64.tar.gz`
- `gclm-code-<version>-darwin-x64.tar.gz.sha256`
- `gclm-code-<version>-darwin-arm64.tar.gz`
- `gclm-code-<version>-darwin-arm64.tar.gz.sha256`

## 6. 失败处置

- `build-binary` 某个平台实例失败：先定位对应 runner 上的 Bun compile 或宿主依赖问题
- `package-single-package-npm` 失败：优先检查 `vendor/manifest.json`、vendored modules、tarball 生成脚本与 release base URL
- `smoke-tarball` 某个平台实例失败：优先检查 `postinstall` 是否正确下载 runtime、`GCLM_BINARY_BASE_URL` 是否生效、runtime/node_modules 软链是否存在
- `smoke-registry` 某个平台实例失败：优先检查 Verdaccio 是否启动成功、根包是否错误代理到上游、registry 安装时三方依赖是否可回源 npmjs
- `publish-release-assets` 失败：优先确认 release assets 目录、tag、GitHub Release 权限与重复发布状态
- `publish-npm` 失败：优先确认 tarball 名称、`NPM_TOKEN` 权限、目标版本是否已占用，以及 release 资产是否已先发布
