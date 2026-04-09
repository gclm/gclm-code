# Profile 环境变量使用说明

更新时间：2026-04-09

## 概览

Gclm Code 内置了三组性能分析（profile）环境变量，用于在开发、调试和排查时观测内部行为。它们**默认全部关闭**，开启后只在本地日志或特定输出路径中产生数据，不影响模型调用或 API 行为。

## 环境变量列表

### `CLAUDE_CODE_PROFILE_MEMORY=1`

**用途**：会话级内存观测。

开启后在以下三个关键节点自动采集轻量内存快照：

| 节点 | 标签 | 意义 |
|------|------|------|
| 查询开始时 | `query-start` | 当前会话内存基线 |
| compact 完成后 | `post-compact` | 验证 compact 是否有效释放了内存 |
| 查询结束时 | `query-end` | 单次完整 query 的内存代价 |

**采集内容**：

- `heapUsed` / `heapTotal` / `rss` / `external` — 来自 `process.memoryUsage()`
- `messageCount` — 当前消息数组条数
- `toolUseResultCount` — 带有 toolUseResult 的消息数
- `toolUseResultBytesEst` — toolUseResult 序列化大小估算（字节）
- `compactBoundaryCount` — 累计 compact 次数

**输出位置**：

1. **日志告警** — 当 `heapUsed` 超过 1.5 GB 时自动 CRITICAL 警告；增长率超过 100 MB/hr 时 WARNING 提示
2. **`/status` 面板** — 新增 Memory 区块，显示当前内存、消息统计、增长趋势、峰值
3. **queryProfiler 报告** — `CLAUDE_CODE_PROFILE_QUERY=1` 时在报告末尾追加内存摘要
4. **transcript JSONL** — 每个 query turn 结束时写入一条 `memory-state` 类型行，崩溃后可从 transcript 重建内存增长曲线

**典型用途**：

```bash
# 开启内存观测后启动
CLAUDE_CODE_PROFILE_MEMORY=1 ./dist/gc

# 运行几轮对话后
# 1. /status 查看当前内存状态
# 2. 看到 WARNING 时考虑 /heapdump 或结束当前会话
# 3. 崩溃后解析 transcript：
#    jq -c 'select(."type" == "memory-state")' <session>.jsonl
```

**开销**：每次快照约 0.1-0.5ms（含 `JSON.stringify` 估算），对正常交互无明显影响。

---

### `CLAUDE_CODE_PROFILE_STARTUP=1`

**用途**：启动阶段性能分析。

采集从进程启动到第一个 UI 元素渲染完成各阶段的耗时和内存变化：

- `import_time` — 模块加载
- `init_time` — 初始化
- `settings_time` — 设置加载
- `total_time` — 总计

**输出位置**：

- 启动完成后写入 `~/.claude/startup-perf/<sessionId>.txt`
- Statsig 遥测（ant 用户 100%，外部用户 0.5% 采样）

**典型用途**：

```bash
# 分析冷启动性能
CLAUDE_CODE_PROFILE_STARTUP=1 ./dist/gc
cat ~/.claude/startup-perf/$(ls -t ~/.claude/startup-perf/ | head -1)
```

---

### `CLAUDE_CODE_PROFILE_QUERY=1`

**用途**：单次 query 管道性能分析。

测量从用户输入到首个 token 到达的完整链路，包含约 20 个检查点：

- 上下文加载
- 微压缩 / 自动压缩
- 工具 schema 构建
- 消息归一化
- API 客户端创建
- 网络 TTFB
- 工具执行

**输出内容**：

- 每个 checkpoint 的时间戳 + 内存快照
- TTFT 分解（预请求开销 vs 网络延迟）
- 阶段耗时 ASCII 柱状图
- 慢操作标记（>100ms SLOW，>1000ms VERY SLOW）

**输出位置**：

- `logForDebugging()` 写入 debug 日志

**典型用途**：

```bash
# 分析单次 query 延迟来源
CLAUDE_CODE_PROFILE_QUERY=1 ./dist/gc
# 在 debug 日志中查看完整报告
```

---

## 组合使用

| 场景 | 推荐组合 |
|------|----------|
| OOM 排查 | `CLAUDE_CODE_PROFILE_MEMORY=1` + `CLAUDE_CODE_PROFILE_QUERY=1` |
| 启动慢 | `CLAUDE_CODE_PROFILE_STARTUP=1` |
| 交互卡顿 | `CLAUDE_CODE_PROFILE_QUERY=1` |
| 长会话监控 | `CLAUDE_CODE_PROFILE_MEMORY=1` |
| 全面分析 | 三个全部开启 |

```bash
CLAUDE_CODE_PROFILE_MEMORY=1 CLAUDE_CODE_PROFILE_QUERY=1 CLAUDE_CODE_PROFILE_STARTUP=1 ./dist/gc
```

---

## 日志告警阈值

`CLAUDE_CODE_PROFILE_MEMORY` 内置三级告警：

| 级别 | 条件 | 行为 |
|------|------|------|
| INFO | `heapUsed > 1200 MB` | 日志输出当前状态摘要 |
| WARNING | 内存增长 `> 100 MB/hr`（持续 1 分钟以上） | 建议 `/heapdump` 或结束会话 |
| CRITICAL | `heapUsed > 1500 MB` | 建议立即 `/heapdump` 或重启会话 |

---

## Transcript 恢复

开启 `CLAUDE_CODE_PROFILE_MEMORY=1` 后，每个 query turn 结束时会在 transcript JSONL 中追加一行：

```json
{"type":"memory-state","sessionId":"...","snapshot":{"timestamp":1744185600000,"heapUsed":524288000,"heapTotal":1073741824,"rss":734003200,"external":41943040,"messageCount":1523,"toolUseResultCount":266,"toolUseResultBytesEst":856064,"compactBoundaryCount":1,"label":"query-end"}}
```

崩溃后可以用以下命令重建内存趋势：

```bash
jq -c 'select(."type" == "memory-state") | {ts: .snapshot.timestamp, heap: (.snapshot.heapUsed / 1048576 | floor), msgs: .snapshot.messageCount}' \
  ~/.claude/projects/<project-hash>/<session-id>.jsonl
```
