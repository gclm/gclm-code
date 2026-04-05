# 单包 + Vendor 运行时实施任务单

更新时间：2026-04-05

## 1. 规划结论

- 规划类型：`scope-refresh`
- 规划模式：`staged hybrid`
- 主线：`C` 从当前 `根包 + 架构子包 + optionalDependencies` 迁到 `单消费者包`
- 并行子线：`D-lite` 只收敛发布边界，不做全仓库结构重排
- 冻结边界：发布态运行时只认 `bin/ + vendor/`，`dist/` 只允许作为构建期 staging
- 当前 active phase：`R5 - 默认发布切换与旧三包清理（已完成）`
- 推荐下一步：`ship`

一句话结论：

先把“能发布的单包消费者边界”做出来，再把 workspace 运行时逐步物化进 `vendor/`；`D-lite` 跟着同批收敛入口、脚本和发布清单，但不反向扩大成 repo 级重构。

当前进展：

- `R1` 已完成：单包 staging、发布态 `bin/gc.js`、`vendor/manifest.json` 与最小 `npm pack` smoke 已落地
- `R2` 已完成：安装期 runtime 下载、sha 校验、`vendor/runtime/` 落盘与真实安装 smoke 已落地
- `R3` 已完成：8 个 runtime workspace 包已物化到 `vendor/modules/node_modules/`，modules 清单已回写 `vendor/manifest.json`，并已补齐安装后目录 smoke
- `R4` 已完成：单包 smoke、CI 与 release workflow 已切到 `bin/ + vendor/` 主链，并已补齐 tarball / registry 安装验证
- `R5` 已完成：默认发布已切到单包主链，旧三包脚本与文档入口已清理

## 2. Scope Refresh 记录

### 迁移前的线上方案（现已降级为历史链路）

- `release-npm` 旧主链是 `mac binary-first + 三包`
- npm 入口依赖：`gclm-code` + `gclm-code-darwin-x64` + `gclm-code-darwin-arm64`
- 根包通过 `optionalDependencies` 选择架构子包
- 该链路在官方 npm registry 可用，但在 `npmmirror` fresh install 场景会失败

### 本次明确放弃的替代方案

- 不继续增强“根包 + 架构子包”作为长期主模型
- 不做完整 `references/cli` 式全仓库目录迁移
- 不做“一个 npm tarball 内同时塞双架构二进制”的 fat package

### 新的 Out-of-Scope 边界

- 不搬迁 `src/`、`packages/`、测试目录的主结构
- 不在本轮补 Linux / Windows 支持
- 不在本轮改产品逻辑、provider 主链、gateway 主链
- 不把 repo 根 `package.json` 立刻强行改造成最终消费者 manifest；迁移窗口内允许继续用 staging package 组装发布物

### Fork / Upstream 边界

- 继续跟 upstream 保持贴近的区域：`src/` 主 CLI 逻辑、`packages/*` 产品能力、测试主链
- 允许本仓库长期分叉的区域：发布脚本、消费者 manifest、`bin/` 入口、`vendor/` 运行时布局、品牌与交付文档
- 合并边界约束：任何 `D-lite` 任务都不能以“更像官方”为理由触发 `src/` 或 `packages/` 的大搬迁

## 3. 目标产物与用户流覆盖

### 目标产物

- 一个对外 npm 包：`gclm-code`
- 一个包内运行时事实源：`vendor/manifest.json`
- 一个发布态统一入口：`bin/gc.js`
- 一套平台 runtime 落盘路径：`vendor/runtime/<platform>/...`
- 一套 workspace 运行时产物边界：`vendor/modules/...`

### 必须覆盖的用户流

1. 官方 npm registry 安装：`npm install -g gclm-code` 后 `gc --version` 可直接运行
2. mirror-like registry 安装：不再依赖 `optionalDependencies` 才能拿到主程序本体
3. tarball 安装：`npm pack` 后从 tarball 安装仍能得到完整运行时
4. 首次安装需要落盘 runtime 时：`scripts/install-runtime.mjs` 能下载、校验、写入 `vendor/runtime/`
5. runtime 缺失或校验失败时：CLI 能给出明确错误，不出现“未找到架构子包”式模糊故障
6. 开发态与发布态分离：开发仍可用 workspace，发布态不再依赖 `packages/*` 原始布局

