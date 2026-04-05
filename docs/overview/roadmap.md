# 路线图

更新时间：2026-04-05

## 总体结论

当前仓库的功能侧 M1-M4 已完成，现进入新的 release `scope-refresh` 阶段。

接下来的工作顺序改为“功能持续维护 + 发布单包迁移”双轨，其中发布侧按以下顺序推进：

1. `R0`：单包 + vendor 运行时方案冻结（已完成）
2. `R1`：单包发布骨架 + `vendor/manifest.json`
3. `R2`：平台 runtime 落盘到 `vendor/runtime/`
4. `R3`：workspace 运行时物化到 `vendor/modules/`
5. `R4`：单包 smoke / CI / release 切换
6. `R5`：默认发布切换与旧三包清理

策略约束：

- 不再继续扩展“Phase A 抽象先行”路径
- 保留当前“无兼容层”策略，断点直接修复
- 发布态运行时只认 `bin/ + vendor/`
- `dist/` 只允许作为构建期 staging
- `C` 是关键路径，`D-lite` 只做发布边界收敛，不进入 repo 级结构迁移

## Release Scope Refresh：单包 + Vendor 运行时

状态：`R4 已完成，进入 R5 build`

目标：把当前发布默认路径稳定在“单消费者包 + vendor 运行时”，并清理旧三包遗留耦合。

范围：

- 对外 npm 安装入口收敛为一个 `gclm-code`
- 发布态 CLI 只认 `bin/gc.js` 与 `vendor/manifest.json`
- runtime 资产落到 `vendor/runtime/`
- workspace 运行时产物收敛到 `vendor/modules/`
- GitHub Release 仍可继续产出双架构 mac 二进制

非目标：

- 不做完整 `references/cli` 仓库结构迁移
- 不在本轮补 Linux / Windows
- 不把 repo 根 `package.json` 立即强制改造成消费者 manifest

当前推荐动作：

- 进入 `R5` build：清理旧三包脚本、旧 workflow 命名与历史文档耦合
- 详细任务单见 `docs/release/single-package-implementation-plan.md`

## Phase 0：已完成的基础收口

状态：`已完成 / 基本完成`

目标：建立可发布、可构建、可继续定制的基线。

已完成内容：

- npm 包名、CLI 入口与 release workflow 已配置完成
- `CI Verify` 工作流已落地
- `Release NPM` 工作流已落地
- 第二批 telemetry 清理中的多项“直接删除”已完成

## Phase 1：Runtime Config 语义迁移

状态：`已完成`

目标：把仍然活跃的运行时配置能力从 `analytics` 语义中拆出，避免后续架构继续背负“旧 telemetry 命名”。

任务：

- 新增 `src/services/runtimeConfig/` 中性边界
- 迁移 `growthbook` 的真实实现到中性目录
- 迁移 `analytics/config.ts` 到更中性的“非必要流量/遥测开关”判断模块
- 迁移 `sinkKillswitch` 到 runtime config 语义
- 删除旧 `analytics/*` 实现并直接修复调用点

验收：

- `bun run verify` 通过
- 新增实现不再以 `analytics` 作为真实语义归属
- 不保留兼容层，迁移后调用点全部直接落到新边界

## Phase 2：Provider 诊断命名清理

状态：`已完成`

目标：移除 `ForStatsig` 之类历史命名，让 provider 诊断字段回归中性语义。

任务：

- 在 provider 工具层新增中性命名 helper
- 更新 API logging / retry 中的调用点
- 移除新增统计平台耦合命名的入口

验收：

- API diagnostics 不再依赖 `ForStatsig` 命名
- `bun run verify` 通过

## M1：`/models` 动态模型发现

状态：`已完成（网关优先路径）`

目标：让第三方 provider 模型列表从静态枚举切到动态优先。

范围（已落地）：

- 模型发现切换为网关驱动（`ANTHROPIC_BASE_URL`）
- 复用 `additionalModelOptionsCache` 进行缓存
- 支持强制刷新与定时刷新
- 失败降级为不阻断模型选择主流程

