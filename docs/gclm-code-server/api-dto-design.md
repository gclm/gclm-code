# `gclm-code-server` API / DTO 设计稿

更新时间：2026-04-06

## 目的

本文基于以下两份设计继续向下细化：

- [gclm-code-server-architecture.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/architecture.md)
- [gclm-code-server-module-design.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/module-design.md)

目标是明确：

1. `gclm-code-server` 第一阶段应暴露哪些 API
2. 各 API 的请求 / 响应 DTO 如何定义
3. Web、飞书、后续钉钉如何复用同一套 contract

本文不是 OpenAPI 最终稿，但已经足够作为接口评审和后续开发拆任务的基础。

## 一句话结论

第一阶段建议把 `gclm-code-server` 的外部 contract 收敛成五组接口：

1. `Session API`
2. `Input / Control API`
3. `Stream API`
4. `Permission API`
5. `Channel API`

核心原则：

- Web 和各渠道不直接操作 `gclm-code`
- 所有入口统一通过 `gclm-code-server`
- session、permission、stream 语义保持统一

## 设计原则

### 1. API 面向控制面，不暴露执行细节

`gclm-code-server` 对外暴露的是：

- 会话
- 输入
- 输出流
- 审批
- 渠道事件

而不是：

- 内部子进程实现
- 底层 transport 细节
- `gclm-code` 内部执行栈

### 2. Web 和渠道共享领域 DTO

不同入口的外观可以不同，但底层 DTO 应尽量统一。

例如：

- Web 输入消息
- 飞书发来文本消息
- 钉钉发来文本消息

最终都应该落成统一的 `SessionInputRequest`。

### 3. 第一阶段先稳定 contract，不追求 DTO 过度泛化

不要一开始为未来所有渠道做超级抽象。

第一阶段只要保证：

- Web 能用
- 飞书能用
- 钉钉将来能接得进来

就足够。

## 统一领域模型

建议先统一以下核心 DTO。

## `UserIdentityDto`

```ts
type UserIdentityDto = {
  id: string
  provider: 'web' | 'feishu' | 'dingtalk' | 'system'
  providerUserId: string
  displayName?: string
  tenantId?: string
}
```

说明：

- 对内统一身份
- 渠道来源明确
- 便于审计和 session owner 绑定

## `SessionDto`

```ts
type SessionDto = {
  id: string
  status: 'creating' | 'running' | 'waiting_input' | 'paused' | 'completed' | 'failed' | 'archived'
  title?: string
  projectId?: string
  workspaceId?: string
  ownerUserId: string
  sourceChannel: 'web' | 'feishu' | 'dingtalk' | 'api'
  createdAt: string
  updatedAt: string
  lastActiveAt?: string
  metadata?: Record<string, unknown>
}
```

## `PermissionRequestDto`

```ts
type PermissionRequestDto = {
  id: string
  sessionId: string
  toolName: string
  toolUseId: string
  input: Record<string, unknown>
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled'
  scope?: 'once' | 'session'
  requestedAt: string
  expiresAt?: string
  resolvedAt?: string
  resolvedBy?: string
  resolutionMessage?: string
}
```

## `AuditEventDto`

```ts
type AuditEventDto = {
  id: string
  eventType: string
  sessionId?: string
  actorType: 'user' | 'channel' | 'system'
  actorId: string
  channel?: 'web' | 'feishu' | 'dingtalk'
  payload?: Record<string, unknown>
  createdAt: string
}
```

## Session API

## 1. 创建会话

### `POST /sessions`

用途：

- 新建 session
- 或根据策略恢复既有 session

### Request DTO

```ts
type CreateSessionRequest = {
  title?: string
  projectId?: string
  workspaceId?: string
  sourceChannel: 'web' | 'feishu' | 'dingtalk' | 'api'
  mode?: 'create' | 'resume_or_create'
  initialInput?: SessionInputContent[]
  metadata?: Record<string, unknown>
}
```

### Response DTO

```ts
type CreateSessionResponse = {
  session: SessionDto
  initialPermissionRequests?: PermissionRequestDto[]
}
```

