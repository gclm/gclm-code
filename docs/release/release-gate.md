# Release Gate（mac binary-first）

本文定义 `gclm-code` 当前 mac binary-first 发布链路的最小放行门槛。

目标：

- 保证双 mac 架构二进制都已产出
- 保证三包目录可组装、可打包、可 smoke
- 保证 npm 发布顺序不会把根包先于子包发出去

## 1. 必过门禁

当前正式门禁以 `Release NPM` workflow 为准，至少需要以下 job 全部通过：

1. `preflight`
2. `build-binary` 矩阵中的全部平台实例
3. `package-mac-npm`
4. `smoke-tarball` 矩阵中的全部平台实例
5. `smoke-registry` 矩阵中的全部平台实例

判定标准：

- `preflight` 通过，锁文件与基础仓库门禁通过
- 两个 mac runner 都能产出并执行自己的 `gc --version`
- 三包 staging 目录可生成
- 三个生成包都可执行 `npm pack`
- 根包 launcher 在 `x64` 与 `arm64` 上都能通过 tarball 安装后的 `node_modules/.bin/gc` 成功启动
- 根包在临时私有 registry 中发布后，能在 `x64` 与 `arm64` 上从 registry 安装并成功启动

## 2. 本地演练命令

如果需要在本地或临时 runner 演练当前发布链路，推荐顺序：

```bash
bun run verify
node ./scripts/prepare-mac-binary-npm.mjs \
  --output-dir dist/npm-check \
  --darwin-x64-binary /path/to/gc-darwin-x64 \
  --darwin-arm64-binary /path/to/gc-darwin-arm64
node ./scripts/pack-mac-binary-npm.mjs \
  --staging-dir dist/npm-check \
  --output-dir dist/npm-tarballs-check
node ./scripts/prepare-mac-release-assets.mjs \
  --output-dir release-assets-check \
  --darwin-x64-binary /path/to/gc-darwin-x64 \
  --darwin-arm64-binary /path/to/gc-darwin-arm64
node ./scripts/smoke-mac-binary-npm.mjs \
  --skip-prepare \
  --staging-dir dist/npm-check
node ./scripts/smoke-mac-binary-npm-install.mjs \
  --skip-pack \
  --tarballs-dir dist/npm-tarballs-check
node ./scripts/smoke-mac-binary-npm-registry.mjs \
  --skip-pack \
  --tarballs-dir dist/npm-tarballs-check
```

说明：

- `smoke-mac-binary-npm` 只验证 staging 目录与当前机器架构启动链路
- `smoke-mac-binary-npm-install` 会进一步验证 tarball 安装后的当前架构消费者路径
- `smoke-mac-binary-npm-registry` 会进一步验证“发布到临时私有 registry -> 从 registry 安装根包”的当前架构消费者路径
- `x64` 与 `arm64` 双路径必须分别在对应机器或 CI runner 上补齐

## 3. GitHub Actions 输入与 Secrets

`Release NPM` workflow 当前支持：

- `release_tag`
- `publish_to_npm`
- `npm_tag`
- `attach_release_assets`

必需 Secrets：

- `NPM_TOKEN`

说明：

- `push tag v*` 时默认直接发布到 npm `latest`
- `workflow_dispatch` 可只做构建/打包/烟测，不必真的发布到 npm

## 4. 发布顺序

发布顺序固定为：

1. `gclm-code-darwin-x64`
2. `gclm-code-darwin-arm64`
3. `gclm-code`

根包必须最后发布，否则 npm 消费者在安装窗口期可能拿到“根包已可见，但子包尚未可见”的不完整状态。

## 5. GitHub Release 资产要求

如果开启 `attach_release_assets=true`，应至少上传：

- `gclm-code-<version>-darwin-x64.tar.gz`
- `gclm-code-<version>-darwin-x64.tar.gz.sha256`
- `gclm-code-<version>-darwin-arm64.tar.gz`
- `gclm-code-<version>-darwin-arm64.tar.gz.sha256`

## 6. 失败处置

- `build-binary` 某个平台实例失败：先定位对应 runner 上的 Bun compile 或宿主依赖问题
- `package-mac-npm` 失败：优先检查传入的二进制路径、staging 目录内容、tarball 生成脚本
- `smoke-tarball` 某个平台实例失败：优先检查根包 launcher 是否选中了正确子包，以及下载后的二进制权限是否正常
- `smoke-registry` 某个平台实例失败：优先检查 Verdaccio 是否启动成功、登录/发布顺序是否正确、registry 安装时是否拉到了当前架构子包
- `publish-npm` 失败：优先确认 tarball 名称、发布顺序、`NPM_TOKEN` 权限与目标版本是否已占用
