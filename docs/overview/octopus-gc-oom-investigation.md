# Octopus 场景下 `gc` OOM 排查记录

更新时间：2026-04-09

## 结论先看

当前证据支持下面这组判断：

- 这次崩溃确实是 `node` / V8 自己的 OOM，不是“看起来像 OOM”。
- 问题主因仍在 `gc` 长会话的内存累积，不在 `octopus` 仓库体量，也不在构建脚本本身。
- 需要把此前假设修正成“两阶段”：
  - 第一次崩溃前，最强信号不是大文件编辑结果，而是隐藏的 `TaskUpdate` 消息风暴叠加长会话 UI 派生开销。
  - 崩溃恢复后，`FileEdit` / `FileWrite` 把完整 `originalFile` / `content` 挂在 `toolUseResult` 上，会继续放大内存，但它们不是第一次 OOM 的唯一前因。
- `Ghostty` 二分屏不是根因。它只是复现环境；`.ips` 证据支持的是 `gc` 自身进程撞上 V8 heap limit。
- `LocalAgentTask` 仍然有长期保留风险，但在这次第一次 OOM 里应降级为次级怀疑项，不再适合作为最主导解释。

这还是“高概率判断”，不是已经锁定到单行泄漏代码。

但至少到目前为止，可以比较确定：

- 主因不在 `octopus` 构建链路
- 主因也不像 transcript 文件落盘大小本身
- 主因更像 `gc` 长会话内消息对象的驻留和放大

## 复现背景

- 用户报告的问题发生在：`/Users/gclm/workspace/lab/ai/octopus`
- 终端环境：Ghostty 二分屏时更容易观察到问题
- 当前实际运行的不是 octopus 仓库里的本地 `gc`，而是全局安装命令：
  - `/Users/gclm/.local/state/fnm_multishells/.../bin/gc`
  - 版本：`1.0.4 (Gclm Code)`

## 现象与基线

已有崩溃信息显示：

- V8 heap 在崩溃前达到约 `4090-4104 MB`
- 末尾错误为 `Ineffective mark-compacts near heap limit`
- 本机 Node 默认 heap 上限约 `4288 MB`
- macOS `.ips` 崩溃报告时间为 `2026-04-08 18:21:52 +0800`

这说明问题不是“看起来像 OOM”，而是真的撞上了 Node 的 JS heap 上限。

## 新增证据：macOS 崩溃报告

直接崩溃证据来自：

- `/Users/gclm/Library/Logs/DiagnosticReports/node-2026-04-08-182156.ips`

里面的关键信息是：

- `procName: "node"`
- `signal: "SIGABRT"`
- 触发线程名：`"gc"`
- 栈里明确出现：
  - `node::OOMErrorHandler`
  - `v8::internal::V8::FatalProcessOutOfMemory`
  - `v8::internal::Heap::FatalProcessOutOfMemory`
  - `Builtins_ArrayPrototypePush`
- `coalitionName: "com.mitchellh.ghostty"`

这些信息支持两件事：

- 问题确实发生在 Ghostty 启动出来的 `gc` / `node` 进程里
- 但真正 abort 的原因是 Node/V8 OOM，而不是 Ghostty 特有崩溃

## 已排除项

### 1. 不是 octopus 仓库体量过大

对 `octopus` 仓库做过快速检查：

- 仓库体量约 `64M`
- 文件数约 `260`
- 仓库内未发现 `.jsonl`
- `.claude/settings.local.json` 仅 `228B`

这类规模本身不足以解释 `gc` 进程 4GB 级别的 JS heap。

### 2. 不是 transcript 落盘文件本身太大

目标会话目录：

- `~/.claude/projects/-Users-gclm-workspace-lab-ai-octopus/`

其中较大的会话文件：

- `82341c6d-ee94-4fab-9706-2bf2f633a442.jsonl`

这个文件的统计结果：

- 总行数：`2037`
- 总大小：`4,428,454 bytes`，约 `4.23 MB`
- 最大单行：`82,340 bytes`

代码里 transcript 读取还有 `100MB` 上限保护，所以“日志文件本身太大导致直接 OOM”的说法也不成立。

### 3. 不是 octopus 构建脚本直接把 gc TUI 编译坏了

已核对的事实：

- octopus `web` 侧是标准 `next dev / next build`
- 根脚本先前端构建，再 Go 打包
- 未发现会直接把 `gc` TUI 编译坏的异常链路

