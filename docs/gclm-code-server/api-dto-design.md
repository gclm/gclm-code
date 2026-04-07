# `gclm-code-server` API / DTO 设计稿

更新时间：2026-04-07（v4 — 渠道全面长连接、移除 HTTP webhook、合并 health、错误响应加时间戳）

## 变更记录

### v4 变更（2026-04-07）

1. **渠道全面采用长连接**：飞书、钉钉、企业微信全部使用平台长连接（WebSocket）接收事件和卡片动作，不再暴露 HTTP webhook 端点
2. **移除 Channel HTTP API**：删除 `POST /api/v1/channels/feishu/events`、`POST /api/v1/channels/feishu/actions`、`POST /api/v1/channels/dingtalk/events` 等 HTTP 端点
3. **Channel Adapter 纯内部化**：渠道 adapter 作为 server 内部长连接客户端，不再暴露 HTTP 入口，只在 server 内部与 session/permission 模块交互
4. **认证渠道调整**：渠道认证由各 adapter 通过平台 SDK 长连接内置机制完成，不再需要 HTTP 签名校验
5. **合并 health 到 status**：`GET /health` 合并到 `GET /api/v1/status`，不再单独保留
6. **统一响应结构**：所有 API 统一为 `{ ok, data/error, timestamp }` 结构，成功和错误响应保持一致的外壳
7. **统一响应结构**：成功和错误响应统一为 `{ ok, data/error, timestamp }` 结构

### v3 变更（2026-04-07）

1. **路由按协议分组版本化**：HTTP API 用 `/api/v1/`，WebSocket 用 `/ws/v1/`
2. **认证授权采用 tlive 模式**：token + Bearer header / query param / cookie
3. **审批回传路由对齐实现**：requestId 在 URL path
4. **新增 PTY WebSocket 端点**：`WS /ws/v1/session/:id`
5. **双传输模式并存**：JSON 事件流给 IM/卡片渠道，PTY WebSocket 给 Web 终端

### v2 变更（2026-04-07）

- 初始版本化尝试，后续被 v3 替代

## 目的

本文基于以下设计继续向下细化：

- [architecture.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/architecture.md)
- [module-design.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/module-design.md)

参考项目：

- [references/tlive/core/internal/daemon/daemon.go](/Users/gclm/workspace/lab/ai/gclm-code/references/tlive/core/internal/daemon/daemon.go) — API 路由、认证中间件、PTY WebSocket
- [references/tlive/core/web/](/Users/gclm/workspace/lab/ai/gclm-code/references/tlive/core/web/) — 前端 API 消费方式

目标是明确：

1. `gclm-code-server` 第一阶段应暴露哪些 API
2. 各 API 的请求 / 响应 DTO 如何定义
3. Web、飞书、后续钉钉如何复用同一套 contract
4. PTY 终端通道与 JSON 事件通道如何并存
5. 认证授权如何统一

本文不是 OpenAPI 最终稿，但已经足够作为接口评审和后续开发拆任务的基础。

## 一句话结论

第一阶段建议把 `gclm-code-server` 的外部 contract 收敛成五组接口：

1. `Status API`（`/api/v1/status`）
2. `Session API`（`/api/v1/sessions`）
3. `Input / Control API`（`/api/v1/sessions/:id/input` 等）
4. `Stream API`（`/ws/v1/session/:id/stream`，JSON 事件流，面向 IM/卡片渠道）
5. `PTY WebSocket API`（`/ws/v1/session/:id`，面向 Web 终端，参考 tlive）
6. `Permission API`（`/api/v1/sessions/:id/permissions`）

渠道（飞书、钉钉、企业微信）全部使用平台长连接接收事件，不暴露 HTTP webhook 端点。渠道 adapter 作为 server 内部长连接客户端存在。

核心原则：

- Web 和各渠道不直接操作 `gclm-code`
- 所有入口统一通过 `gclm-code-server`
- session、permission、stream 语义保持统一
- Web 终端通过 PTY WS 获得原生终端体验
- IM/卡片渠道通过 JSON 事件流获得结构化数据
- 认证采用 tlive 模式：token + Bearer header / query param / cookie
- 渠道全面长连接：飞书、钉钉、企业微信通过平台 SDK 长连接接入，不暴露 HTTP webhook

