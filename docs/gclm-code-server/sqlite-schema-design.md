# `gclm-code-server` SQLite Schema / Migration 设计稿

更新时间：2026-04-07（v2 — 渠道全面长连接、webhook_idempotency 重命名、字段与 API v4 对齐）

## 变更记录

### v2 变更（2026-04-07）

1. **`webhook_idempotency` 重命名为 `channel_event_idempotency`**：全面长连接后不再有 HTTP webhook，该表职责从"webhook 防重放"变为"渠道长连接事件防重放"
2. **provider 枚举新增 `wecom`**：支持企业微信作为第三渠道
3. **字段命名与 API DTO v4 对齐**：`channel` -> `provider`，确保数据库字段与 API DTO 语义一致
4. **`channel_event_idempotency.key_source` 简化**：长连接 SDK 通常提供稳定 eventId，移除 `payload_hash_derived` 作为主要 key 来源

## 目的

本文基于以下设计继续向下收敛：

- [architecture.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/architecture.md)
- [module-design.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/module-design.md)
- [api-dto-design.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/api-dto-design.md)（v4）

目标是把一期 `SQLite` 控制面存储方案落实为可开发的数据模型，明确：

1. 第一阶段到底需要哪些表
2. 每张表承载什么事实
3. 哪些状态必须持久化，哪些不需要
4. migration 应该如何演进，避免后续 schema 漂移

本文不是最终 SQL 文件，但已经足够作为后续 `db/`、`repository/` 和 migration 开发的基准稿。

## 一句话结论

`gclm-code-server` 一期建议采用"嵌入式 `SQLite` + 显式 migration 文件"的控制面存储模型。

第一阶段建议落以下七张核心表：

1. `sessions`
2. `channel_identities`
3. `session_bindings`
4. `permission_requests`
5. `channel_event_idempotency`（原 `webhook_idempotency`）
6. `audit_events`
7. `schema_migrations`

推荐判断：

- `sessions` 是控制面的主对象
- `session_bindings` 负责渠道与 session 之间的恢复关系
- `permission_requests` 是飞书 / 钉钉 / 企业微信异步审批的关键状态源
- `channel_event_idempotency` 是长连接事件重放和卡片按钮重复点击去重的关键表
- `audit_events` 不做大而全审计仓，但要保留关键控制面事件

## 设计原则

### 1. `SQLite` 存的是控制面事实，不是运行时全文 transcript

一期 `SQLite` 负责的是：

- 会话元数据
- 用户 / 渠道 / session 绑定关系
- 待审批和审批结果
- 长连接事件幂等状态
- 关键审计事件

不建议一期把这些内容强行放进去：

- 大量 token 级输出流
- 完整 transcript 主存储
- 大体量检索索引
- 面向 BI 的分析型宽表

### 2. 先保证一致性，再谈抽象优雅

对控制面来说，最容易出事故的不是"表不够优雅"，而是：

- 用户点了审批，进程重启后丢状态
- 长连接重连后事件重放，导致重复创建 session
- Web 和飞书看到的会话状态不一致

所以一期的核心目标是：

- 状态可恢复
- 事件可去重
- session 可定位
- 审批可追溯

### 3. schema 要支持多渠道，但不被单一渠道绑架

我们这套 schema 要能容纳：

- Web
- Feishu
- DingTalk
- WeCom（企业微信）
- 后续更多渠道

因此表设计里应避免直接写死平台字段，例如：

- 不要在核心表里直接放 `feishu_open_id`
- 不要让 `dingtalk_user_id` 成为主键语义

统一做法是：

- 核心表存内部主键
- 平台标识通过 `provider + provider_user_id` 表达
- 渠道特有 payload 保留在 adapter 原始日志或 JSON 字段中

### 4. 一期 migration 必须显式可追踪

不建议：

- 启动时动态"看情况建表"
- 多处分散执行 `CREATE TABLE IF NOT EXISTS` 然后无人知道当前版本

