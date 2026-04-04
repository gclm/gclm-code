# Gclm Code

Gclm Code 是面向团队交付的命令行 AI 编码助手。
项目在能力盘点和工程策略上参考了 `free-code` 项目实践，但当前代码线独立维护，发布与验收流程以本仓库为准。

## 项目定位

- 品牌与发行：统一为 `Gclm / Gclm Code`，npm 包名为 `@gclm/gclm-code`
- 接入策略：客户端走 `ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY`，协议转换下沉网关
- 模型发现：优先从网关 `/models` 动态获取，并支持缓存与错误语义提示
- 验收门禁：以 `verify + smoke` 为发布前标准回归链路

## 安装

### npm 安装（推荐）

```bash
npm i -g @gclm/gclm-code
```

安装后可用命令：

```bash
gc
```

兼容入口（保留）：

```bash
claude
```

### 源码运行（开发）

```bash
bun install
bun run build
./cli
```

## 快速使用

```bash
# 交互模式
gc

# 一次性执行
gc -p "帮我分析当前目录结构"

# 指定模型
gc --model claude-sonnet-4-6

# 登录配置入口
gc /login
```

## 网关配置约定

在 `/login` 平台配置流程里输入：

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_KEY`

模型发现端点映射规则：

- `http://host` -> `http://host/v1/models`
- `http://host/vN` -> `http://host/vN/models`

## 验收与回归

```bash
# 构建与品牌守卫
bun run verify

# 分层包回归（core/gui/gateway）
bun run smoke:packages

# 登录网关路径回归矩阵
SMOKE_GATEWAY_BASE_URL="http://localhost:8086/v1" \
SMOKE_GATEWAY_API_KEY="<your-key>" \
bun run smoke:login-gateway:matrix
```

## 发布说明

手动发版前请先执行 release gate：

- `docs/release/release-gate.md`

本项目当前以手动发布为主，PR 不是发布前置条件。

## 文档索引

- 总索引：`docs/README.md`
- 阶段路线：`docs/overview/roadmap.md`
- 网关验收：`docs/release/gateway-smoke-and-login.md`
- 发版门禁：`docs/release/release-gate.md`
- npm 手动发布：`docs/release/npm-manual-release-guide.md`

## 说明

`install.sh` 仍保留为源码安装路径的辅助脚本。
面向终端用户的默认安装方式仍建议使用 npm 全局安装。