## 设计原则

### 1. API 面向控制面，不暴露执行细节

`gclm-code-server` 对外暴露的是：

- 会话
- 输入
- 输出流（JSON 事件 + PTY 终端）
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

### 3. 双传输模式并存

参考 tlive 的 PTY WebSocket 模式，我们的 API 同时提供两种传输：

- **JSON 事件流**（`WS /ws/v1/session/:id/stream`）：结构化事件，适合 IM 卡片渲染
- **PTY WebSocket**（`WS /ws/v1/session/:id`）：原生终端数据，适合 Web 终端体验

两者共享同一套 session 和 permission 模型，只在传输层分开。

### 4. 按协议分组版本化

路由按协议类型分组，每组独立版本化：

- HTTP API -> `/api/v1/...`
- WebSocket -> `/ws/v1/...`

便于后续各协议独立演进。

### 5. 第一阶段先稳定 contract，不追求 DTO 过度泛化

不要一开始为未来所有渠道做超级抽象。

第一阶段只要保证：

- Web 能用
- 飞书能用
- 钉钉将来能接得进来

就足够。

## 认证授权

参考 tlive 的认证模式，采用 token-based 认证。

### Token 生成

- 服务启动时自动生成一个 access token
- 通过环境变量 `GCLM_CODE_SERVER_SIGNING_SECRET` 可指定固定 token
- 未指定时随机生成，并在启动日志中输出完整访问 URL（含 token）

### Token 传递方式

支持三种方式，优先级从高到低：

1. **Bearer header**：`Authorization: Bearer <token>`
2. **Query param**：`?token=<token>`
3. **Cookie**：`gclm_token=<token>`

所有 HTTP API 和 WebSocket 连接统一使用此认证机制。

### Cookie 持久化

当请求通过 query param `?token=xxx` 成功认证时，server 自动设置 cookie `gclm_token`，后续请求无需再带 token。

### 未授权响应

浏览器访问未认证时，返回带 token 输入框的 HTML 页面（参考 tlive 的 unauthorizedHTML），而不是裸 JSON 错误。

```
Accept: text/html -> 返回 HTML 页面（带输入框）
Accept: application/json -> 返回 JSON 错误 { error: { code: 'UNAUTHORIZED' } }
```

### WebSocket 认证

WebSocket 连接通过 query param `?token=xxx` 传递 token。

### 渠道认证

渠道（飞书、钉钉、企业微信）不经过 HTTP 端点，全部使用平台 SDK 长连接接入。长连接建立时由 SDK 内置机制完成认证，连接建立后事件天然可信。channel adapter 内部将平台用户映射到 `UserIdentityDto`。

### 本地开发模式

设置环境变量 `GCLM_CODE_SERVER_AUTH_ENABLED=false` 可跳过认证（仅限本地开发）。

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

## Status API

## 1. 服务状态

### `GET /api/v1/status`

统一的状态与健康检查端点，合并了原来的 `GET /health`。用于状态栏、健康诊断、监控探针。

不需要认证（方便负载均衡器和监控探针访问）。

### Response DTO

```ts
type StatusResponse = {
  ok: true
  service: 'gclm-code-server'
  status: 'running'
  uptime: number          // 秒
  sessions: number        // 活跃会话数
  version: string         // server 版本
  bridge?: {
    connected: boolean
  }
}
```

## Session API

## 1. 创建会话

### `POST /api/v1/sessions`

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
- `mode=resume_or_create` 方便飞书"继续最近会话"
- Web 侧如需连接参数，单独通过 `GET /api/v1/sessions/:id/stream-info` 获取
- 通用创建接口不直接暴露 `wsUrl`，避免把 Web 专属传输细节带进所有渠道 contract

## 2. 列出会话

