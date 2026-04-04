# GitHub Actions 自动发布方案（npm）

这份方案用于把 `gclm-code` 发布流程自动化。

## 目标

1. `push tag v*` 时自动发布到 npm `latest`
2. 自动执行构建验收（`bun run verify`）
3. 发布后自动给同版本打 `stable` tag（可选）

## 前置配置

1. 在 GitHub 仓库 Secrets 中添加：

- `NPM_TOKEN`

该 token 需要有发布 `gclm-code` 的权限。

2. npm 包权限：

- 包名：`gclm-code`
- 发布命令使用 `npm publish --access public --tag latest`

## 触发策略

推荐两条工作流：

1. `release.yml`:

- 触发：`push tags: v*`
- 行为：构建 + 发布到 npm latest

2. `ci.yml`（可选）:

- 触发：`push` 和 `pull_request`
- 行为：只做 `bun run verify`

## 发布步骤

发布 job 建议顺序：

1. checkout
2. setup bun
3. setup node（配置 npm registry）
4. `bun install --frozen-lockfile`
5. `bun run verify`
6. `npm publish --access public --tag latest`
7. 读取当前版本并打 `stable`（可选）

## 版本策略建议

1. 使用语义化版本号（`x.y.z`）
2. 用 git tag 驱动发布：

```bash
git tag v2.1.88
git push origin v2.1.88
```

3. 如果想分离 `latest` 与 `stable`，可将“打 stable tag”步骤拆到手动流程。

