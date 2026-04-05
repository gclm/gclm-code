# `gclm-code` 手动发布指南（mac binary-first）

这份文档用于在 CI 不可用时，手动发布 `Gclm Code` 的 macOS 二进制 npm 包。

适用范围：

- 发布前人工演练
- CI 不可用时的兜底发布
- 需要手动检查三包产物内容时

当前对外交付主路径已经不是“仓库根目录直接 `npm publish`”，而是：

- 根包：`gclm-code`
- 架构子包：`gclm-code-darwin-x64`
- 架构子包：`gclm-code-darwin-arm64`

因此手动发布时，只发布 `scripts/prepare-mac-binary-npm.mjs` 生成的三包产物，不直接发布仓库根目录的开发态 `package.json`。

补充说明：

- 仓库根 `package.json` 当前仅用于 workspace 开发，已显式设为 `private: true`
- 对外可发布的根包 manifest 由 `prepare-mac-binary-npm.mjs` 在 staging 目录中生成

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

## 3. 组装三包目录

示例：

```bash
node ./scripts/prepare-mac-binary-npm.mjs \
  --output-dir dist/npm-manual-release \
  --darwin-x64-binary /path/to/gc-darwin-x64 \
  --darwin-arm64-binary /path/to/gc-darwin-arm64
```

产物目录：

- `dist/npm-manual-release/gclm-code`
- `dist/npm-manual-release/gclm-code-darwin-x64`
- `dist/npm-manual-release/gclm-code-darwin-arm64`

## 4. 生成 npm tarball 与 Release 资产

生成 npm tarball：

```bash
node ./scripts/pack-mac-binary-npm.mjs \
  --staging-dir dist/npm-manual-release \
  --output-dir dist/npm-manual-tarballs
```

生成 GitHub Release 资产与校验和：

```bash
node ./scripts/prepare-mac-release-assets.mjs \
  --output-dir release-assets-manual \
  --darwin-x64-binary /path/to/gc-darwin-x64 \
  --darwin-arm64-binary /path/to/gc-darwin-arm64
```

预期产物：

- `dist/npm-manual-tarballs/gclm-code-<version>.tgz`
- `dist/npm-manual-tarballs/gclm-code-darwin-x64-<version>.tgz`
- `dist/npm-manual-tarballs/gclm-code-darwin-arm64-<version>.tgz`
- `release-assets-manual/gclm-code-<version>-darwin-x64.tar.gz`
- `release-assets-manual/gclm-code-<version>-darwin-x64.tar.gz.sha256`
- `release-assets-manual/gclm-code-<version>-darwin-arm64.tar.gz`
- `release-assets-manual/gclm-code-<version>-darwin-arm64.tar.gz.sha256`

## 5. 本地 smoke 验证

在当前机器对应架构上执行：

```bash
node ./scripts/smoke-mac-binary-npm.mjs \
  --skip-prepare \
  --staging-dir dist/npm-manual-release
```

说明：

- 该 smoke 会验证三包目录可以 `npm pack`
- 会验证根包 launcher 能在“模拟安装布局”中选择当前架构子包并执行 `gc --version`
- `x64` 与 `arm64` 两条路径需要分别在对应 runner 或机器上验证；正式发布建议交给 CI workflow 自动完成

## 6. 发布到 npm

发布顺序必须固定：

1. `gclm-code-darwin-x64`
2. `gclm-code-darwin-arm64`
3. `gclm-code`

示例：

```bash
npm publish --access public --tag latest \
  dist/npm-manual-tarballs/gclm-code-darwin-x64-<version>.tgz
npm publish --access public --tag latest \
  dist/npm-manual-tarballs/gclm-code-darwin-arm64-<version>.tgz
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
