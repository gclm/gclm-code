# GitHub Actions 自动发布方案（single-package）

本文记录当前 `Release NPM` 自动发布工作流的单包实现思路。

## 1. 总体目标

发布链路收敛为：

- GitHub Actions 双 mac runner 产出 `darwin-x64` / `darwin-arm64` 二进制
- 汇总生成一份 `gclm-code` 单包 staging 与单 tarball
- GitHub Release 保留双架构 runtime 资产与 `sha256`
- npm 只发布一个 `gclm-code`
- 安装时由 `vendor/manifest.json + postinstall` 拉取当前平台 runtime

## 2. 当前 workflow 结构

`Release NPM` 当前 job 顺序：

1. `meta`
2. `preflight`
3. `build-binary(matrix)`
4. `package-single-npm`
5. `smoke-tarball(matrix)`
6. `smoke-registry(matrix)`
7. `publish-release-assets`
8. `publish-npm`
9. `tag-stable`

其中：

- `meta` 负责统一输出版本、tag、平台矩阵、runtime base URL 与门禁开关
- `build-binary(matrix)` 仍保留双 mac runner 构建，以保证 runtime 资产是按架构真实产出
- `package-single-npm` 是唯一汇总点：负责组装单包 staging、打 npm tarball、准备 GitHub Release 资产
- `smoke-tarball(matrix)` 与 `smoke-registry(matrix)` 都以单 tarball 为消费者入口进行验证

## 3. 关键输入与约束

手动触发时支持以下输入：

- `release_tag`
- `publish_to_npm`
- `npm_tag`
- `attach_release_assets`
- `run_registry_smoke`

约束：

- `publish_to_npm=true` 时必须同时 `attach_release_assets=true`
- 因为 npm 单包默认 runtime 下载地址会指向 GitHub Release `releases/download/<tag>/`
- 若禁用 release assets，消费者无法通过默认地址完成 postinstall runtime 安装

## 4. 关键产物

### GitHub Actions artifact

- `gc-darwin-x64`
- `gc-darwin-arm64`
- `single-package-staging`
- `single-package-tarballs`
- `single-package-release-assets`

### GitHub Release asset

- `gclm-code-<version>-darwin-x64.tar.gz`
- `gclm-code-<version>-darwin-x64.tar.gz.sha256`
- `gclm-code-<version>-darwin-arm64.tar.gz`
- `gclm-code-<version>-darwin-arm64.tar.gz.sha256`

### npm 产物

- `gclm-code-<version>.tgz`

## 5. 核心脚本

- `scripts/prepare-single-package-npm.mjs`
- `scripts/pack-single-package-npm.mjs`
- `scripts/publish-single-package-npm-tarball.mjs`
- `scripts/prepare-mac-release-assets.mjs`
- `scripts/smoke-single-package-npm-install.mjs`
- `scripts/smoke-single-package-npm-registry.mjs`
- `scripts/smoke-single-package-vendor-modules.mjs`

说明：

- `prepare-single-package-npm` 负责生成消费者 manifest、launcher、runtime installer 与 `vendor/manifest.json`
- `pack-single-package-npm` 只打一个根 tarball
- `publish-single-package-npm-tarball` 只发布一个 npm tarball
- `smoke-single-package-npm-registry` 会把 `gclm-code` 本身保留在本地临时 registry，不透传上游；第三方依赖可按需代理 npmjs

## 6. Smoke 策略

### `smoke-tarball(matrix)`

- 下载 `single-package-tarballs`
- 下载 `single-package-release-assets`
- 用本地 release assets 覆盖 `GCLM_BINARY_BASE_URL`
- 从真实 tarball 解包开始验证 runtime 安装链路

### `smoke-registry(matrix)`

- 启动临时 Verdaccio
- 发布本次构建的 `gclm-code-<version>.tgz`
- 对 `gclm-code` 本身禁用上游代理，避免与 npmjs 同版本冲突
- 对第三方依赖允许代理 npmjs
- 从 registry 安装根包并校验 `gc --version`

## 7. 为什么不再保留三包发布顺序

旧链路的问题是：

- 根包依赖 `optionalDependencies` 拉取架构子包
- 在 mirror-like registry（如 `npmmirror`）fresh install 场景下，子包可能不落地
- 导致根包可见但主程序本体缺失

新链路改为：

- npm 只交付一个消费者包
- 平台 runtime 从 GitHub Release 资产按需下载
- workspace runtime 模块直接 vendored 到包内 `vendor/modules/`

因此 workflow 已不再需要“子包先发、根包后发”的顺序控制。