因此，构建命令最多只会“间接影响”运行过程，例如后台 watcher 改文件导致编辑冲突，不像这次 OOM 的主因。

## 日志证据

### 会话文件统计

针对 `82341c6d-ee94-4fab-9706-2bf2f633a442.jsonl` 的解析统计：

- `assistant` 记录：`1340`
- `user` 记录：`275`
- `hello2cc-state` 记录：`331`
- `hello2cc-state` 原始 JSONL 行总字节约：`1,549,959`
- `hello2cc-state.state` 负载总字节约：`1,521,824`
- 带 `toolUseResult` 的记录：`266`
- `toolUseResult` 序列化总字节约：`835,847`
- 带 `originalFile` 的 `toolUseResult`：`26`
- `originalFile` 总字节约：`253,671`

### 最大的几类 `toolUseResult`

把 `toolUseResult` 粗分后，能看到重对象主要来自下面几类：

- `fileEditLike`：`37` 条，约 `586,004 bytes`
- `fileReadLike`：`45` 条，约 `268,228 bytes`
- `bashLike`：`50` 条，约 `77,927 bytes`
- `planLike`：`1` 条，约 `12,356 bytes`

其中最值得注意的是文件编辑类结果，典型字段包括：

- `filePath`
- `oldString`
- `newString`
- `originalFile`
- `structuredPatch`
- `content`

也就是说，日志已经能直接证明：这类会话里会持续产出 20KB 到 80KB 级别的工具结果对象，而且其中不少还带着完整原文或 patch。

### 崩溃时点校准

把 `.ips` 崩溃时间与 transcript 对齐后，可以把“第一次 OOM 前”和“崩溃后恢复继续跑”的证据分开看：

- `.ips` 崩溃时间：`2026-04-08 18:21:52 +0800`
- 对应 transcript 最近时间点：约 `2026-04-08T10:21:49.253Z`
- 对应行号：约 `1286`
- transcript 在此之后直到 `2026-04-08T10:53:54.312Z` 才继续出现新消息

这说明：

- transcript 后半段那些更重的 `FileEdit` / `FileWrite` 结果，很多属于崩溃后的恢复阶段
- 不能直接拿它们去解释第一次 OOM

### 按“第一次 OOM 前”重算 transcript 体量

只统计到崩溃前，对应量级如下：

- `user`: `106`
- `assistant`: `1020`
- `system`: `4`
- `hello2cc-state`: `151`
- `file-history-snapshot`: `5`
- 崩溃前 `hello2cc-state` 原始 JSONL 行总字节约：`505,910 bytes`
- 崩溃前 `hello2cc-state.state` 负载总字节约：`493,075 bytes`
- 崩溃前 `user.toolUseResult`：
  - 条数：`103`
  - 总序列化字节：`227,850`
  - 其中 file-edit-like：`7` 条，约 `52,780 bytes`

这组数字说明：

- 第一次 OOM 前，`toolUseResult` 大对象已经存在，但量级还没有到“光靠 file edit retention 就足以解释 4GB heap”的程度
- 第一次 OOM 前，真正异常突出的信号来自消息数量和任务流事件密度

### 新增证据：`TaskUpdate` 风暴

这是本轮排查里最强的新线索。

只看第一次 OOM 前的 assistant tool use：

- `TaskUpdate`: `913`
- `Read`: `17`
- `Edit`: `7`
- `TaskCreate`: `7`
- `Grep`: `6`
- `Glob`: `6`
- `Agent`: `3`

其中最异常的是：

- `913` 条 `TaskUpdate` assistant 消息合计约 `649,051 bytes`
- 对应的 `user.toolUseResult` 里，TaskUpdate 结构化结果只有 `49` 条，总共约 `4,803 bytes`
- 最长连续同参数 streak 为 `858` 条
- 这一整段从 transcript line `429` 一直持续到 line `1286`
- 组合几乎全是同一个输入：
  - `taskId = "1"`
  - `status = "in_progress"`
- 仅这个组合就出现了 `864` 次

而且崩溃前最后几十条几乎全部都是：

- `TaskUpdate({ taskId: "1", status: "in_progress" })`

这比“仓库太大”或“文件编辑结果太大”更像一个具体触发器：

