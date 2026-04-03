# Gclm Code

Gclm Code 是基于 `free-code-main` 定制的命令行 AI 编码助手发行版。

当前版本重点：
- 品牌统一为 `Gclm / Gclm Code`
- 发布包名统一为 `@gclm/gclm-code`
- 命令入口支持 `gc`（主命令）与 `claude`（兼容命令）
- 验收标准统一为 `bun run verify`（即构建通过）

## 安装

### 1. npm 全局安装（推荐）

```bash
npm i -g @gclm/gclm-code
```

安装后可直接运行：

```bash
gc
```

兼容入口（保留）：

```bash
claude
```

### 2. 从源码运行（开发）

```bash
bun install
bun run build
./cli
```

## 常用命令

```bash
# 交互模式
gc

# 一次性执行
gc -p "帮我分析当前目录结构"

# 指定模型
gc --model claude-sonnet-4-6

# 登录
gc /login
```

## 验收与构建

```bash
# 当前项目统一验收命令
bun run verify

# 实际构建命令
bun run build
```

说明：当前我们将 `verify` 统一绑定到 `build`，用于快速确认本轮改动是否可交付。

## 自动升级（npm 发行）

默认升级源已调整为：
- `@gclm/gclm-code`

可选覆盖环境变量（非必需）：
- `GCLM_UPDATE_PACKAGE_URL`
- `GCLM_UPDATE_DOWNLOAD_BASE_URL`

不设置时将使用发行版默认值。

## 文档索引

- 功能开关（英文）: `docs/release/FEATURES.en.md`
- 功能开关（中文）: `docs/release/FEATURES.zh-CN.md`
- 手动发布流程: `docs/release/npm-manual-release-guide.md`
- GitHub Actions 发布方案: `docs/release/github-actions-release-plan.md`
- 文档总索引: `docs/README.md`

## install.sh 是否还需要

需要，定位为“源码安装脚本（可选）”：
- 适合需要从仓库构建最新版本的场景
- 不替代 npm 发布安装
- 已统一为 Gclm Code 品牌信息

如仅作为用户安装路径，优先使用 `npm i -g @gclm/gclm-code`。
