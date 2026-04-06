# hello2cc 文档索引

更新时间：2026-04-07

这个目录集中放置当前项目里所有 hello2cc 相关文档，方便按“原理 -> 方案 -> 使用 -> 排障 -> 扩展”的顺序查阅。

推荐阅读顺序：

1. [capability-orchestration.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/hello2cc/capability-orchestration.md)
   - 解释 hello2cc 的原理，以及它为什么能让第三方模型更稳定地感知宿主能力
2. [gateway-integration-plan.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/hello2cc/gateway-integration-plan.md)
   - 说明为什么当前项目更适合深度集成，以及推荐模块边界和实施顺序
3. [gateway-lifecycle-sequence.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/hello2cc/gateway-lifecycle-sequence.md)
   - 用生命周期视角看 hello2cc 能力在 Gateway 主链里的挂点
4. [gateway-status-and-resume.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/hello2cc/gateway-status-and-resume.md)
   - 日常使用时先看这里，了解 `/status`、`/resume` 与 `hello2cc-state`，以及“当前项目长任务续跑演练”
5. [gateway-diagnostics.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/hello2cc/gateway-diagnostics.md)
   - 遇到“模型像没感知到能力”时的排查顺序
6. [plugin-vs-deep-integration.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/hello2cc/plugin-vs-deep-integration.md)
   - 对比插件式和深度集成式方案的取舍
7. [strategy-development.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/hello2cc/strategy-development.md)
   - 后续扩策略、调策略、写 declarative policy 时查看

当前项目的默认启用方式：

- 仓库级默认配置位于 [hello2cc.json](/Users/gclm/workspace/lab/ai/gclm-code/.claude/hello2cc.json)
- 该文件会被自动加载，不需要再把同一段内容重复写进主 `settings.json`
- 如果要重新生成推荐配置，可运行 `/hello2cc-init project`
- 当前先使用 `strategyProfile = "balanced"` 和 `qualityGateMode = "advisory"`，这样长任务会获得显式引导，但不会因为过早启用 strict gate 而增加误拦截

当前使用建议：

1. 正常开始任务，让 hello2cc 先捕获当前 session 的宿主能力面
2. 长任务中用 `/status` 看健康摘要，用 `/hello2cc` 看更细的人工排障视图
3. 中断后用 `/resume` 续跑，确认恢复提示里已经带回 team/worktree/intent/memory
4. 需要给 AI 或脚本消费时，再用 `/hello2cc json` 或 `/hello2cc both`
