# GitHub Actions 自动发布方案（single-package + vendor runtime）

这份文档描述当前 `Release NPM` workflow 的目标与结构。

## 1. 目标

1. `push tag v*` 时自动执行 mac 双架构构建
2. 自动组装一个 `gclm-code` 消费者包
3. 自动在 `darwin-x64` 与 `darwin-arm64` 上分别执行 tarball 安装 smoke
4. 自动在临时私有 registry 中发布单包，并从 registry 安装做真实安装验证
5. 通过后先上传 GitHub Release runtime 资产，再发布 npm 单包
6. `workflow_dispatch` 可单独打开 `run_registry_smoke`，把 Verdaccio 安装验证当成一次无副作用 dry-run

## 2. 发布物结构

npm 包：

- `gclm-code`

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
- 当前 runner、artifact 名与 runtime 资产命名都统一收口在 `scripts/lib/release-platforms.mjs`

## 4. job 拆分

当前发布链路拆成 7 类 job：

1. `meta`
   - 解析版本、tag、npm dist-tag、是否发 npm、是否附加 release asset
   - 产出 `runtime_base_url`
   - 强制校验：`publish_to_npm=true` 时必须同时 `attach_release_assets=true`
2. `preflight`
   - 在 Ubuntu 上做轻量预检：冻结锁文件安装 + brand guard
3. `build-binary`
   - 基于 `platform_matrix` 做矩阵构建
   - 当前矩阵包含 `darwin-x64` 与 `darwin-arm64`
4. `package-single-package-npm`
   - 下载两份二进制
   - 生成单包 staging 目录
   - 生成 npm tarball
   - 生成 GitHub Release 资产与校验和
5. `smoke-tarball`
   - 基于 `platform_matrix` 做矩阵 tarball 安装 smoke
   - 验证真实 `npm install <tarball>`、`postinstall`、runtime 落盘与 `node_modules/.bin/gc`
6. `smoke-registry`
   - 基于 `platform_matrix` 做矩阵私有 registry smoke
   - 把根包发布到临时 Verdaccio
   - 在临时项目里从 registry 安装 `gclm-code` 并验证 `node_modules/.bin/gc`
7. `publish-release-assets` / `publish-npm` / `tag-stable`
   - 先上传 release asset
   - 再发布 npm 单包
   - 可选补 `stable` dist-tag

说明：

- `meta` 会输出统一 `platform_matrix`，供 `build-binary`、`smoke-tarball`、`smoke-registry` 复用
- `platform_matrix` 由 `scripts/release-platform-matrix.mjs` 生成，避免 workflow 内联平台清单继续膨胀
- `smoke-tarball` 是第一层消费者安装验证；`smoke-registry` 会在它全部通过后再展开第二层 Verdaccio 验证
- `package-single-package-npm` 是单一汇总点，负责把 staging tarball 与 release assets 一次性产出

## 5. 发布顺序

正式顺序固定为：

1. `publish-release-assets`
2. `publish-npm`
3. `tag-stable`（仅当 `npm_tag=latest`）

这样可以避免 npm 消费者先拿到根包、但 GitHub Release runtime 资产尚未可下载的窗口期问题。

## 6. 关键脚本

workflow 主要依赖以下脚本：

- `scripts/prepare-single-package-npm.mjs`
- `scripts/pack-single-package-npm.mjs`
- `scripts/prepare-mac-release-assets.mjs`
- `scripts/release-platform-matrix.mjs`
- `scripts/publish-single-package-npm-tarball.mjs`
- `scripts/smoke-single-package-npm-install.mjs`
- `scripts/smoke-single-package-npm-registry.mjs`
- `scripts/lib/release-platforms.mjs`
- `scripts/lib/single-package-npm.mjs`

说明：

- `scripts/smoke-single-package-npm.mjs` 负责本地 staging/manifest/tarball 结构演练
- `scripts/smoke-single-package-vendor-modules.mjs` 继续负责 vendored workspace runtime 边界与 sidecar 文件校验
- `scripts/lib/release-platforms.mjs` 现在是当前发布平台元数据、runner 映射与 asset 命名的单一事实源
- 当前 workflow 中实际执行的是 `matrix tarball install smoke + matrix private registry smoke` 两层、更接近真实 npm 消费者安装路径的验证

## 7. Secrets 与输入

必需 Secrets：

- `NPM_TOKEN`

`workflow_dispatch` 输入：

- `release_tag`
- `publish_to_npm`
- `npm_tag`
- `attach_release_assets`
- `run_registry_smoke`

说明：

- tag 发布时，`run_registry_smoke` 会被隐式视为开启，不需要人工额外设置
- 手动 dry-run 时，如果 `publish_to_npm=false` 且 `attach_release_assets=false`，可额外设置 `run_registry_smoke=true`，只执行到 Verdaccio 验证层
- 手动发布 npm 时，workflow 会拒绝 `publish_to_npm=true` 且 `attach_release_assets=false` 的组合

## 8. 后续可扩展项

当前未纳入首批实现：

- codesign
- notarization
- 公网 npm 发布后的最终消费者闭环验证
- Linux / Windows runtime 资产扩展
