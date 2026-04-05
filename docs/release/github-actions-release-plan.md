# GitHub Actions 自动发布方案（mac binary-first）

这份文档描述当前 `Release NPM` workflow 的目标与结构。

## 1. 目标

1. `push tag v*` 时自动执行 mac 双架构构建
2. 自动组装 `根包 + 架构子包` 三个 npm 包
3. 自动在 `darwin-x64` 与 `darwin-arm64` 上分别 smoke
4. 通过后按顺序发布到 npm，并可同步上传 GitHub Release 资产

## 2. 发布物结构

npm 包：

- `gclm-code`
- `gclm-code-darwin-x64`
- `gclm-code-darwin-arm64`

GitHub Release 资产：

- `gclm-code-<version>-darwin-x64.tar.gz`
- `gclm-code-<version>-darwin-x64.tar.gz.sha256`
- `gclm-code-<version>-darwin-arm64.tar.gz`
- `gclm-code-<version>-darwin-arm64.tar.gz.sha256`

## 3. runner 选择

当前 workflow 固定使用：

- `macos-15-intel` 负责 `darwin-x64`
- `macos-15` 负责 `darwin-arm64`

原因：

- 需要真实双架构 runner 产出对应 Bun compile 二进制
- 不使用 `macos-latest`，避免后续 runner 漂移导致发布链路不稳定

## 4. job 拆分

当前发布链路拆成 7 类 job：

1. `meta`
   - 解析版本、tag、npm dist-tag、是否发 npm、是否附加 release asset
2. `verify`
   - 运行基础构建验收
3. `build-darwin-x64`
   - 在 Intel mac runner 构建 `gc`
4. `build-darwin-arm64`
   - 在 Apple Silicon mac runner 构建 `gc`
5. `package-mac-npm`
   - 下载两份二进制，生成 staging 三包目录
   - 生成 npm tarball
   - 生成 GitHub Release 资产与校验和
6. `smoke-darwin-x64` / `smoke-darwin-arm64`
   - 分别在两种 mac 架构上验证 launcher 转发成功
7. `publish-release-assets` / `publish-npm` / `tag-stable`
   - 上传 release asset
   - 发布 npm 三包
   - 可选补 `stable` dist-tag

## 5. 发布顺序

npm 发布顺序固定为：

1. `gclm-code-darwin-x64`
2. `gclm-code-darwin-arm64`
3. `gclm-code`

这样可以避免根包先发布、而子包还不可下载的窗口期问题。

## 6. 关键脚本

workflow 主要依赖以下脚本：

- `scripts/prepare-mac-binary-npm.mjs`
- `scripts/pack-mac-binary-npm.mjs`
- `scripts/prepare-mac-release-assets.mjs`
- `scripts/smoke-mac-binary-npm.mjs`

## 7. Secrets 与输入

必需 Secrets：

- `NPM_TOKEN`

`workflow_dispatch` 输入：

- `release_tag`
- `publish_to_npm`
- `npm_tag`
- `attach_release_assets`

## 8. 后续可扩展项

当前未纳入首批实现：

- codesign
- notarization
- 真实 registry 安装后的双架构闭环验证
- Linux / Windows 子包扩展
