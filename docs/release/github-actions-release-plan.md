# GitHub Actions 自动发布方案（mac binary-first）

这份文档描述当前 `Release NPM` workflow 的目标与结构。

## 1. 目标

1. `push tag v*` 时自动执行 mac 双架构构建
2. 自动组装 `根包 + 架构子包` 三个 npm 包
3. 自动在 `darwin-x64` 与 `darwin-arm64` 上分别执行 tarball 安装 smoke
4. 自动在临时私有 registry 中发布三包，并从 registry 安装根包做真实安装验证
5. 通过后按顺序发布到 npm，并可同步上传 GitHub Release 资产

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
2. `preflight`
   - 在 Ubuntu 上做轻量预检：冻结锁文件安装 + brand guard
3. `build-binary`
   - 基于 `platform_matrix` 做矩阵构建
   - 当前矩阵包含 `darwin-x64` 与 `darwin-arm64`
4. `package-mac-npm`
   - 下载两份二进制，生成 staging 三包目录
   - 生成 npm tarball
   - 生成 GitHub Release 资产与校验和
5. `smoke-tarball`
   - 基于 `platform_matrix` 做矩阵 tarball 安装 smoke
   - 验证 `node_modules/.bin/gc` 可成功启动 launcher 并转发到真实二进制
6. `smoke-registry`
   - 基于 `platform_matrix` 做矩阵私有 registry smoke
   - 按真实顺序发布两个子包与根包
   - 在临时项目里从 registry 安装 `gclm-code` 并验证 `node_modules/.bin/gc`
7. `publish-release-assets` / `publish-npm` / `tag-stable`
   - 上传 release asset
   - 发布 npm 三包
   - 可选补 `stable` dist-tag

说明：

- `meta` 会输出统一 `platform_matrix`，供 `build-binary`、`smoke-tarball`、`smoke-registry` 复用
- `smoke-tarball` 与 `smoke-registry` 现在都直接依赖 `package-mac-npm`，在同一批平台矩阵上并行展开
- 当前仍保留 `package-mac-npm` 作为单一汇总点，避免三包组装逻辑在多个 job 中重复散开

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
- `scripts/smoke-mac-binary-npm-install.mjs`
- `scripts/smoke-mac-binary-npm-registry.mjs`

说明：

- `scripts/smoke-mac-binary-npm.mjs` 继续作为本地 staging/launcher 演练脚本保留
- 当前 workflow 中实际执行的是 `matrix tarball install smoke + matrix private registry smoke` 两层、更接近 npm 消费者安装路径的验证

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
- 公网 npm 发布后的最终消费者闭环验证
- Linux / Windows 子包扩展