验收（已达成）：

- 网关模型列表可动态刷新
- 网络失败不阻断模型选择流程
- `bun run verify` 通过

## M2：网关优先接入

状态：`已完成`

目标：客户端只保留 anthropic-compatible 主链，协议切换下沉网关。

策略（已落地）：

- 客户端统一通过 `ANTHROPIC_BASE_URL` 对接网关
- 不再继续扩展客户端 openai 协议适配层
- `/models` 由网关聚合返回，并按 base URL 自动映射：
  - `http://host` -> `/v1/models`
  - `http://host/vN` -> `/models`

验收（已达成）：

- 客户端不再承担 openai 协议转换
- 网关可对接多上游并对客户端暴露统一能力
- 已新增分层 smoke：
  - `bun run smoke:packages:core`
  - `bun run smoke:packages:gateway`
  - `bun run smoke:login-gateway`
- `CI Verify` 已接入 core + gateway smoke（gateway 依赖 secrets）
- `bun run verify` 通过

## M3：`anthropic-compatible` 补强

状态：`已完成`

目标：在当前可用能力基础上做一致性补强，不做大重构。

范围：

- 保持 `ANTHROPIC_BASE_URL` 现有路径
- 补齐模型发现与诊断一致性（已完成：错误语义映射、/login 直出错误、最近一次 discovery 诊断落盘并在 /status 可见）
- 与 M2 的错误分类策略对齐

验收：

- `~/.claude/settings.json + ANTHROPIC_BASE_URL` 路径持续可用
- 模型发现与诊断输出一致
- `bun run verify` 通过

## M4：收尾清理

状态：`已完成`

目标：确保新路径可维护，避免长期双轨。

范围：

- 删除重复分支/无效 wiring
- 清理与新路径冲突的过时文档
- 回写 harness 与 roadmap 的最终状态

验收：

- 无新增兼容层
- 文档与代码状态一致
- `bun run verify` 通过

## 最近进展

- M4 已完成：抽取 gateway models 共享 smoke helper，清理重复 endpoint/payload 解析逻辑
- smoke 脚本职责已收敛：`smoke` 负责基础可执行链路，`smoke:packages` 负责分层包能力，`smoke:login-gateway:matrix` 负责登录路径语义回归
- 文档与阶段状态已对齐当前实现


- 已删除 codex 相关能力与 wiring，并完成二次净化
- 登录流程已改为平台输入 `ANTHROPIC_BASE_URL/KEY` 并自动触发模型刷新
- 已合并 8 个本地 package 至根目录 `packages/*`
- 已新增并通过分层 smoke 与登录等效验收：
  - `smoke:packages:{core,gui,gateway,all}`
  - `smoke:login-gateway`
- 已补充运维文档：`docs/release/gateway-smoke-and-login.md`
- `R4` 已完成：
  - `release-npm` workflow 已切到单包主链：`package-single-npm -> smoke-tarball(matrix) -> smoke-registry(matrix) -> publish-release-assets -> publish-npm`
  - 当前 npm 默认只发布一个 `gclm-code`，GitHub Release 继续提供双架构 runtime 资产
  - 已新增单包 `pack / publish / tarball install / registry install` 脚本
  - 已让 `CI Verify` 增补单包 staging smoke 与 macOS single-package install/vendor smoke
  - 已在本机完成单包 tarball 安装、单包 registry 安装与 vendored modules 回归验证

## 当前推荐动作

- 推荐下一步：进入 `R5` build，清理旧三包脚本、旧文档与历史 workflow 名称
- 重点关注：在不动 `src/` / `packages/` 主结构的前提下，彻底收口发布层面的旧三包耦合
- 当前线上 release 主链已切到 `单包 + vendor runtime`，旧三包只保留为历史实现与待删除资产
- 仓库根 `package.json` 继续作为开发态 workspace manifest；消费者 manifest 在迁移窗口内允许先由 staging package 生成
