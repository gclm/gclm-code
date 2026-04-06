# `gclm-code-server` SQLite Schema / Migration 设计稿

更新时间：2026-04-06

## 目的

本文基于以下设计继续向下收敛：

- [gclm-code-server-architecture.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/architecture.md)
- [gclm-code-server-module-design.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/module-design.md)
- [gclm-code-server-api-dto-design.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/api-dto-design.md)

目标是把一期 `SQLite` 控制面存储方案落实为可开发的数据模型，明确：

1. 第一阶段到底需要哪些表
2. 每张表承载什么事实
3. 哪些状态必须持久化，哪些不需要
4. migration 应该如何演进，避免后续 schema 漂移

本文不是最终 SQL 文件，但已经足够作为后续 `db/`、`repository/` 和 migration 开发的基准稿。

## 一句话结论

`gclm-code-server` 一期建议采用“嵌入式 `SQLite` + 显式 migration 文件”的控制面存储模型。

第一阶段建议至少落以下六张核心表：

1. `sessions`
2. `session_bindings`
3. `permission_requests`
4. `webhook_idempotency`
5. `audit_events`
6. `schema_migrations`

第一阶段建议同时落地：

7. `channel_identities`

推荐判断：

- `sessions` 是控制面的主对象
- `session_bindings` 负责渠道与 session 之间的恢复关系
- `permission_requests` 是飞书 / 钉钉异步审批的关键状态源
- `webhook_idempotency` 是 webhook 防重放和重复点击去重的关键表
- `audit_events` 不做大而全审计仓，但要保留关键控制面事件

## 设计原则

### 1. `SQLite` 存的是控制面事实，不是运行时全文 transcript

一期 `SQLite` 负责的是：

- 会话元数据
- 用户 / 渠道 / session 绑定关系
- 待审批和审批结果
- webhook 幂等状态
- 关键审计事件

不建议一期把这些内容强行放进去：

- 大量 token 级输出流
- 完整 transcript 主存储
- 大体量检索索引
- 面向 BI 的分析型宽表

这些更适合继续留在现有执行面或后续独立日志系统。

### 2. 先保证一致性，再谈抽象优雅

对控制面来说，最容易出事故的不是“表不够优雅”，而是：

- 用户点了审批，进程重启后丢状态
- webhook 平台重试，导致重复创建 session
- Web 和飞书看到的会话状态不一致

所以一期的核心目标是：

- 状态可恢复
- 回调可去重
- session 可定位
- 审批可追溯

### 3. schema 要支持多渠道，但不被单一渠道绑架

我们这套 schema 要能容纳：

- Web
- Feishu
- DingTalk
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

- 启动时动态“看情况建表”
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

说明：

- `client.ts` 负责连接初始化和 pragmas
- `schema.ts` 负责当前代码侧表与索引常量
- `migrations/` 只放增量 migration 文件

## SQLite 连接与运行建议

### 文件位置

第一阶段建议使用明确的本地 db 文件，例如：

- 开发环境：`./.local/gclm-code-server/dev.db`
- 生产 / 部署环境：通过 `GCLM_CODE_SERVER_DB_PATH` 指定

不要默认写到随机临时目录，否则控制面状态没有意义。

### 建议 pragmas

建议启动后设置：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA busy_timeout = 5000;
```

推荐原因：

- `foreign_keys=ON` 避免绑定关系出现悬挂引用
- `WAL` 更适合读多写少、同时有 Web / webhook 读写的场景
- `busy_timeout` 可以减少短暂锁冲突导致的无意义失败

## 主键与时间字段约定

建议统一采用以下约定：

- 主键：应用层生成字符串 ID，例如 `sess_`、`perm_`、`evt_`
- 时间：统一存 `TEXT` 格式的 ISO 8601 UTC 时间
- JSON 扩展字段：统一存 `TEXT`，内容为 JSON 字符串
- 布尔值：用 `INTEGER` 的 `0 / 1`

这样做的原因是：

- 与 API DTO 对齐更直接
- 跨语言迁移成本低
- SQLite 下调试、导出和手工排查更方便

## 核心表设计

## 1. `sessions`

用途：

- 记录控制面视角的 session 元数据
- 提供 Web 列表、详情页、恢复入口的事实源
- 作为权限、审计、绑定的上游对象

### 建议字段

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

### 字段说明

- `id`: 控制面 session ID
- `status`: `creating/running/waiting_input/paused/completed/failed/archived`
- `execution_session_ref`: 指向执行面的底层 session 引用
- `metadata_json`: 非核心扩展字段，例如 UI 标题、轻量 session 标签

### 建议索引

```sql
CREATE INDEX idx_sessions_owner_updated
  ON sessions(owner_user_id, updated_at DESC);

CREATE INDEX idx_sessions_status_updated
  ON sessions(status, updated_at DESC);

CREATE INDEX idx_sessions_project_updated
  ON sessions(project_id, updated_at DESC);
