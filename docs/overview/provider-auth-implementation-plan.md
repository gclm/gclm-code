# Provider/Auth 实施计划（A-E）

更新时间：2026-04-04

## 目标对齐

本计划服务于以下目标：

1. 同时支持 Gclm OAuth 与 Codex OAuth 登录。
2. 支持 OpenAI-compatible / Anthropic-compatible 第三方请求。
3. 支持通过 `/models` 动态获取并刷新第三方模型列表。
4. 把 provider/auth 演进为可扩展抽象层，而不是继续堆 provider-specific 分支。

## Provider 能力矩阵（当前与目标）

| Provider 类型 | 当前主要认证 | 当前模型来源 | 目标认证形态 | 目标模型来源 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `firstParty` | API key / Gclm OAuth | 内建 + 配置缓存 | provider-aware AuthProfile | 动态优先 + 本地兜底 | `firstParty` 表示官方直连 Anthropic API |
| `openai`(Codex) | Codex OAuth | 静态为主 | provider-aware AuthProfile | 动态优先 + 本地兜底 | 需从“Codex专用”收敛到 compatible 抽象 |
| `openai-compatible` | 第三方 key/token（规划） | `/models`（规划） | 统一 compatible auth 策略 | `/models` 动态拉取 | Phase C/D 主目标 |
| `anthropic-compatible` | 第三方 key/token（规划） | `/models`（规划） | 统一 compatible auth 策略 | `/models` 动态拉取 | Phase C/D 主目标 |
| `bedrock` | AWS 凭证 | provider 适配 | 保持兼容不回归 | 保持兼容不回归 | 本阶段不扩展能力 |
| `vertex` | GCP 凭证 | provider 适配 | 保持兼容不回归 | 保持兼容不回归 | 本阶段不扩展能力 |
| `foundry` | API key / Azure AD | provider 适配 | 保持兼容不回归 | 保持兼容不回归 | 本阶段不扩展能力 |

## Phase A：统一 Provider/Auth 抽象骨架

目标：先收敛接口与重复逻辑，不改变已有业务行为。

实施项：

1. 抽出 first-party auth header 公共 helper（避免多处重复实现）。
2. 约定 provider descriptor / auth profile 的最小类型边界。
3. 在高重复模块先落地（`remoteManagedSettings`、`policyLimits`）。

验收标准：

1. 两个以上模块完成公共 helper 迁移。
2. 不引入 `getSettings()` 循环依赖。
3. `bun run verify` 通过。
4. 行为一致：无认证时继续返回明确错误，并保持 fail-open 策略。

## Phase B：OAuth 双链路稳定化（Claude + Codex）

目标：统一 OAuth 状态和诊断语义，保证两条登录链路稳定。

实施项：

1. 对齐 OAuth session 表达（source、refresh、失效处理）。
2. 对齐登录状态展示与错误分类。
3. 清理 provider-specific 的重复 OAuth 判定分支。

验收标准：

1. Gclm OAuth 登录、刷新、失效恢复可用。
2. Codex OAuth 登录、刷新、失效恢复可用。
3. 认证诊断不泄露 token/PII。
4. `bun run verify` 通过。

## Phase C：第三方兼容请求接入层

目标：接入统一 compatible 请求通路，摆脱“仅内建 provider”模式。

实施项：

1. 引入 `openai-compatible` 请求适配器。
2. 引入 `anthropic-compatible` 请求适配器。
3. 统一错误分类与重试/fallback 策略。

验收标准：

1. 各至少 1 个第三方 endpoint 可通。
2. 请求/流式响应路径可用。
3. 错误分类可区分 auth/model/rate-limit/schema。
4. `bun run verify` 通过。

## Phase D：`/models` 动态发现与刷新

目标：模型管理从静态枚举迁移到动态发现优先。

实施项：

1. 建立 `/models` 拉取 + 缓存 + TTL。
2. 建立失败降级（缓存/默认列表）策略。
3. 把模型选择入口切到统一发现层。

验收标准：

1. 第三方 provider 模型可动态刷新。
2. 网络失败可降级，不阻断核心流程。
3. 模型展示与实际可用性一致。
4. `bun run verify` 通过。

## Phase E：收尾清理与切换

目标：移除阶段性过渡代码，避免长期双轨维护。

实施项：

1. 删除废弃 provider-specific helper 和分叉路径。
2. 清理过时注释、历史命名、过渡 wiring。
3. 回写 roadmap/harness，形成最终交付文档。

验收标准：

1. 无重复认证入口。
2. 无无效兼容层。
3. 文档、代码、验证结论一致。
4. `bun run verify` 通过。