### `GET /api/v1/sessions`

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
  nextCursor?: string     // 第一版可选，不强制实现
}
```

## 3. 获取会话详情

### `GET /api/v1/sessions/:id`

### Response DTO

```ts
type GetSessionResponse = {
  session: SessionDto
  pendingPermissions: PermissionRequestDto[]
}
```

## 4. 获取流连接信息

### `GET /api/v1/sessions/:id/stream-info`

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

## 5. 归档会话

### `POST /api/v1/sessions/:id/archive`

### Response DTO

```ts
type ArchiveSessionResponse = {
  session: SessionDto
}
```

## Input / Control API

## `SessionInputContent`

```ts
type SessionInputContent =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'file'; fileId: string; name?: string }
```

第一阶段最小可用只实现 `text`。

## 1. 投递输入

### `POST /api/v1/sessions/:id/input`

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
- 飞书、钉钉等渠道通过此接口投递消息
- Web 终端可通过此接口投递，也可通过 PTY WS 直接发送

## 2. 中断执行

### `POST /api/v1/sessions/:id/interrupt`

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

## Stream API（JSON 事件流）

面向 IM/卡片渠道。

## `WS /ws/v1/session/:id/stream`

需要先通过 `GET /api/v1/sessions/:id/stream-info` 获取 token，连接时带上 `?token=xxx`。

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

## PTY WebSocket API

参考 tlive 的 `WS /ws/session/:id` 设计，专门给 Web 终端使用。

## `WS /ws/v1/session/:id`

### 连接方式

通过 query param `?token=xxx` 传递 access token（统一认证 token，不是 stream-info 签发的临时 token）。

### 数据流

**Server -> Client**：

```ts
// 终端输出数据（文本 + ANSI 转义序列）
string | ArrayBuffer

// 控制消息（JSON）
{ type: 'exit'; code: number }
```

**Client -> Server**：

```ts
// 终端输入（原始文本，包含转义序列）
string

