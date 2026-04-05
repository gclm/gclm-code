# Release Gate（single-package + vendor runtime）

本文定义 `gclm-code` 当前单包发布链路的最小放行门槛。

目标：

- 保证双 mac 架构 runtime 资产都已产出
- 保证单包 staging 可生成、可打包、可安装 runtime
- 保证 tarball 与 registry 两条消费者路径都能跑通 `bin/ + vendor/`

## 1. 必过门禁

当前正式门禁以 `Release NPM` workflow 为准，至少需要以下 job 全部通过：

1. `preflight`
2. `build-binary` 矩阵中的全部平台实例
3. `package-single-npm`
4. `smoke-tarball` 矩阵中的全部平台实例
5. `smoke-registry` 矩阵中的全部平台实例

判定标准：

- `preflight` 通过，锁文件与基础仓库门禁通过
- 两个 mac runner 都能产出并执行自己的 `gc --version`
- 单包 staging 目录可生成，并包含 `bin/`、`vendor/manifest.json`、`vendor/modules/`
- 单包 tarball 可从真实打包产物解包、安装 runtime、再执行 `gc --version`
- 单包发布到临时私有 registry 后，能从 registry 安装根包并成功完成 runtime 安装
- `vendor/runtime/<platform>/node_modules -> ../../../modules/node_modules` 软链存在，发布态可加载 vendored workspace modules

## 2. 本地演练命令

如果需要在本地或临时 runner 演练当前发布链路，推荐顺序：

```bash
bun run verify
node ./scripts/prepare-mac-release-assets.mjs \
  --output-dir release-assets-check \
  --darwin-x64-binary /path/to/gc-darwin-x64 \
  --darwin-arm64-binary /path/to/gc-darwin-arm64
node ./scripts/prepare-single-package-npm.mjs \
  --output-dir dist/npm-check \
  --version <version> \
  --release-tag v<version> \
  --runtime-base-url https://github.com/<owner>/<repo>/releases/download/v<version>/
node ./scripts/pack-single-package-npm.mjs \
  --staging-dir dist/npm-check \
  --output-dir dist/npm-tarballs-check
node ./scripts/smoke-single-package-npm.mjs \
  --skip-prepare \
  --staging-dir dist/npm-check \
  --pack-dir dist/npm-tarballs-check
node ./scripts/smoke-single-package-npm-install.mjs \
  --skip-pack \
  --tarballs-dir dist/npm-tarballs-check \
  --release-assets-dir release-assets-check
node ./scripts/smoke-single-package-npm-registry.mjs \
  --skip-pack \
  --tarballs-dir dist/npm-tarballs-check \
  --release-assets-dir release-assets-check \
  --upstream-registry https://registry.npmjs.org/
node ./scripts/smoke-single-package-vendor-modules.mjs
```

说明：

- `smoke-single-package-npm` 负责检查 staging 目录、manifest、tarball 内容边界
- `smoke-single-package-npm-install` 从真实 tarball 解包开始，模拟依赖树与 runtime 安装，验证安装后可直接执行 `gc --version`
- `smoke-single-package-npm-registry` 负责“发布到临时私有 registry -> 从 registry 安装根包”的消费者路径回归
- `smoke-single-package-vendor-modules` 进一步验证 vendored workspace packages 与 sidecar 文件在 runtime 下可实际加载
- `x64` 与 `arm64` 双路径仍应分别在对应机器或 CI runner 上补齐

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
- 若 `publish_to_npm=true`，则必须同时 `attach_release_assets=true`，否则消费者无法拿到默认 runtime 下载源

## 4. 发布顺序

发布顺序已收敛为：

1. 上传 GitHub Release 双架构 runtime 资产
2. 发布 `gclm-code` 单包
3. 如需要，再补 `stable` dist-tag

当前不再存在“根包必须晚于架构子包”的约束；消费者 runtime 通过 GitHub Release 资产与 `vendor/manifest.json` 协同完成安装。

## 5. GitHub Release 资产要求

如果开启 `attach_release_assets=true`，应至少上传：

- `gclm-code-<version>-darwin-x64.tar.gz`
- `gclm-code-<version>-darwin-x64.tar.gz.sha256`
- `gclm-code-<version>-darwin-arm64.tar.gz`
- `gclm-code-<version>-darwin-arm64.tar.gz.sha256`

## 6. 失败处置

- `build-binary` 某个平台实例失败：先定位对应 runner 上的 Bun compile 或宿主依赖问题
- `package-single-npm` 失败：优先检查 runtime 资产输入目录、single-package staging 内容、tarball 生成脚本
- `smoke-tarball` 某个平台实例失败：优先检查 tarball 内容、`vendor/manifest.json`、runtime 安装器和本地 asset override 是否一致
- `smoke-registry` 某个平台实例失败：优先检查 Verdaccio 启动/登录、根包本地发布规则、第三方依赖代理以及 runtime 资产覆盖地址
- `publish-npm` 失败：优先确认单 tarball 名称、`NPM_TOKEN` 权限与目标版本是否已占用