## 4. 实施原则

- `C` 是关键路径：任何不完成 `C` 就无法消除 mirror 安装故障
- `D-lite` 同批并行：只服务发布边界，不单独开大重构
- 迁移窗口内允许双轨：旧三包链路只作回退，不再新增能力
- `vendor/` 是运行时真相源：所有最终消费者必需资产都要折叠回 `vendor/`
- `dist/` 是 staging，不是运行时 API：发布包里的 CLI 不得再读取 `dist/`
- 先做可验证骨架，再做默认切换：任何切换 release 主链之前，必须先补齐单包 smoke

## 5. Phase 总览

| Phase | 目标 | 主责任轨道 | 退出条件 |
| --- | --- | --- | --- |
| `R0` | 方案与边界冻结 | `plan` | 已完成 |
| `R1` | 单包发布骨架 + `vendor/manifest.json` | `C` 主线，`D-lite` 同步入口 | 能生成单包 staging 并 `npm pack` |
| `R2` | 平台 runtime 落盘到 `vendor/runtime/` | `C` | 当前平台安装后可直接启动 |
| `R3` | workspace 运行时物化到 `vendor/modules/` | `C` | 发布态不再依赖 `packages/*` 原始布局 |
| `R4` | 单包 smoke / CI / release 切换 | `C + D-lite` | 单包链路通过 tarball + registry 验证 |
| `R5` | 默认发布切换与旧三包清理 | `C` 收口 | 已完成：旧三包仅保留历史记录，不再是主链 |

## 6. 详细任务单

### Phase `R1`：单包发布骨架与 `vendor/manifest.json`

#### `C1` 新增单包 staging 组装链

- what changes：新增“单消费者包”组装脚本，把发布产物输出到新的 staging 目录，例如 `dist/single-package/gclm-code/`
- likely files：`scripts/prepare-single-package-npm.mjs`、`scripts/lib/single-package-npm.mjs`、`package.json`
- verify：新 staging 目录可生成 `package.json`、`bin/`、`vendor/` 基础骨架；`npm pack` 可通过
- dependencies / blockers：需要复用现有 `build-binary(matrix)` 产出的双架构二进制和 `scripts/lib/release-platforms.mjs`
- required sync surfaces：`package.json` scripts、`docs/release/*`、`.github/workflows/release-npm.yml`
- scope note：保留旧三包组装脚本，不在本阶段删除

#### `D1` 收敛消费者入口与发布清单

- what changes：建立发布态 `bin/gc.js` 模板，明确 `files` 白名单只暴露 `bin/`、`vendor/`、`README.md`
- likely files：`bin/gc.js`、staging package `package.json` 模板、`docs/release/single-package-migration-proposal.md`
- verify：`npm pack --json` 中不再出现 `packages/`、开发态 `gc`、旧子包耦合路径
- dependencies / blockers：需要先决定“消费者 manifest 来自 staging 模板，而不是 repo 根 manifest”
- required sync surfaces：`docs/README.md`、`docs/release/npm-manual-release-guide.md`
- scope note：本任务只收敛发布边界，不要求 repo 根 manifest 当场长得像官方

#### `C2` 定义 `vendor/manifest.json` schema 与读取方式

- what changes：冻结 `vendor/manifest.json` 字段，至少覆盖版本、平台 runtime 列表、sha、来源 URL、模块产物映射
- likely files：`scripts/lib/single-package-npm.mjs`、`bin/gc.js`、新 schema helper 文件
- verify：生成的 manifest 可被 `bin/gc.js` 读取；缺字段时可明确报错
- dependencies / blockers：需要先确认 install-time runtime 是否通过 GitHub Release 资产或自定义 base URL 分发
- required sync surfaces：`docs/release/single-package-migration-proposal.md`、实施任务单、后续 release gate
- scope note：本阶段先冻结 schema，不强求完成全部 runtime 下载逻辑

### Phase `R2`：平台 runtime 落盘到 `vendor/runtime/`

#### `C3` 实现 `scripts/install-runtime.mjs`