```

### 设计说明

- `sessions` 不直接存平台用户 ID，避免被渠道耦合
- `execution_session_ref` 允许控制面和执行面保持弱耦合映射
- `archived_at` 独立存在，便于之后按归档时间清理

## 2. `channel_identities`

用途：

- 统一记录平台身份和内部身份映射
- 支撑同一个人跨 Web / Feishu / DingTalk 的身份归一

这张表应作为渠道身份事实源，一期就建议落地；否则 `session_bindings` 会被迫同时承担身份与上下文两种职责。

### 建议字段

```sql
CREATE TABLE channel_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  tenant_id TEXT,
  display_name TEXT,
  profile_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_user_id, COALESCE(tenant_id, ''))
);
```

### 实现注意

原生 SQLite 对表达式 `UNIQUE(provider, provider_user_id, COALESCE(...))` 支持不适合作为表级约束写法时，可退一步为：

- 增加 `tenant_scope TEXT NOT NULL DEFAULT ''`
- 用 `tenant_scope` 代替可空 `tenant_id` 参与唯一索引

更稳的落地方式如下：

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

### 设计说明

- `user_id` 是内部统一用户 ID
- `tenant_scope` 用于稳定实现“空租户也可唯一”的约束
- `profile_json` 只放轻量平台信息，不放大对象缓存

## 3. `session_bindings`

用途：

- 记录某个渠道身份与某个 session 的绑定关系
- 支撑“继续最近会话”“渠道恢复会话”“同一渠道多窗口进入”

### 建议字段

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

### 建议索引

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

### 字段说明

- `binding_type`: 例如 `owner`、`participant`、`channel-entry`
- `is_primary`: 某渠道下默认恢复入口
- `last_message_id`: 记录飞书或钉钉最近一次消息 / 卡片 ID，便于更新原消息

### 设计说明

- 这张表比 `channel_identities` 更偏会话上下文
- `channel_identities` 是身份事实源，`session_bindings` 只承接 session 上下文绑定
- `user_id` 在 `session_bindings` 中属于查询冗余字段，写入时必须与 `channel_identity_id` 所属用户保持一致

## 4. `permission_requests`

用途：

- 记录待审批和审批结果
- 作为飞书 / Web / 钉钉审批中心的单一事实源
- 进程重启后仍能恢复 pending permission

### 建议字段

```sql
CREATE TABLE permission_requests (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_use_id TEXT NOT NULL,
  status TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'once',
  input_json TEXT NOT NULL,
  requested_by_channel TEXT,
  requested_by_user_id TEXT,
  resolution_channel TEXT,
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

### 建议索引

```sql
CREATE INDEX idx_permission_requests_session_status
  ON permission_requests(session_id, status, requested_at DESC);

CREATE INDEX idx_permission_requests_status_expires
  ON permission_requests(status, expires_at);

CREATE UNIQUE INDEX uq_permission_requests_tool_use
  ON permission_requests(session_id, tool_use_id);
```

### 状态约束

建议 `status` 允许值：

- `pending`
- `approved`
- `denied`
- `expired`
- `cancelled`

### 设计说明

- `tool_use_id` 唯一索引非常关键，可防止同一个工具审批被重复插入
- `expires_at` 支撑后台定时任务做超时流转
- `scope` 一期可以只实装 `once`，但 schema 先给后续保留位

## 5. `webhook_idempotency`

用途：

- 处理 webhook 平台重复投递
- 处理卡片按钮重复点击
- 作为防重放和短期回调去重的稳定事实源

这是一期 `SQLite` 里非常重要但最容易被忽视的一张表。

### 建议字段

```sql
CREATE TABLE webhook_idempotency (
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

### 建议索引

```sql
CREATE UNIQUE INDEX uq_webhook_idempotency_provider_key
  ON webhook_idempotency(provider, idempotency_key);

CREATE INDEX idx_webhook_idempotency_expires
  ON webhook_idempotency(expires_at);
```

### 字段说明

- `idempotency_key`: 控制面的唯一幂等主键
- `key_source`: `event_id`、`action_id`、`token`、`payload_hash_derived` 之一
- `payload_hash`: 保留原始 payload 摘要，便于审计与调试
- `response_snapshot_json`: 如有需要，可缓存已处理结果的轻量摘要

### 状态建议

建议允许：

- `processing`
- `processed`
- `ignored`
- `rejected`

### 设计说明

- 这张表不是永久历史表，建议配合 TTL 清理
- `idempotency_key` 必须是控制面单一事实源；即使 key 来源于 payload hash，也应先归一成单一键再落表
- TTL 不要太短，至少覆盖平台重试窗口

## 6. `audit_events`

用途：

- 记录控制面关键事件
- 支撑审计、排查和后续告警

### 建议字段

```sql
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  session_id TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  channel TEXT,
  request_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
);
```

### 建议索引

```sql
CREATE INDEX idx_audit_events_session_created
  ON audit_events(session_id, created_at DESC);

CREATE INDEX idx_audit_events_type_created
  ON audit_events(event_type, created_at DESC);
