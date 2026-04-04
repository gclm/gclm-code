# Release Gate（手动发版前必过清单）

本文定义手动发版前的最小放行门槛，目标是保证网关路径与本地组件回归稳定。

## 1. 必过命令（标准集）

```bash
bun run verify
bun run smoke:packages
SMOKE_GATEWAY_BASE_URL="http://localhost:8086" \
SMOKE_GATEWAY_API_KEY="<your-key>" \
bun run smoke:login-gateway:matrix
```

判定标准：
- 三条命令全部 `exit 0`
- `smoke:packages` 覆盖 core/gui/gateway 三层
- `smoke:login-gateway:matrix` 至少覆盖：
  - 登录网关成功路径（`discovered > 0`）
  - 404 错误语义路径（base URL 映射错误）

## 2. 网关配置核对

发版前确认：
- `SMOKE_GATEWAY_BASE_URL` 可访问
- `SMOKE_GATEWAY_API_KEY` 具备 `/models` 访问权限
- base URL 映射规则符合预期：
  - `http://host` -> `/v1/models`
  - `http://host/vN` -> `/models`

## 3. 错误语义扩展回归（可选）

`smoke:login-gateway:matrix` 支持按环境变量扩展错误场景：
- `SMOKE_GATEWAY_EXPECT_401_KEY`：无权限 key，校验 `401/403`
- `SMOKE_GATEWAY_EXPECT_429_BASE_URL`：限流入口，校验 `429`
- `SMOKE_GATEWAY_EXPECT_5XX_BASE_URL`：异常入口，校验 `Gateway is unavailable`

建议：
- 本地或预发环境至少启用 1 个扩展错误场景
- 生产发版窗口前执行完整矩阵

## 4. CI 环境核对

`CI Verify` 依赖以下 secrets：
- `SMOKE_GATEWAY_BASE_URL`
- `SMOKE_GATEWAY_API_KEY`

若 secrets 缺失，`smoke:packages:gateway` 将无法形成有效保护。

## 5. 发版执行建议（手动）

推荐顺序：
1. 执行本 gate 三条命令
2. 更新版本号（`npm version patch|minor|major`）
3. `npm publish --access public --tag latest`
4. 校验：

```bash
npm view @gclm/gclm-code version
npm dist-tag ls @gclm/gclm-code
```

## 6. 失败处置

- `verify` 失败：先修构建/品牌守卫问题，再重跑
- `smoke:packages` 失败：按 core/gui/gateway 子项定位
- `smoke:login-gateway:matrix` 失败：优先看失败用例名，再定位网关连通性、key 权限、模型响应结构
