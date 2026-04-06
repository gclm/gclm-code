# 路线图

更新时间：2026-04-06

## 总体结论

当前仓库已完成以下阶段：

- **功能侧**：M1-M4 已完成
- **发布侧**：从三包模型 → single-package + vendor runtime → bundled cli.js 方案，已完成迁移并验证通过
- **Telemetry 清理**：Phase 0-2 已完成，旧遥测、品牌文案已收口

当前发布主链路：

```bash
bun run release:npm
# 等价于: bun run build && bun run pack:npm && bun run smoke:npm
```

产出：`dist/npm-tarballs/gclm-code-<version>.tgz`（4 文件：cli.js + bin/claude.js + package.json + README.md）

## 当前推荐动作

- 持续维护功能侧与发布链路
- 关注 CI 集成与后续优化方向

## 已完成阶段

### Telemetry 清理（Phase 0-2）

- 第一批：旧产品埋点、问卷、事件字段建模删除
- 第二批：analytics inert 壳、plugin telemetry、growthbook 本地化改造
- Phase 1：runtime config 语义迁移（从 analytics 拆出）
- Phase 2：Provider 诊断命名清理

### 模型与网关（M1-M3）

- M1：`/models` 动态模型发现（网关驱动）
- M2：网关优先接入（客户端只保留 anthropic-compatible 主链）
- M3：anthropic-compatible 补强（错误语义映射、诊断一致性）

### 收尾清理（M4）

- 删除重复分支/无效 wiring
- 清理与新路径冲突的过时文档
- 回写 harness 与 roadmap 的最终状态

### 发布链路迁移

- R0-R5：single-package + vendor runtime 方案（已完成）
- npm bundle 方案：从 vendor runtime 迁移到 bundled cli.js（已完成）
  - npm 包内不再携带 src/tests/references
  - 以 bundled cli.js 作为主入口
  - `dependencies: {}`，仅保留 `optionalDependencies`（`@img/sharp-*`）

## 后续可优化项

1. CI 集成 — 把 `release:npm` 链路接入 GitHub Actions
2. `@img/sharp-*` 裁剪 — 当前保留全部 9 个平台，可按需裁剪
3. audio-capture / url-handler — 按需安装策略