- 会话里存在一条很长的隐藏任务更新链
- 这些消息虽然 UI 不一定明显展示，但仍然被保存在 transcript / 消息数组里
- 后续归一化、分组、搜索、渲染链路仍然要处理它们

### 新增证据：`hello2cc-state` 会增长，但不像第一次 OOM 的主因

这条线也继续做了复核，因为它确实会持续写 transcript。

先说配置结论：

- `hello2cc` 的 repo 级 preset 是按 `cwd` 找 `<repo>/.claude/hello2cc.json`
- 当前仓库 `gclm-code` 有这个文件
- 但用户出问题的目录是 `/Users/gclm/workspace/lab/ai/octopus`
- `octopus` 下没有 `.claude/hello2cc.json`
- 用户级 `~/.claude/hello2cc/` 当前也是空的
- `~/.claude/settings.json` 里也没有单独的 `hello2cc` 配置块

这意味着：

- 在 `octopus` 那次会话里，不会自动吃到当前 `gclm-code` 仓库这份项目级 `hello2cc` preset
- 真正生效的主要是 getter 默认值：
  - `resumeSummaryStyle = detailed`
  - `strategyProfile = balanced`
  - `qualityGateMode = advisory`
  - `enableProviderPolicies = true`

再看体量和增长形态。

当前整份 transcript 里：

- `hello2cc-state` 共 `331` 条
- 原始 JSONL 行总字节约：`1,549,959 bytes`
- `state` 负载总字节约：`1,521,824 bytes`

但只看第一次 OOM 前：

- `hello2cc-state` 只有 `151` 条
- 原始 JSONL 行总字节约：`505,910 bytes`
- `state` 负载总字节约：`493,075 bytes`
- 最大单条约 `19,910 bytes`，出现在 transcript line `161`

更关键的是增长形态：

- 这 `151` 条 pre-crash `hello2cc-state` 全都不完全相同
- 没有出现像 `TaskUpdate(taskId=\"1\", status=\"in_progress\")` 那样的长串完全重复刷屏
- 最后一条 pre-crash `hello2cc-state` 只有约 `1,961 bytes`

代码侧也支持它不是最强嫌疑项：

- `hello2cc` 只会在三类节点写状态：
  - route guidance 构建后
  - tool success 后
  - tool failure 后
- `recentSuccesses` / `recentFailures` 还各自有 `MAX_MEMORY_RECORDS = 5` 上限
- transcript 恢复时，这些状态会落进单独的 `hello2ccStates` `Map`
- 它不是像 assistant / user message 那样直接并入主消息数组

所以更合理的判断是：

- `hello2cc-state` 的持续增长是真实存在的
- 它值得后续做 coalesce / debounce / “只在状态有实质变化时才落盘”
- 但就这次第一次 OOM 的证据强度来看，它不像根因
- 它更像次级噪音或小放大器，而不是当前最强主因

目前更强的主因，仍然是隐藏的 `TaskUpdate` 风暴叠加长会话消息驻留。

### 会话里确实发生过 compaction，但只有一次

该样本会话里检测到：

- `compact_boundary`：`1` 次

这说明：

- 会话不是完全没有 compact
- 但 compact 次数很少
- compact 之后的后半段长时间编辑，仍可能继续把新的大对象留在内存里

## 代码证据

### 1. REPL 会把消息常驻在内存里

当前主路径里，消息会保留在 REPL / QueryEngine 的会话状态中：

- `src/QueryEngine.ts`
- `src/screens/REPL.tsx`

其中 SDK 路径会在 `compact_boundary` 后裁剪 `mutableMessages`，但交互式 UI 仍会保留当前 compact 区间内的消息。

这里要补一个新的“日志对代码”的连接点：

- `TaskUpdateTool` 的 `renderToolUseMessage()` 直接返回 `null`
- 也就是说，它本来就属于“对用户隐藏”的工具使用消息
- 但 transcript 和消息数组并不会因为 UI 隐藏而跳过保留

这意味着：

- 用户即使没在界面上明显看到 900 多条任务更新
- 这些消息仍然会进入 REPL 的消息保留和后续派生链路

### 2. `toolUseResult` 原始对象会被保存在消息对象上

工具执行完成后，`createUserMessage()` 会把原始 `toolUseResult` 挂到 user message 上：

- `src/services/tools/toolExecution.ts`
- `src/utils/messages.ts`

这里有一个关键细节：