### 说明

- `sourceChannel` 用于审计和默认策略
- `mode=resume_or_create` 方便飞书“继续最近会话”
- Web 侧如需连接参数，单独通过 `GET /sessions/:id/stream-info` 获取
- 通用创建接口不直接暴露 `wsUrl`，避免把 Web 专属传输细节带进所有渠道 contract

## 2. 列出会话

### `GET /sessions`

用途：

- Web session 列表
- 渠道恢复会话前查询上下文

### Query DTO

```ts
type ListSessionsQuery = {
  status?: 'running' | 'waiting_input' | 'completed' | 'failed' | 'archived'
  sourceChannel?: 'web' | 'feishu' | 'dingtalk' | 'api'
  limit?: number
  cursor?: string
}
```

### Response DTO

```ts
type ListSessionsResponse = {
  items: SessionDto[]
  nextCursor?: string
}
```

## 3. 获取会话详情

### `GET /sessions/:id`

### Response DTO

```ts
type GetSessionResponse = {
  session: SessionDto
  pendingPermissions: PermissionRequestDto[]
}
```

## 4. 获取流连接信息

### `GET /sessions/:id/stream-info`

用途：

- 为第一方 Web Console 提供连接所需参数
- 把 Web 专属 stream 连接信息从通用 session DTO 中拆开

### Response DTO

```ts
type GetSessionStreamInfoResponse = {
  transport: 'websocket'
  stream: {
    path: string
    token: string
    expiresAt: string
    tokenType: 'signed-ephemeral'
  }
}
```

说明：

- 第一阶段返回相对路径即可，由 Web 基于当前 server origin 组装
- 一期 token 建议定义为短 TTL 的签名令牌，不单独持久化，不承诺强撤销
- 如果后续需要“登出立即失效”“会话归档立即踢线”，再扩展独立 token revocation 模型
- 后续如要支持 SSE 或 channel relay，可在这里扩展 transport 类型，而不污染通用 session contract

## 5. 归档会话

### `POST /sessions/:id/archive`

### Response DTO

```ts
type ArchiveSessionResponse = {
  session: SessionDto
}
```

## Input / Control API

## `SessionInputContent`

建议统一输入内容模型：

```ts
type SessionInputContent =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'file'; fileId: string; name?: string }
```

第一阶段最小可用只实现 `text`。

## 1. 投递输入

### `POST /sessions/:id/input`

### Request DTO

```ts
type SendSessionInputRequest = {
  content: SessionInputContent[]
  clientRequestId?: string
  metadata?: Record<string, unknown>
}
```

### Response DTO

```ts
type SendSessionInputResponse = {
  accepted: true
  sessionId: string
  requestId: string
}
```

### 说明

- `clientRequestId` 用于客户端去重和幂等

## 2. 中断执行

### `POST /sessions/:id/interrupt`

### Request DTO

```ts
type InterruptSessionRequest = {
  reason?: string
}
```

### Response DTO

```ts
type InterruptSessionResponse = {
  accepted: true
  sessionId: string
}
```

## Stream API

建议第一阶段统一为 WebSocket。

## `WS /sessions/:id/stream`

### 事件封包

```ts
type StreamEnvelope =
  | { type: 'session.updated'; data: SessionDto }
  | { type: 'message.delta'; data: MessageDeltaEvent }
  | { type: 'message.completed'; data: MessageCompletedEvent }
  | { type: 'tool.progress'; data: ToolProgressEvent }
  | { type: 'permission.requested'; data: PermissionRequestDto }
  | { type: 'permission.resolved'; data: PermissionRequestDto }
  | { type: 'session.completed'; data: SessionCompletedEvent }
  | { type: 'session.failed'; data: SessionFailedEvent }
  | { type: 'heartbeat'; data: { ts: string } }
```

## `MessageDeltaEvent`

```ts
type MessageDeltaEvent = {
  sessionId: string
  messageId: string
  role: 'assistant'
  delta: string
  createdAt: string
}
```

## `MessageCompletedEvent`