建议：

- 单独维护 migration 目录
- 启动时读取 `schema_migrations`
- 按版本顺序执行一次性 migration
- 所有 schema 演进走追加 migration 文件

## 推荐目录

```text
src/gclm-code-server/
  db/
    client.ts
    sqlite.ts
    schema.ts
    migrations/
      0001_init.sql
      0002_add_channel_identities.sql
      0003_add_permission_scope.sql
```

## SQLite 连接与运行建议

### 文件位置

- 开发环境：`./.local/gclm-code-server/dev.db`
- 生产 / 部署环境：通过 `GCLM_CODE_SERVER_DB_PATH` 指定

### 建议 pragmas

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA busy_timeout = 5000;
```

## 主键与时间字段约定

- 主键：应用层生成字符串 ID，例如 `sess_`、`perm_`、`evt_`
- 时间：统一存 `TEXT` 格式的 ISO 8601 UTC 时间
- JSON 扩展字段：统一存 `TEXT`，内容为 JSON 字符串
- 布尔值：用 `INTEGER` 的 `0 / 1`

## 核心表设计

## 1. `sessions`

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT NOT NULL,
  project_id TEXT,
  workspace_id TEXT,
  owner_user_id TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  execution_session_ref TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_active_at TEXT,
  archived_at TEXT
);
```

### 索引

```sql
CREATE INDEX idx_sessions_owner_updated
  ON sessions(owner_user_id, updated_at DESC);

CREATE INDEX idx_sessions_status_updated
  ON sessions(status, updated_at DESC);

CREATE INDEX idx_sessions_project_updated
  ON sessions(project_id, updated_at DESC);
```

### 字段说明

- `status`: `creating/running/waiting_input/paused/completed/failed/archived`
- `source_channel`: `web/feishu/dingtalk/wecom/api`
- `execution_session_ref`: 指向执行面的底层 session 引用
- `metadata_json`: 非核心扩展字段

## 2. `channel_identities`

```sql
CREATE TABLE channel_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  tenant_scope TEXT NOT NULL DEFAULT '',
  tenant_id TEXT,
  display_name TEXT,
  profile_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX uq_channel_identities_provider_user_tenant
  ON channel_identities(provider, provider_user_id, tenant_scope);
```

### 字段说明

- `provider`: `web/feishu/dingtalk/wecom`
- `user_id`: 内部统一用户 ID
- `tenant_scope`: 用于稳定实现"空租户也可唯一"的约束
- `profile_json`: 只放轻量平台信息

## 3. `session_bindings`

```sql
CREATE TABLE session_bindings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  channel_identity_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  binding_type TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  last_message_id TEXT,
  last_active_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(channel_identity_id) REFERENCES channel_identities(id) ON DELETE CASCADE
);
```

### 索引

```sql
CREATE INDEX idx_session_bindings_session
  ON session_bindings(session_id, updated_at DESC);

CREATE INDEX idx_session_bindings_user_active
  ON session_bindings(user_id, updated_at DESC);

CREATE INDEX idx_session_bindings_identity_active
  ON session_bindings(channel_identity_id, updated_at DESC);

CREATE UNIQUE INDEX uq_session_bindings_identity_session
  ON session_bindings(channel_identity_id, session_id);
```

## 4. `permission_requests`

```sql
CREATE TABLE permission_requests (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_use_id TEXT NOT NULL,
  status TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'once',
  input_json TEXT NOT NULL,
  requested_by_provider TEXT,
  requested_by_user_id TEXT,
  resolved_by_provider TEXT,
  resolved_by TEXT,
  resolution_message TEXT,
  requested_at TEXT NOT NULL,
  expires_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

### 索引

```sql
CREATE INDEX idx_permission_requests_session_status
  ON permission_requests(session_id, status, requested_at DESC);

CREATE INDEX idx_permission_requests_status_expires
  ON permission_requests(status, expires_at);