- API 发给模型的 `tool_result.content` 可以经过 persisted-output 替换，变成一个落盘引用
- 但 UI 内存里的 `message.toolUseResult` 仍然保留原始结果对象

这意味着：

- 发给模型的内容可以被瘦身
- 但前端 / TUI 内存未必同步变小

### 3. `normalizeMessages()` 会把 `toolUseResult` 继续挂到归一化后的 user 消息上

`normalizeMessages()` 在拆分用户消息时，会重新创建归一化消息，并继续附上 `toolUseResult`：

- `src/utils/messages.ts`

这不是深拷贝，但会让同一个大结果对象进入更多 UI 派生路径：

- 归一化
- 分组
- 搜索
- 工具结果渲染

换句话说，它扩大的是“引用传播面”，不一定是直接复制数据体积。

### 4. fullscreen / split-screen 路径不会主动瘦身 `toolUseResult`

fullscreen 下的消息渲染路径：

- `src/screens/REPL.tsx`
- `src/components/Messages.tsx`
- `src/components/VirtualMessageList.tsx`
- `src/hooks/useVirtualScroll.ts`

这里有两个关键信息：

- `useVirtualScroll()` 已经把 mounted item 上限压到 `300` 个，所以“屏幕上渲染太多行”不是主要问题
- 但 virtual scroll 只限制“挂载多少行”，不限制“会话里保留多少消息对象，也不瘦身 message.toolUseResult”

这意味着 Ghostty 二分屏更可能是“更容易触发 fullscreen / alt-screen 长会话路径”，而不是它本身制造了 4GB 内存。

### 5. 某些 UI 派生层会直接读取完整 `toolUseResult`

当前读取 `message.toolUseResult` 的路径包括：

- `Messages.tsx` 中的点击展开 / 搜索文本提取
- `UserToolSuccessMessage.tsx` 中的结果渲染
- `GroupedToolUseContent.tsx`
- `CollapsedReadSearchContent.tsx`

这些路径很多是“按需渲染”，不一定每次都会深度处理全部结果，但能说明：

- `toolUseResult` 被设计成 UI 常驻数据
- 不是“模型调用完就能立刻丢掉”的临时对象

### 6. `LocalAgentTask` 仍有风险，但不是这次第一次 OOM 的主导证据

这里需要修正此前的怀疑权重。

代码上看，`LocalAgentTask` 的确存在额外风险：

- `appendMessageToLocalAgent()` 会做 `messages: [...(task.messages ?? []), message]`
- `completeAgentTask()` / `failAgentTask()` / `killAsyncAgent()` 不会像 `LocalMainSessionTask` 那样在终态主动 trim 到最后一条
- `registerTask()` 在 resume/re-register 时还会保留已有 `messages`

但它不是“默认就无限长驻”的：

- 只有 `retain = true` 时，agent transcript 才会被 UI hold 住并持续 append
- `retain` 是通过 `enterTeammateView()` 打开的，也就是用户显式进入 teammate 视图时

而这次第一次 OOM 前的运行日志没有支持它是主路径：

- `hello2cc-state` 里没有看到 `viewingAgentTaskId`
- 没看到 `activeAgentTaskId`
- 没看到 `viewSelectionMode`
- 也没看到 `expandedView = "tasks"`
- 第一次 OOM 前真正的 `Agent` tool use 只有 `3` 次

因此更合理的表述是：

- `LocalAgentTask` 是一个真实的次级内存风险点
- 但第一次 OOM 的更强解释，还是隐藏 `TaskUpdate` 风暴加长会话消息派生

### 7. `/diff` 会再次缓存 patch，但不是主路径

`useTurnDiffs()` 会把 `structuredPatch` 重新积累到 `TurnDiff` 缓存里：

- `src/hooks/useTurnDiffs.ts`
- `src/components/diff/DiffDialog.tsx`

不过这条链路只在 `/diff` 弹窗时使用，因此更像次要放大器，不像这次 OOM 的主因。

## 关于 Ghostty 二分屏的判断

目前更合理的理解是：

- Ghostty 二分屏不是根因
- 它可能只是让 fullscreen 路径更稳定地被走到，或者让长时间交互更容易发生

现有代码里并没有看到“Ghostty split pane 专属的内存膨胀逻辑”。

更接近事实的说法应该是：