```ts
type MessageCompletedEvent = {
  sessionId: string
  messageId: string
  role: 'assistant'
  text: string
  createdAt: string
}
```

## `ToolProgressEvent`

```ts
type ToolProgressEvent = {
  sessionId: string
  toolName: string
  toolUseId: string
  status: 'started' | 'running' | 'completed' | 'failed'
  summary?: string
  createdAt: string
}
```

## `SessionCompletedEvent`

```ts
type SessionCompletedEvent = {
  sessionId: string
  outcome: 'completed' | 'stopped'
  createdAt: string
}
```

## `SessionFailedEvent`

```ts
type SessionFailedEvent = {
  sessionId: string
  errorCode: string
  message: string
  createdAt: string
}
```

### 说明

- Web 可以直接消费这些事件
- Feishu / DingTalk adapter 也可以通过 server 内部统一事件流消费这些事件

## Permission API

## 1. 查询待审批项

### `GET /sessions/:id/permissions/pending`

### Response DTO

```ts
type ListPendingPermissionsResponse = {
  items: PermissionRequestDto[]
}
```

## 2. 回传审批结果

### `POST /sessions/:id/permission-response`

### Request DTO

```ts
type PermissionResponseRequest = {
  permissionRequestId: string
  decision: 'approve' | 'deny'
  scope?: 'once' | 'session'
  message?: string
}
```

### Response DTO

```ts
type PermissionResponseResponse = {
  accepted: true
  permission: PermissionRequestDto
}
```

### 说明

- `scope=session` 为后续“本会话内持续放行”预留
- 第一阶段可以只支持 `once`

## Channel API

渠道接口需要明确分成两层 DTO：

1. 平台原始 payload DTO
2. 控制面内部标准 DTO

前者只存在于 `channels/*` adapter 内部，后者才进入 `sessions`、`permissions`、`audit` 等控制面模块。

## 平台原始 DTO 示例

### `FeishuWebhookPayload`

```ts
type FeishuWebhookPayload = {
  schema?: string
  header?: Record<string, unknown>
  event?: Record<string, unknown>
}
```

### `FeishuCardActionPayload`

```ts
type FeishuCardActionPayload = {
  open_id?: string
  tenant_key?: string
  action?: Record<string, unknown>
  token?: string
}
```

这些对象用于：

- 验签
- 平台字段解析
- idempotency key 提取
- 原始 payload 审计留存

## 控制面标准 DTO

### `ChannelInboundEvent`

```ts
type ChannelInboundEvent = {
  provider: 'feishu' | 'dingtalk'
  eventId: string
  eventType: 'message.created' | 'session.resume' | 'unknown'
  providerUserId: string
  tenantId?: string
  sessionIdHint?: string
  text?: string
  rawRefId?: string
  receivedAt: string
}
```

### `ChannelActionCommand`

```ts
type ChannelActionCommand = {
  provider: 'feishu' | 'dingtalk'
  actionId: string
  actionType: 'permission_response' | 'open_session' | 'resume_session'
  providerUserId: string
  tenantId?: string
  sessionId?: string
  permissionRequestId?: string
  decision?: 'approve' | 'deny'
  rawRefId?: string
  receivedAt: string
}
```

## 1. 飞书事件入口

### `POST /channels/feishu/events`

用途：

- 接收飞书原始 webhook 或消息事件
- 在 adapter 内完成验签、去重、标准化

### Response DTO

```ts
type FeishuEventResponse = {
  accepted: true
  handledAs: 'new_session' | 'resume_session' | 'append_input' | 'ignored'
  sessionId?: string
}
```

## 2. 飞书动作回调

### `POST /channels/feishu/actions`

用途：

- 接收飞书卡片按钮点击
- 在 adapter 内转换成 `ChannelActionCommand`

### Response DTO

```ts
type FeishuActionResponse = {
  accepted: true
  sessionId?: string
}
```

## 3. 钉钉事件入口

### `POST /channels/dingtalk/events`

第一阶段先定义 contract，不要求立即实现。

### Request DTO