```

### 设计说明

- `audit_events` 一期只保留关键事件，不追求完整访问日志
- `payload_json` 应控制体积，避免变成原始流量堆积表

## 7. `schema_migrations`

用途：

- 记录已执行 migration
- 保证 schema 演进可回放、可追踪

### 建议字段

```sql
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  checksum TEXT
);
```

### 设计说明

- `version` 建议使用 `0001`、`0002` 这种顺序号
- `checksum` 可用于检测 migration 文件是否被后改

## 推荐初始 migration

## `0001_init.sql`

建议至少包含：

1. `sessions`
2. `session_bindings`
3. `permission_requests`
4. `webhook_idempotency`
5. `audit_events`
6. `schema_migrations`

如果你希望一期把身份模型先简化，`channel_identities` 可以放在 `0002`。

## `0002_add_channel_identities.sql`

适用场景：

- 开始需要跨渠道统一识别同一用户
- 开始支持更稳定的 owner / tenant 映射

## `0003_add_permission_scope.sql`

适用场景：

- 当审批从 `once` 扩展为 `session` 级授权
- 或者开始支持批量审批策略

## 状态流转建议

## `sessions.status`

建议状态：

- `creating`
- `running`
- `waiting_input`
- `paused`
- `completed`
- `failed`
- `archived`

建议约束：

- `archived` 不等于物理删除
- `completed/failed` 后仍允许查询和恢复只读视图
- 只有治理任务才可做物理清理

## `permission_requests.status`

建议状态：

- `pending`
- `approved`
- `denied`
- `expired`
- `cancelled`

建议流转：

- 新建审批时进入 `pending`
- 用户点击允许进入 `approved`
- 用户点击拒绝进入 `denied`
- 定时清理命中过期进入 `expired`
- 会话结束或工具取消时可进入 `cancelled`

## `webhook_idempotency.status`

建议状态：

- `processing`
- `processed`
- `ignored`
- `rejected`

建议流转：

- 收到首个 webhook 时写入 `processing`
- 正常业务落库成功后置为 `processed`
- 重复请求命中幂等时可直接返回 `processed` 或 `ignored`
- 验签失败或非法请求置为 `rejected`

## Repository 边界建议

建议按表或按领域拆 repository，但不要出现 controller 直接写 SQL。

推荐拆法：

- `sessions/sessionRepository.ts`
- `sessions/sessionBindingRepository.ts`
- `permissions/permissionRepository.ts`
- `channels/idempotencyRepository.ts`
- `identity/channelIdentityRepository.ts`
- `audit/auditRepository.ts`
- `db/migrationRunner.ts`

## 一期不建议建的表

下面这些我建议先不要做，避免控制面过早膨胀：

- `stream_chunks`
- `session_messages`
- `tool_outputs`
- `channel_raw_payload_archive`
- `analytics_daily_rollups`

原因很简单：

- 这些都不是当前 Web + 飞书一期闭环的阻塞项
- 真要做，体量和 retention 策略都要重新设计

## 清理与归档策略

### 建议定期清理

- `webhook_idempotency`
  - 删除 `expires_at < now` 的旧记录
- `audit_events`
  - 一期先保留最近窗口，例如 30 到 90 天

### 不建议直接清理

- `sessions`
- `session_bindings`
- `permission_requests`

这些是一期远程能力最核心的恢复依据，除非后续明确有归档策略，否则不建议自动清空。

## 并发与事务建议

一期建议把下面几类写操作包在显式事务里：

1. 创建 session + 创建默认 binding
2. 创建 permission request + 写审计事件
3. webhook 幂等登记 + 真正业务写入
4. 审批结果更新 + session 状态更新 + 审计写入

推荐目标是：

- 幂等判断和主业务写入在一个事务里完成
- 避免“幂等表写了，但主业务没写成功”的半完成状态

## 风险与取舍

### 风险 1：过度设计身份模型

如果一开始就把组织、成员、角色、租户、项目 ACL 全做成完整数据库模型，会明显超出一期范围。

当前更合适的节奏是：

- 一期先把 `channel_identities` 做薄
- ACL 仍可先由上层策略服务或配置驱动
- 真到需要多租户复杂权限时再扩展

### 风险 2：把 `audit_events` 做成万能日志桶

如果任何请求都无差别塞进 `payload_json`，很快会让 SQLite 变成难以维护的大文件。

建议只保留关键事件，例如：

- session created
- session archived
- permission requested
- permission approved / denied
- webhook replay blocked

### 风险 3：把 transcript 也塞进 SQLite

这会让控制面职责迅速失焦。

当前建议仍然是：

- `SQLite` 存控制面状态
- transcript 继续沿用执行面已有方案或单独设计

## 最终建议

建议你把这篇文档作为 `gclm-code-server` 一期数据库设计基线。

当前我最推荐的实际落地顺序是：

1. 先实现 `0001_init.sql`
2. 先把 `sessions / channel_identities / session_bindings / permission_requests / webhook_idempotency` 跑通
3. `audit_events` 做轻量版本
4. 后续再按需要补 `permission scope`、TTL 清理与治理增强

如果你认可这份 schema 稿，下一步最自然的是继续补其中一个：

1. `0001_init.sql` 的具体 SQL 初稿
2. `repository` 接口与方法签名设计稿