- what changes：新增安装期 runtime 落盘脚本，根据 `vendor/manifest.json` 下载当前平台可执行文件与必要 sidecar，并写入 `vendor/runtime/<platform>/`
- likely files：`scripts/install-runtime.mjs`、`scripts/lib/release-platforms.mjs`、`scripts/lib/single-package-npm.mjs`
- verify：在空 `vendor/runtime/` 条件下运行安装脚本后，当前平台 `gc --version` 可执行；sha 错误能被拦截
- dependencies / blockers：需要明确 runtime 资产命名规则、下载源优先级、`GCLM_BINARY_BASE_URL` 环境变量策略
- required sync surfaces：安装说明、错误提示文案、CI secrets / env 说明
- scope note：只处理当前 mac 两个平台，不顺带扩 Linux / Windows

#### `D2` 收敛运行时错误语义

- what changes：把现有“未找到匹配架构包”替换为 vendor/runtime 语义的错误提示
- likely files：`bin/gc.js`、可能的 runtime helper、`README.md`
- verify：缺 manifest、下载失败、sha 失败、权限失败都能给出可区分错误
- dependencies / blockers：依赖 `bin/gc.js` 与 `vendor/manifest.json` 已稳定
- required sync surfaces：`docs/release/release-gate.md`、`docs/release/npm-manual-release-guide.md`
- scope note：只触碰消费者路径，不改主业务逻辑

### Phase `R3`：workspace 运行时物化到 `vendor/modules/`

#### `C4` 盘点运行时必需 workspace 包

- what changes：列出哪些 `workspace:*` 依赖必须进入发布态，哪些只保留开发态
- likely files：`package.json`、`scripts/build.ts`、新清单文档或 `vendor/manifest.json` modules 段
- verify：形成明确列表，至少覆盖当前 8 个本地 package 的处理策略
- dependencies / blockers：需要分清“直接复制产物”“编译后复制”“安装期解析”三类
- required sync surfaces：实施任务单、后续 smoke 覆盖清单
- scope note：这是发布边界盘点，不是 package 内部重写

#### `C5` 新增 `scripts/prepare-vendor-runtime.mjs`

- what changes：把运行时需要的 workspace 产物复制或编译到 `vendor/modules/`，并回写 `vendor/manifest.json`
- likely files：`scripts/prepare-vendor-runtime.mjs`、`scripts/build.ts`、可能的 package-specific build helpers
- verify：删除 staging 包内的 `packages/` 目录后，CLI 发布态仍能启动目标路径
- dependencies / blockers：依赖 `C4` 的依赖盘点结果
- required sync surfaces：`ci-verify.yml`、smoke 脚本、手动发布文档
- scope note：不把 `packages/*` 原样镜像到发布包，只带运行时必需产物

#### `D3` 保持 upstream merge 边界稳定

- what changes：在实施过程中显式限制 `D-lite` 只修改 `bin/`、`vendor/`、发布脚本、文档和 workflow
- likely files：实施任务单、`harness/state.md`、PR 描述模板或阶段说明
- verify：阶段 diff 不出现 `src/` / `packages/` 大规模搬迁
- dependencies / blockers：无
- required sync surfaces：状态文件、review 口径
- scope note：这是范围约束任务，防止结构迁移漂移

### Phase `R4`：单包 smoke / CI / release 切换

#### `C6` 新增单包 smoke 套件

- what changes：补三类 smoke：staging 验证、tarball 安装验证、registry 安装验证；同时补 vendor/runtime 缺失与校验失败场景
- likely files：`scripts/smoke-single-package-npm.mjs`、`scripts/smoke-single-package-npm-install.mjs`、`scripts/smoke-single-package-npm-registry.mjs`
- verify：本地与 CI 都能覆盖官方 registry / mirror-like registry / tarball 三条消费者路径
- dependencies / blockers：依赖 `C3` 与 `C5` 已具备最小可运行链路
- required sync surfaces：`package.json` scripts、`docs/release/release-gate.md`、`docs/release/github-actions-release-plan.md`
- scope note：旧三包 smoke 已在 `R5` 删除，后续只维护单包 smoke

#### `D4` 调整 workflow 与门禁顺序

