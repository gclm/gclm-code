# Gclm Code 文档索引

当前 `docs` 按主题分组，便于按阶段查看：分析、清理、发布、功能清单。

## 1. analysis（现状分析）

- `docs/analysis/free-code-main-feature-inventory.md`
  - `free-code-main` 当前能力盘点

## 2. cleanup（清理与改造执行）

- `docs/cleanup/telemetry-keep-delete-checklist.md`
  - 遥感/遥测保留与删除边界
- `docs/cleanup/telemetry-second-batch-checklist.md`
  - 第二批清理执行清单与进展

## 3. release（发布与交付）

- `docs/release/single-package-migration-proposal.md`
  - 单包发布、Vendor 运行时与发布边界收敛方案（记录迁移决策背景）
- `docs/release/single-package-implementation-plan.md`
  - 单包 + Vendor 运行时实施任务单与落地结果（`R1-R5` 已完成）
- `docs/release/npm-manual-release-guide.md`
  - 单包手动发布流程（staging + tarball + GitHub Release runtime assets）
- `docs/release/github-actions-release-plan.md`
  - GitHub Actions 自动发布设计（双 mac runner + 单包 smoke / publish）
- `docs/release/gateway-smoke-and-login.md`
  - 网关 smoke 与登录验收
- `docs/release/release-gate.md`
  - 当前发布门禁说明（single-package + vendor runtime）
- `docs/release/FEATURES.en.md`
  - 功能开关审计（英文）
- `docs/release/FEATURES.zh-CN.md`
  - 功能开关审计（中文对照）

## 4. overview（阶段路线）

- `docs/overview/roadmap.md`
  - 当前阶段状态与后续动作（功能侧持续维护，发布侧单包迁移已收口）

## 5. 过期文档处理说明

早期选型阶段文档已删除，仅保留当前执行相关材料。