CREATE UNIQUE INDEX uq_permission_requests_tool_use
  ON permission_requests(session_id, tool_use_id);
```

### 状态

- `pending` -> `approved` / `denied` / `expired` / `cancelled`

### v2 变更说明

- `requested_by_channel` -> `requested_by_provider`：与 API DTO v4 的 `provider` 字段对齐
- `resolution_channel` -> `resolved_by_provider`：同上，且改为 `resolved_by_*` 前缀更准确（表示谁操作的）

## 5. `channel_event_idempotency`

用途：

- 处理长连接重连后的事件重放
- 处理卡片按钮重复点击
- 作为防重放和短期去重的稳定事实源

```sql
CREATE TABLE channel_event_idempotency (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT,
  key_source TEXT NOT NULL,
  event_type TEXT,
  status TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT,
  response_snapshot_json TEXT
);
```

### 索引

```sql
CREATE UNIQUE INDEX uq_channel_event_idempotency_provider_key
  ON channel_event_idempotency(provider, idempotency_key);

CREATE INDEX idx_channel_event_idempotency_expires
  ON channel_event_idempotency(expires_at);
```

### 字段说明

- `provider`: `feishu/dingtalk/wecom`
- `idempotency_key`: 控制面的唯一幂等主键
- `key_source`: `event_id`、`action_id`、`token` 之一（长连接 SDK 通常提供稳定事件 ID）
- `payload_hash`: 保留原始 payload 摘要，便于审计与调试
- `response_snapshot_json`: 可缓存已处理结果的轻量摘要

### 状态

- `processing` -> `processed` / `ignored` / `rejected`

### v2 变更说明

- 原 `webhook_idempotency` 重命名：全面长连接后不再有 HTTP webhook
- `key_source` 移除 `payload_hash_derived`：长连接 SDK 通常提供 eventId/actionId，不需要 fallback 到 payload hash
- 其他字段和索引结构保持不变

## 6. `audit_events`

```sql
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  session_id TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  provider TEXT,
  request_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
);
```

### 索引

```sql
CREATE INDEX idx_audit_events_session_created
  ON audit_events(session_id, created_at DESC);

CREATE INDEX idx_audit_events_type_created
  ON audit_events(event_type, created_at DESC);
```

### v2 变更说明

- `channel` -> `provider`：与 API DTO v4 对齐

## 7. `schema_migrations`

```sql
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  checksum TEXT
);
```

## 推荐初始 migration

### `0001_init.sql`

包含：

1. `sessions`
2. `session_bindings`
3. `permission_requests`
4. `channel_event_idempotency`
5. `audit_events`
6. `schema_migrations`

### `0002_add_channel_identities.sql`

适用场景：开始需要跨渠道统一识别同一用户。

### `0003_add_permission_scope.sql`

适用场景：审批从 `once` 扩展为 `session` 级授权。

## Repository 边界建议

```text
sessions/sessionRepository.ts
sessions/sessionBindingRepository.ts
permissions/permissionRepository.ts
channels/shared/idempotencyRepository.ts
identity/channelIdentityRepository.ts
audit/auditRepository.ts
db/migrationRunner.ts
```

## 一期不建议建的表

- `stream_chunks`
- `session_messages`
- `tool_outputs`
- `channel_raw_payload_archive`
- `analytics_daily_rollups`

## 清理与归档策略

### 建议定期清理

- `channel_event_idempotency`：删除 `expires_at < now` 的旧记录
- `audit_events`：一期保留最近 30-90 天

### 不建议直接清理

- `sessions`
- `session_bindings`
- `permission_requests`

## 并发与事务建议

显式事务包裹以下操作：

1. 创建 session + 创建默认 binding
2. 创建 permission request + 写审计事件
3. 事件幂等登记 + 真正业务写入
4. 审批结果更新 + session 状态更新 + 审计写入