- what changes：把 `release-npm.yml` 从“三包组装 -> 三包 smoke -> 三包发布”切到“单包组装 -> 单包 smoke -> 单包发布”；GitHub Release 资产仍可保留双架构二进制
- likely files：`.github/workflows/release-npm.yml`、`.github/workflows/ci-verify.yml`、`scripts/publish-single-package-npm-tarball.mjs`
- verify：workflow dry-run 可通过；`publish_to_npm=false` 时仍能独立补跑 registry smoke
- dependencies / blockers：依赖单包 smoke 已成形；切换完成后不再保留旧链路 fallback
- required sync surfaces：release gate、手动发布指南、history/state
- scope note：切换 job 编排，不同时触发 repo 结构大改

### Phase `R5`：默认发布切换与旧三包清理

#### `C7` 切换默认发布主链

- what changes：将单包链路设为默认发布路径，旧三包链路降级为历史记录
- likely files：`.github/workflows/release-npm.yml`、`docs/release/release-gate.md`、`docs/release/npm-manual-release-guide.md`
- verify：正式发布后，fresh install 不再依赖架构子包；`npm view gclm-code` 与真实全局安装均正常
- dependencies / blockers：依赖 `R4` 全部 smoke 稳定
- required sync surfaces：README、docs、roadmap、harness
- scope note：当前已完成切换；后续只保留 history 级别记录

#### `C8` 清理旧三包耦合

- what changes：删除 `optionalDependencies` 运行时耦合、三包专属 smoke、三包发布顺序逻辑；保留必要的历史文档或迁移说明
- likely files：`scripts/prepare-mac-binary-npm.mjs`、`scripts/pack-mac-binary-npm.mjs`、`scripts/smoke-mac-binary-npm*.mjs`、`scripts/lib/mac-binary-npm.mjs`、`package.json`、发布文档
- verify：仓库内不再存在“根包运行时依赖子包”主链；文档与 workflow 全部指向单包模型
- dependencies / blockers：依赖 `C7` 已稳定一段时间
- required sync surfaces：`docs/release/github-actions-release-plan.md`、`harness/history.md`、`harness/state.md`
- scope note：这是收口任务，不在前几个 phase 提前做

## 7. 推荐实施顺序

1. 先做 `R1`：把单包 staging、`bin/gc.js`、`vendor/manifest.json` 骨架跑通
2. 再做 `R2`：把当前平台 runtime 真正落到 `vendor/runtime/`
3. 再做 `R3`：把 workspace 运行时产物折叠进 `vendor/modules/`
4. 再做 `R4`：补单包 smoke，并让 CI / release workflow 可并行验证新旧两条链
5. 最后做 `R5`：切换默认发布并清理旧三包链路（已完成）

## 8. 每个 Phase 的完成定义

### `R1` 完成定义

- 能生成单包 staging 目录
- `npm pack` 只打入 `bin/`、`vendor/`、`README.md`
- `bin/gc.js` 能读取 `vendor/manifest.json`

### `R2` 完成定义

- 安装脚本可把当前平台 runtime 写入 `vendor/runtime/`
- 下载源、sha、失败提示全部可验证
- 不再依赖子包解析主程序本体

### `R3` 完成定义

- 发布态 CLI 启动不再依赖 `packages/*` 原始目录
- `vendor/modules/` 已覆盖运行时需要的 workspace 产物
- 删除 staging 包内 `packages/` 后，smoke 仍通过

### `R4` 完成定义

- 单包 tarball install smoke 通过
- 单包 registry smoke 通过
- mirror-like install 不再复现“缺架构子包”故障
- workflow 可以在不实际发布 npm 的情况下独立补跑 smoke

### `R5` 完成定义

- 单包成为默认发布主链
- 三包路径只保留 history 级记录
- `package.json` / docs / workflow / harness 口径完全一致

## 9. 进入 Build 前的首选起手式

推荐直接从 `R1` 开始，顺序如下：

1. 新增 `scripts/prepare-single-package-npm.mjs`
2. 新增 `scripts/lib/single-package-npm.mjs`
3. 新增或生成发布态 `bin/gc.js`
4. 先产出最小 `vendor/manifest.json`
5. 补一个只验证 staging + `npm pack` 的最小 smoke

这样能最快把“单包消费者边界”从文档变成可跑的实物，再进入 runtime 下载和 workspace 物化。