- 你在 Ghostty 二分屏里更容易复现
- 但问题核心仍是 `gc` 长会话内消息对象驻留，特别是大型 `toolUseResult`

## 当前最强假设

综合运行日志、崩溃报告和代码，当前更强的假设是：

1. 第一次 OOM 前，主线程已经积累了很长的消息链
2. 其中最异常的一段是隐藏的 `TaskUpdate` 风暴：
   - 大量 assistant `tool_use`
   - 同一个任务反复被写成同一个 `in_progress` 状态
   - 这些消息虽然用户不一定能看到，但仍会被会话内存保留
3. REPL / Messages / normalize / transcript search 等 UI 派生层会继续处理这些消息
4. 同期还存在一定量的大 `toolUseResult`，会进一步增加对象驻留
5. 第一次 OOM 之后，恢复阶段又叠加了更重的 `FileEdit` / `FileWrite` 成功结果保留，进一步放大后续内存压力
6. 最终整体把 Node 默认 heap 顶满

这个假设与现有证据是相容的，而且比“仓库大”“构建脚本坏了”“transcript 文件太大”更贴近事实。

## 还没有确认的点

下面这些还没有被直接证实：

- `TaskUpdate` 风暴究竟来自模型循环、流式转录策略，还是某条任务编排链路反复重发
- 是否存在某一处真正的“深拷贝放大”或“缓存未释放”代码，导致 600KB 到 1MB 级事件体量在内存里被放大到 GB 级
- 是否有 React Compiler / Ink 某个具体 memo 缓存把历史消息版本长期钉住
- 是否存在某些工具结果在 render path 内被重复派生成更大的中间结构

所以当前还不能把问题表述成“已经定位到某一行内存泄漏”。

## 当前更推荐的修复方向

### 方向 A：先给 `TaskUpdate` 做止血

这是本轮新增后，优先级最高的一刀。

最小可行做法：

- 对“重复写相同状态”的 `TaskUpdate` 直接返回 no-op / reject，而不是继续记一条成功更新
- 至少对连续相同输入做去重
- 对隐藏型任务更新消息做会话级 coalesce，而不是无限堆进 transcript / UI 消息数组

为什么它现在排第一：

- 这是第一次 OOM 前最强、最直接、最异常的运行日志信号
- 它比 file edit retention 更贴近第一次崩溃时点

### 方向 B：优先瘦身旧消息上的 `toolUseResult`

这依然值得做，但现在更适合排第二。

思路：

- 工具结果落盘或转成模型可见 preview 后
- 对 UI 消息上的 `toolUseResult` 做降采样
- 至少优先处理大对象类型：
  - 文件编辑结果
  - 文件写入结果
  - 大型读取结果
  - 超长 stdout/stderr

可以保留的字段更偏向 UI 所需最小集：

- `filePath`
- `type`
- `structuredPatch` 的摘要或裁剪版
- `originalFile` 只保留头部 / 尾部 / hash / size
- `content` 只保留 preview

### 方向 C：给 fullscreen 长会话增加更积极的内存边界

如果不想立刻动工具结果结构，可以考虑再加一层会话边界：

- compact 之后不仅裁消息区间
- 还对更早的 `toolUseResult` 做“冻结摘要化”

这样比单纯依赖 compact boundary 更稳。

### 方向 D：补专门的内存观测

目前日志能说明趋势，但不能直接告诉我们哪一类对象在 heap 里占最大头。

更稳妥的后续验证方式：

- 在长会话关键点打印 `process.memoryUsage()`
- 统计当前 `messages` 条数、带 `toolUseResult` 的消息数、文件编辑类结果数
- 对大 `toolUseResult` 做累计字节估算

这样能更快验证修复是否真的压住了内存增长。

## 不建议的结论

截至当前排查，不建议直接下这些结论：

- “是 octopus 构建脚本导致的”
- “是 transcript 文件太大导致的”
- “是 Ghostty 本身导致的”
- “已经定位到确定的内存泄漏代码行”

这些说法都比现有证据走得更远。

## 下一步建议

如果继续推进修复，优先顺序建议是：

1. 先给 `TaskUpdate` 加 no-op 防抖 / 去重 / transcript coalesce
2. 再对 `toolUseResult` 的保留策略做最小瘦身
3. 优先覆盖文件编辑 / 文件写入 / 大读取结果
4. 在 REPL 加一轮轻量内存观测，验证长会话增长是否明显下降
