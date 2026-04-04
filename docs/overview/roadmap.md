# 路线图

更新时间：2026-04-04

## 总体结论

当前仓库已经越过“初始可发布化”阶段，进入“内核语义收口”阶段。

接下来的工作顺序改为务实版实施路径：

1. `M1`：优先实现 `/models` 动态模型发现（含缓存/TTL/降级）
2. `M2`：网关优先接入（客户端统一 anthropic-compatible，不再扩展 openai 协议适配）
3. `M3`：`anthropic-compatible` 能力补强（保持现有可用路径，不做重构）
4. `M4`：收尾清理（删除重复分支、回写文档、稳定验证）

策略约束：

- 不再继续扩展“Phase A 抽象先行”路径
- 保留当前“无兼容层”策略，断点直接修复

## Phase 0：已完成的基础收口

状态：`已完成 / 基本完成`

目标：建立可发布、可构建、可继续定制的基线。

已完成内容：

- npm 包名、`bin` 与 `publishConfig` 已配置完成
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

状态：`当前进行中`

目标：让第三方 provider 模型列表从静态枚举切到动态优先。

范围：

- 以 `openai-compatible` 为第一落点
- 复用现有 `additionalModelOptionsCache` 接口先打通最小路径
- 增加缓存、TTL、失败降级

验收：

- 第三方模型列表可动态刷新
- 网络失败不阻断模型选择流程
- `bun run verify` 通过

## M2：网关优先接入

状态：`当前进行中`

目标：客户端只保留 anthropic-compatible 主链，协议切换下沉网关。

策略：

- 客户端统一通过 `ANTHROPIC_BASE_URL` 对接网关
- 不再继续扩展客户端 openai 协议适配层
- `/models` 由网关聚合返回（支持 `/models` 与 `/v1/models`）

验收：

- 客户端不再承担 openai 协议转换
- 网关可对接多上游并对客户端暴露统一能力
- `bun run verify` 通过

## M3：`anthropic-compatible` 补强

状态：`待开始`

目标：在当前可用能力基础上做一致性补强，不做大重构。

范围：

- 保持 `ANTHROPIC_BASE_URL` 现有路径
- 补齐模型发现与诊断一致性
- 与 M2 的错误分类策略对齐

验收：

- `~/.claude/settings.json + ANTHROPIC_BASE_URL` 路径持续可用
- 模型发现与诊断输出一致
- `bun run verify` 通过

## M4：收尾清理

状态：`待开始`

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

- 已删除 `src/utils/telemetry/bigqueryExporter.ts` 这类无引用孤岛旧实现
- 已将 `src/services/analytics/metadata.ts` 迁移为中性的 `src/services/toolLogging/metadata.ts`
- 已完成对应使用点迁移，并通过 `bun run verify`
- 已完成 `src/services/analytics/index.ts` 类型边界中性化，统一收口为 `SafeEventValue / PiiEventValue`
- 已确认本仓库当前策略为“不保留兼容层，直接修复断点”
- 已确认 `anthropic-compatible` 在当前系统中可通过 `ANTHROPIC_BASE_URL` 路径运行
- 已确认当前主要缺口转为网关能力对齐（模型聚合返回与错误语义）

## 当前推荐动作

- 推荐下一步：`build`
- 当前 build 目标：执行 `M2` 网关优先收口，保持客户端协议层最小化