// 控制消息（JSON）
{ type: 'resize'; rows: number; cols: number }
```

### 说明

- 此端点是 tlive 前端 `terminal.js` 的直接对接点
- 支持 xterm.js 的原生 PTY 体验：输入、输出、resize、exit
- 第一版实现中，由于当前执行桥接是"每 turn 一个 CLI 子进程"模式，PTY WS 可以：
  - 把 streamHub 的 JSON 事件（`message.delta`、`message.completed`）转换为终端输出写入
  - 用户输入通过 `POST /api/v1/sessions/:id/input` 投递
  - 后续升级为真正 PTY 时，前端无需任何改动

### 与 JSON 事件流的关系

| 特性 | `WS /ws/v1/session/:id/stream` | `WS /ws/v1/session/:id` |
|---|---|---|
| 数据格式 | JSON 事件封包 | PTY 原始数据 + JSON 控制 |
| 目标消费者 | IM/卡片渠道、飞书 adapter | Web 终端 (xterm.js) |
| 输入方式 | 通过 HTTP API 投递 | 通过 WS 直发或 HTTP API |
| resize | 不支持 | 支持 |
| 断线重连 | 重新订阅 | 重新连接 + 状态恢复 |
| exit 处理 | `session.completed` 事件 | `{ type: 'exit', code }` |

两个端点共享：
- 同一套 session 模型
- 同一套 permission 模型
- 同一个认证 token 机制

## Permission API

## 1. 查询待审批项

### `GET /api/v1/sessions/:id/permissions/pending`

### Response DTO

```ts
type ListPendingPermissionsResponse = {
  items: PermissionRequestDto[]
}
```

## 2. 回传审批结果

### `POST /api/v1/sessions/:id/permissions/:requestId/respond`

注意：requestId 在 URL path 中，与实现代码一致。

### Request DTO

```ts
type ResolvePermissionRequest = {
  behavior: 'allow' | 'deny'
  updatedInput?: Record<string, unknown>   // allow 时可选
  message?: string                         // deny 时必填
}
```

### Response DTO

```ts
type ResolvePermissionResponse = {
  accepted: boolean
  requestId: string
  behavior: 'allow' | 'deny'
}
```

### 说明

- `behavior=allow` 时可附带 `updatedInput`，用于修正工具调用参数
- `behavior=deny` 时需要 `message` 说明拒绝原因
- 后续可扩展 `scope=session` 支持会话级持续放行

## Channel Adapter（纯内部，无 HTTP 端点）

所有渠道（飞书、钉钉、企业微信）全部使用平台长连接接收事件，不暴露 HTTP webhook 端点。

### 架构模式

```
平台 SDK 长连接 -> Channel Adapter（server 内部） -> sessions / permissions / audit
```

渠道 adapter 作为 server 启动时初始化的长连接客户端：
- 飞书：`@larksuiteoapi/node-sdk` 的 `WSClient` 长连接
- 钉钉：钉钉 Stream SDK 长连接
- 企业微信：企业微信回调长连接

### 为什么不需要 HTTP webhook

1. **所有目标渠道都支持长连接**：飞书、钉钉、企业微信都有 WebSocket/Stream 长连接 SDK
2. **无需公网入站能力**：不再需要域名、SSL 证书、端口暴露
3. **部署更简单**：本地开发、内网部署、NAT 后面都能直接跑
4. **无需 HTTP 签名校验**：长连接 SDK 内置认证，连接建立后天然可信
5. **无需幂等去重**：长连接是有序的，不存在 HTTP 重试导致的重复投递问题

### 内部标准 DTO

渠道 adapter 将平台原始事件转换为以下内部标准 DTO，然后传递给 session/permission 模块。

#### `ChannelInboundEvent`

```ts
type ChannelInboundEvent = {
  provider: 'feishu' | 'dingtalk' | 'wecom'
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

#### `ChannelActionCommand`

```ts
type ChannelActionCommand = {
  provider: 'feishu' | 'dingtalk' | 'wecom'
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

### 各渠道长连接配置

#### 飞书

```bash
GCLM_CODE_SERVER_FEISHU_ENABLED=true
GCLM_CODE_SERVER_FEISHU_APP_ID=cli_xxx
GCLM_CODE_SERVER_FEISHU_APP_SECRET=xxx
GCLM_CODE_SERVER_FEISHU_USE_LONG_CONNECTION=true
```

订阅事件：`im.message.receive_v1`、`card.action.trigger`

#### 钉钉（预留）

```bash
GCLM_CODE_SERVER_DINGTALK_ENABLED=false
GCLM_CODE_SERVER_DINGTALK_CLIENT_ID=xxx
GCLM_CODE_SERVER_DINGTALK_CLIENT_SECRET=xxx
```

#### 企业微信（预留）

```bash
GCLM_CODE_SERVER_WECOM_ENABLED=false
GCLM_CODE_SERVER_WECOM_CORPID=xxx
GCLM_CODE_SERVER_WECOM_SECRET=xxx
```

## Web Console API 使用建议

Web Console 第一阶段建议只用下面这些接口：

### 列表页（index.html）

1. `GET /api/v1/sessions` — 加载会话列表
2. `GET /api/v1/status` — 状态栏展示

### 终端页（terminal.html）

1. `GET /api/v1/sessions/:id` — 获取会话详情用于标题栏
2. `WS /ws/v1/session/:id?token=xxx` — PTY 终端连接
3. `POST /api/v1/sessions/:id/input` — 投递输入（备选通道）

### 控制操作

4. `POST /api/v1/sessions/:id/interrupt` — 中断执行
5. `GET /api/v1/sessions/:id/permissions/pending` — 查看待审批
6. `POST /api/v1/sessions/:id/permissions/:requestId/respond` — 审批操作

这样 Web 第一阶段就足够跑通：

- session list（暗色主题 + 卡片式布局，参考 tlive）
- terminal（xterm.js 原生终端体验，参考 tlive）
- 输入消息（WS 直发 + HTTP API 备选）
- 断线重连（token 重签发 + WS 重连）
- 简单权限审批

## 统一响应结构

所有 HTTP API（包括成功和错误）统一使用以下响应结构：

### 成功响应

```ts
type ApiSuccessResponse<T> = {
  ok: true
  data: T
  timestamp: string       // ISO 8601，响应生成的服务端时间
}
```

示例：

```json
{
  "ok": true,
  "data": {
    "session": { "id": "sess_xxx", "status": "running", ... },
    "pendingPermissions": []
  },
  "timestamp": "2026-04-07T12:34:56.789Z"
}
```

### 错误响应

```ts
type ApiErrorResponse = {
  ok: false
  error: {
    code: string
    message: string
    requestId?: string
    details?: Record<string, unknown>
  }
  timestamp: string       // ISO 8601，错误发生的服务端时间
}
```

示例：

```json
{
  "ok": false,
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Session sess_xxx not found"
  },
  "timestamp": "2026-04-07T12:34:56.789Z"
}
```

### 设计要点

- `ok` 字段作为顶层布尔标识，前端可以快速判断成功/失败
- 成功时 `data` 包含业务数据，错误时 `error` 包含错误信息
- `timestamp` 始终存在，便于前端日志排查和时序对齐
- 前端统一处理逻辑：`if (response.ok) { ... } else { handle response.error }`

### 路由级别响应映射

| 路由 | data 内容 |
|---|---|
| `GET /api/v1/status` | `StatusResponse` |
| `GET /api/v1/sessions` | `{ items: SessionDto[], nextCursor?: string }` |
| `POST /api/v1/sessions` | `{ session: SessionDto, initialPermissionRequests?: PermissionRequestDto[] }` |
| `GET /api/v1/sessions/:id` | `{ session: SessionDto, pendingPermissions: PermissionRequestDto[] }` |
| `POST /api/v1/sessions/:id/input` | `{ accepted: true, sessionId: string, requestId: string }` |
| `POST /api/v1/sessions/:id/interrupt` | `{ accepted: true, sessionId: string }` |
| `GET /api/v1/sessions/:id/stream-info` | `GetSessionStreamInfoResponse` |
| `POST /api/v1/sessions/:id/archive` | `{ session: SessionDto }` |
| `GET /api/v1/sessions/:id/permissions/pending` | `{ items: PermissionRequestDto[] }` |
| `POST /api/v1/sessions/:id/permissions/:requestId/respond` | `{ accepted: boolean, requestId: string, behavior: string }` |

### 常见错误码

- `UNAUTHORIZED`
- `FORBIDDEN`
- `SESSION_NOT_FOUND`
- `PERMISSION_NOT_FOUND`
- `INVALID_REQUEST`
- `CONFLICT`
- `INTERNAL_ERROR`

## 幂等建议

第一阶段建议对下面两类请求支持幂等：

1. `POST /api/v1/sessions`
   - 通过 `mode=resume_or_create` + 用户上下文控制重复创建
2. `POST /api/v1/sessions/:id/input`
   - 通过 `clientRequestId` 去重

对渠道事件，由于使用长连接，SDK 保证有序投递，不存在 HTTP 重试导致的重复问题。但仍建议保留 eventId 去重作为防御性措施，防止 SDK 行为变更或重连后重放。

控制面需要统一定义 `idempotency_key` 的生成规则，并把它持久化到 `SQLite`。

建议规则：

1. 优先使用平台提供的稳定键，例如 `eventId`、`actionId`、`token`
2. 若平台未提供稳定键，则生成 `payloadHashDerivedKey`，并同样写入 `idempotency_key`

这样能覆盖：

- SDK 重连后可能的事件重放
- 进程重启后的重复卡片按钮点击
- 飞书 / 钉钉审批超时后的人为重试

## 完整路由表

### 基础路由（不带版本前缀）

| Method | Path | 说明 |
|---|---|---|
| GET | `/` | Web Console 入口（index.html） |
| GET | `/console` | 重定向到 `/` |

### HTTP API（`/api/v1/`）

| Method | Path | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/v1/status` | 无 | 服务状态与健康检查（供监控探针使用，无需认证） |
| GET | `/api/v1/sessions` | token | 列出会话 |
| POST | `/api/v1/sessions` | token | 创建会话 |
| GET | `/api/v1/sessions/:id` | token | 会话详情 |
| POST | `/api/v1/sessions/:id/input` | token | 投递输入 |
| POST | `/api/v1/sessions/:id/interrupt` | token | 中断执行 |
| GET | `/api/v1/sessions/:id/stream-info` | token | 获取流连接信息 |
| POST | `/api/v1/sessions/:id/archive` | token | 归档会话 |
| GET | `/api/v1/sessions/:id/permissions/pending` | token | 查询待审批 |
| POST | `/api/v1/sessions/:id/permissions/:requestId/respond` | token | 回传审批结果 |