```ts
type DingTalkEventRequest = {
  eventId: string
  eventType: string
  corpId?: string
  user: {
    providerUserId: string
    displayName?: string
  }
  message?: {
    id: string
    type: 'text' | 'image' | 'file'
    text?: string
  }
  raw: Record<string, unknown>
}
```

### Response DTO

```ts
type DingTalkEventResponse = {
  accepted: true
  handledAs: 'new_session' | 'resume_session' | 'append_input' | 'ignored'
  sessionId?: string
}
```

## Web Console API 使用建议

Web Console 第一阶段建议只用下面这些接口：

1. `POST /sessions`
2. `GET /sessions`
3. `GET /sessions/:id`
4. `GET /sessions/:id/stream-info`
5. `POST /sessions/:id/input`
6. `POST /sessions/:id/interrupt`
7. `GET /sessions/:id/permissions/pending`
8. `POST /sessions/:id/permission-response`
9. `WS /sessions/:id/stream`

这样 Web 第一阶段就足够跑通：

- session list
- terminal 输出
- 输入消息
- 断线重连
- 简单权限审批

## 错误响应规范

建议所有 HTTP API 统一使用以下错误结构：

```ts
type ApiErrorResponse = {
  error: {
    code: string
    message: string
    requestId?: string
    details?: Record<string, unknown>
  }
}
```

常见错误码建议：

- `UNAUTHORIZED`
- `FORBIDDEN`
- `SESSION_NOT_FOUND`
- `PERMISSION_NOT_FOUND`
- `INVALID_REQUEST`
- `CONFLICT`
- `INTERNAL_ERROR`

## 幂等建议

第一阶段建议对下面两类请求支持幂等：

1. `POST /sessions`
   - 通过 `mode=resume_or_create` + 用户上下文控制重复创建
2. `POST /sessions/:id/input`
   - 通过 `clientRequestId` 去重

对渠道回调要求更强：

- `eventId`
- `actionId`
- `provider + payloadHash`

控制面需要统一定义 `idempotency_key` 的生成规则，并把它持久化到 `SQLite`。

建议规则：

1. 优先使用平台提供的稳定键，例如 `eventId`、`actionId`、`token`
2. 若平台未提供稳定键，则生成 `payloadHashDerivedKey`，并同样写入 `idempotency_key`
3. `payloadHash` 仍可作为辅助审计字段，但不再作为与 `idempotency_key` 平行的第二套主规则

这样才能覆盖：

- webhook 平台重复投递
- 进程重启后的重复点击
- 飞书 / 钉钉审批超时后的人为重试

## 鉴权建议

### Web

建议：

- 走第一方 Web 登录态
- server 统一解析 user identity

### 飞书 / 钉钉

建议：

- 由 channel adapter 校验平台签名
- 再映射到内部 `UserIdentityDto`

## DTO 与模块映射

建议落地到这些目录：

```text
src/gclm-code-server/
  sessions/dto.ts
  permissions/dto.ts
  channels/feishu/dto.ts
  channels/dingtalk/dto.ts
  web/dto.ts
  transport/events.ts
```

其中：

- 领域 DTO 尽量靠近领域模块
- Web 专属请求 DTO 放 `web/dto.ts`
- stream event DTO 放 `transport/events.ts`

## 第一阶段实现优先级

建议接口开发顺序为：

1. `POST /sessions`
2. `GET /sessions`
3. `POST /sessions/:id/input`
4. `WS /sessions/:id/stream`
5. `GET /sessions/:id/permissions/pending`
6. `POST /sessions/:id/permission-response`
7. `POST /channels/feishu/events`
8. `POST /channels/feishu/actions`

这样可以先跑通：

- Web 最小可用
- 飞书最小接入

## 最终建议

建议你把这份 API / DTO 设计作为下一轮开发评审的接口基线。

如果继续往下推进，最自然的后续文档是：

1. `gclm-code-server` Phase 1 开发任务拆解
2. `Web Console` 对接 contract 说明
3. `Feishu Adapter` 事件到内部 DTO 的映射稿
