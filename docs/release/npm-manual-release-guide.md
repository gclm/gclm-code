# `gclm-code` 手动发布指南（single-package）

这份文档用于在 CI 不可用时，手动发布 `Gclm Code` 的单包 npm 产物。

适用范围：

- 发布前人工演练
- CI 不可用时的兜底发布
- 需要手动检查单包 tarball、vendor 清单与 runtime 资产内容时

当前对外交付主路径已经收敛为：

- 一个 npm 包：`gclm-code`
- 一份包内运行时清单：`vendor/manifest.json`
- 一组 GitHub Release runtime 资产：`gclm-code-<version>-darwin-*.tar.gz`

因此手动发布时，不直接发布仓库根目录的开发态 `package.json`，而是发布 `prepare-single-package-npm.mjs` 生成的 staging 单包产物。

补充说明：

- 仓库根 `package.json` 当前仅用于 workspace 开发，已显式设为 `private: true`
- 对外可发布的消费者 manifest 由 `prepare-single-package-npm.mjs` 在 staging 目录中生成
- 当前平台清单、runner 映射与 runtime 资产命名统一维护在 `scripts/lib/release-platforms.mjs`

## 1. 发布前准备

1. 确认两个 macOS 二进制都已准备好：

- `darwin-x64`
- `darwin-arm64`

2. 确认根 `package.json` 版本号已经是目标版本。

3. 确认 npm 身份：

```bash
npm whoami
```

应返回具备 `gclm-code` 发布权限的账号。

## 2. 基线验收

先确认仓库基线可构建：

```bash
bun run verify
```

如果这里失败，不要继续进入打包发布。

## 3. 生成 runtime 资产与单包 staging

先准备 GitHub Release 资产：

```bash
node ./scripts/prepare-mac-release-assets.mjs \
  --output-dir release-assets-manual \
  --darwin-x64-binary /path/to/gc-darwin-x64 \
  --darwin-arm64-binary /path/to/gc-darwin-arm64
```

再生成单包 staging：

```bash
node ./scripts/prepare-single-package-npm.mjs \
  --output-dir dist/npm-manual-release \
  --version <version> \
  --release-tag v<version> \
  --runtime-base-url https://github.com/<owner>/<repo>/releases/download/v<version>/
```

产物目录：

- `dist/npm-manual-release/gclm-code`

目录内关键内容：

- `bin/gc.js`
- `bin/install-runtime.js`
- `vendor/manifest.json`
- `vendor/modules/node_modules/*`

## 4. 生成 npm tarball

```bash
node ./scripts/pack-single-package-npm.mjs \
  --staging-dir dist/npm-manual-release \
  --output-dir dist/npm-manual-tarballs
```

预期产物：

- `dist/npm-manual-tarballs/gclm-code-<version>.tgz`
- `release-assets-manual/gclm-code-<version>-darwin-x64.tar.gz`
- `release-assets-manual/gclm-code-<version>-darwin-x64.tar.gz.sha256`
- `release-assets-manual/gclm-code-<version>-darwin-arm64.tar.gz`
- `release-assets-manual/gclm-code-<version>-darwin-arm64.tar.gz.sha256`

## 5. 本地 smoke 验证

建议至少执行以下四条：

```bash
node ./scripts/smoke-single-package-npm.mjs \
  --skip-prepare \
  --staging-dir dist/npm-manual-release \
  --pack-dir dist/npm-manual-tarballs
node ./scripts/smoke-single-package-npm-install.mjs \
  --skip-pack \
  --tarballs-dir dist/npm-manual-tarballs \
  --release-assets-dir release-assets-manual
node ./scripts/smoke-single-package-npm-registry.mjs \
  --skip-pack \
  --tarballs-dir dist/npm-manual-tarballs \
  --release-assets-dir release-assets-manual \
  --upstream-registry https://registry.npmjs.org/
node ./scripts/smoke-single-package-vendor-modules.mjs
```

说明：

- `smoke-single-package-npm` 会验证 staging 目录与 tarball 内容边界
- `smoke-single-package-npm-install` 会从 tarball 解包开始验证 runtime 安装链路
- `smoke-single-package-npm-registry` 会验证“临时私有 registry 发布 -> 从 registry 安装根包”的真实消费者路径
- `smoke-single-package-vendor-modules` 会验证 8 个 vendored workspace runtime packages 与 sidecar 文件可在 runtime 下加载
- `x64` 与 `arm64` 两条路径仍建议分别在对应 runner 或机器上验证；正式发布更推荐交给 CI workflow 自动完成

## 6. 发布到 npm

当前只发布一个 tarball：

```bash
npm publish --access public --tag latest \
  dist/npm-manual-tarballs/gclm-code-<version>.tgz
```

发布后校验：

```bash
npm view gclm-code version
npm dist-tag ls gclm-code
```

## 7. 维护 `stable` 频道

当本次发布需要同步标记为 `stable`：

```bash
npm dist-tag add gclm-code@<version> stable
```

## 8. GitHub Release 资产上传

如需补发 GitHub Release：

- 上传 `release-assets-manual/` 下的两个 `tar.gz`
- 同时上传对应 `.sha256`

建议保持与 npm 版本号完全一致。

## 9. 回滚策略（npm）

npm 不能重发同版本，推荐处理方式：

1. 立即发布修复版本
2. 移除错误 dist-tag：

```bash
npm dist-tag rm gclm-code latest
```

3. 重新把 `latest` 指向正确版本：

```bash
npm dist-tag add gclm-code@<good-version> latest
```

不建议对已经传播的版本执行 `npm unpublish`。