### WebSocket（`/ws/v1/`）

| Path | 认证 | 说明 |
|---|---|---|
| `WS /ws/v1/session/:id/stream` | stream token | JSON 事件流（IM/卡片渠道） |
| `WS /ws/v1/session/:id` | access token | PTY WebSocket（Web 终端） |

### 静态文件

| Path | 说明 |
|---|---|
| `/` | Web Console 入口（index.html） |
| `/terminal.html` | 终端页 |
| `/css/*` | 样式文件 |
| `/js/*` | JS 文件 |

## 与 tlive API 对照

### tlive 路由 -> gclm-code-server 对应

| tlive | gclm-code-server | 说明 |
|---|---|---|
| `GET /api/status` | `GET /api/v1/status` | 对齐 |
| `GET /api/sessions` | `GET /api/v1/sessions` | 返回结构不同，前端需映射 |
| `POST /api/sessions` | `POST /api/v1/sessions` | 请求结构不同 |
| `DELETE /api/sessions/:id` | `POST /api/v1/sessions/:id/archive` | 语义等价 |
| `POST /api/sessions/:id/input` | `POST /api/v1/sessions/:id/input` | 对齐 |
| `WS /ws/session/:id` | `WS /ws/v1/session/:id` | 对齐（PTY 模式） |
| `WS /ws/status` | `GET /api/v1/status` + 轮询/事件流 | 替代方案 |
| `POST /api/hooks/permission` | 内部机制，不直接暴露 | 由 executionBridge 内部处理 |
| `GET /api/hooks/pending` | `GET /api/v1/sessions/:id/permissions/pending` | 对齐 |
| `POST /api/hooks/permission/:id/resolve` | `POST /api/v1/sessions/:id/permissions/:requestId/respond` | 对齐 |

