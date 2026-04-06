# Gateway Smoke 与登录验收

本文用于网关模式下的最小可交付验收，包含：
- 分层 smoke 如何跑
- 登录流程如何验收
- `login -> model -> logout` 串联 smoke 如何跑
- 常见失败如何定位

## 1. 环境要求

```bash
export SMOKE_GATEWAY_BASE_URL="http://localhost:8086"
export SMOKE_GATEWAY_API_KEY="<your-key>"
```

说明：
- 默认不需要设置环境变量。`smoke:login-gateway` / `smoke:login-gateway:matrix` 会直接 mock `/models` 请求
- 只有在你想验证真实网关时，才需要显式设置 `SMOKE_GATEWAY_BASE_URL` / `SMOKE_GATEWAY_API_KEY`
- 如果是 `http://host`，系统会自动拼接 ` /v1/models`
- 如果是 `http://host/vN`，系统会自动拼接 ` /models`
- `smoke:login-gateway` / `smoke:login-gateway:matrix` 会在临时 `CLAUDE_CONFIG_DIR` 下运行，不会污染真实 `~/.claude`

## 2. 分层 smoke 命令

```bash
bun run smoke:packages:core
bun run smoke:packages:gui
bun run smoke:packages:gateway
bun run smoke:packages
```

含义：
- `core`：本地基础包加载和关键导出校验
- `gui`：chrome/computer-use 相关包加载和工具构建校验
- `gateway`：网关模型发现端点校验
- `all`：按 core -> gui -> gateway 全量执行

## 3. 登录流程验收（平台模式）

在 CLI 中执行 `/login`，选择平台配置流程后输入：
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_KEY`

预期结果：
- 本地配置保存成功
- 自动触发模型刷新
- Model Picker 中能看到网关返回模型

可用命令做只读确认：

```bash
./gc auth status
```

## 4. CI 接入建议

`CI Verify` 已接入：
- `bun run smoke:packages:core`
- `bun run smoke:packages:gateway`

如果 CI 只验证 CLI 逻辑和本地副作用，可以直接使用默认 mock，不需要 Secrets。

只有在你希望 CI 命中真实网关时，才需要配置：
- `SMOKE_GATEWAY_BASE_URL`
- `SMOKE_GATEWAY_API_KEY`

## 5. 常见失败排查

1. `gateway` 步骤失败且返回 404

先检查 base URL 规则是否符合预期：
- `http://host` -> `http://host/v1/models`
- `http://host/v1` -> `http://host/v1/models`
- `http://host/v2` -> `http://host/v2/models`

2. `No models discovered`

说明端点返回结构不包含 `data[]` 或 `models[]` 或数组为空。

3. 登录后无模型

优先检查：
- `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY` 是否保存
- 网关是否允许该 key 访问 models
- 执行 `bun run smoke:packages:gateway` 验证网关最小链路

## 6. 错误语义回归（M3）

### 6.1 单用例

登录等效脚本 `bun run smoke:login-gateway` 支持错误语义断言：

```bash
SMOKE_GATEWAY_EXPECT_ERROR="404" bun run smoke:login-gateway
```

说明：
- 不设置 `SMOKE_GATEWAY_EXPECT_ERROR` 时，脚本校验成功发现并缓存模型
- 设置后，脚本要求 discovery 抛错，且错误消息包含指定关键字

### 6.2 矩阵用例（推荐）

统一回归命令：

```bash
bun run smoke:login-gateway:matrix
```

默认覆盖：
- 成功路径（base URL）
- 404 映射路径（`/v1/v1`）

可选扩展（按环境启用）：
- `SMOKE_GATEWAY_EXPECT_401_KEY`：无权限 key，校验 `401/403` 文案
- `SMOKE_GATEWAY_EXPECT_429_BASE_URL`：限流网关入口，校验 `429` 文案
- `SMOKE_GATEWAY_EXPECT_5XX_BASE_URL`：异常网关入口，校验 `Gateway is unavailable` 文案

## 7. 串联 smoke（login -> model -> logout）

新增脚本：

```bash
bun run smoke:login-gateway
bun run smoke:login-gateway:matrix
```

`bun run smoke:login-gateway` 会在一个临时 `CLAUDE_CONFIG_DIR` 中顺序验证：
- Gateway 配置成功写入 `settings.json`
- 交互式模型刷新在 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 下仍可执行
- provider flag 会在 Gateway 模式下被清掉
- 清理阶段会删除 `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`
- 无关 env 配置会被保留
- 默认情况下，模型接口由脚本内 mock transport 提供

`bun run smoke:login-gateway:matrix` 当前覆盖：
- 成功路径
- 404 路径映射错误

这组 smoke 的目标不是驱动完整 TUI，而是稳定验证这次改动涉及的三段核心副作用：
- 登录保存
- `/model` 前刷新
- 退出清理