注意：tlive 没有渠道 webhook 端点（它是 bridge 直连模式），我们也不需要了——全部走长连接。

### 认证对照

| 特性 | tlive | gclm-code-server |
|---|---|---|
| Token 来源 | 启动时生成 | 启动时生成或通过环境变量指定 |
| 传递方式 | Bearer header / query param / cookie | Bearer header / query param / cookie |
| Cookie 名称 | `tl_token` | `gclm_token` |
| 未授权响应 | HTML 页面（带输入框） | HTML 页面（带输入框）+ JSON 错误 |
| 本地开发跳过 | 无 | `GCLM_CODE_SERVER_AUTH_ENABLED=false` |
| 渠道接入 | HTTP webhook | 平台长连接（SDK 内置认证） |

## DTO 与模块映射

建议落地到这些目录：

```text
src/gclm-code-server/
  sessions/dto.ts
  permissions/dto.ts
  channels/feishu/dto.ts       # 平台 payload -> 内部 DTO 映射
  channels/dingtalk/dto.ts     # 预留
  channels/wecom/dto.ts        # 预留
  web/dto.ts
  transport/events.ts
```

其中：

- 领域 DTO 尽量靠近领域模块
- Web 专属请求 DTO 放 `web/dto.ts`
- stream event DTO 放 `transport/events.ts`
- 渠道 DTO 只存在于 `channels/*` adapter 内部，不暴露给外部 HTTP

## 第一阶段实现优先级

建议接口开发顺序为：

1. 认证中间件（token 生成 + Bearer/query/cookie 三模式 + HTML 未授权页）
2. `POST /api/v1/sessions`
3. `GET /api/v1/sessions`
4. `POST /api/v1/sessions/:id/input`
5. `WS /ws/v1/session/:id/stream`
6. `WS /ws/v1/session/:id`
7. `GET /api/v1/sessions/:id/permissions/pending`
8. `POST /api/v1/sessions/:id/permissions/:requestId/respond`
9. `GET /api/v1/status`
10. 飞书长连接 adapter（纯内部，复用已有 `FeishuLongConnection`）

这样可以先跑通：

- Web 最小可用（含 PTY 终端体验）
- 飞书通过长连接接入
