# `gclm-code-server` 模块设计与技术栈建议

更新时间：2026-04-06

## 目的

本文基于 [gclm-code-server-architecture.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/architecture.md)，继续往下收敛两个问题：

1. `gclm-code-server` 应该如何拆模块、定目录、划清边界
2. 我们应该采用什么技术栈来实现第一阶段版本

本文目标不是直接开始编码，而是把“结构”和“栈”定到足够清楚，方便后续正式进入开发。

## 一句话结论

推荐将 `gclm-code-server` 设计成一个“薄控制面服务”，第一阶段聚焦四条主链：

1. session lifecycle
2. stream forwarding
3. permission bridge
4. channel adapter contract

技术栈上，当前最推荐方案是：

- `Bun + TypeScript + Hono + zod + Bun WebSocket + SQLite`

推荐原因：

- 与当前仓库主运行时一致
- 足够轻，不会把 server 做成重平台
- HTTP 路由、middleware、测试和后续扩展都比裸 `Bun.serve` 更稳
- `zod` 已经在仓库中大量存在，适合继续复用输入输出 schema

不推荐第一阶段直接选：

- 重型 Node 框架栈
- 裸 `Bun.serve` 全手写一切
- 为 server 单独新开一套异构语言或异构运行时

## 设计原则

### 1. `gclm-code-server` 是控制面，不是第二套 runtime

它负责：

- 会话编排
- API 暴露
- 渠道路由
- 权限桥接
- 审计与策略

它不负责：

- 重新实现 `gclm-code` 的执行逻辑
- 重写 agent runtime
- 自己再长出一套并行的远程协议世界

### 2. 先把主链跑通，再补治理增强

第一阶段优先级：

1. session
2. stream
3. permission
4. Web / Feishu 接入

后续再补：

- ACL 扩展
- 更细的审计
- 钉钉与更多渠道
- 管理后台

### 3. 结构上可扩展，实现上要克制

模块设计可以按长期形态留边界，但实现必须保持薄，不要第一阶段就把未来三期的抽象都做出来。

## 当前仓库对技术栈的约束

基于当前仓库现状，`gclm-code-server` 的技术选型要尊重这些事实：

1. 仓库主栈已经是 `Bun + TypeScript`
   参考 [package.json](/Users/gclm/workspace/lab/ai/gclm-code/package.json)
2. 仓库已经依赖 `zod`
3. 仓库已经存在 `ws` 依赖，主要用于 WebSocket 客户端或兼容层
4. 当前主干没有一个成熟的 HTTP 服务框架正在被广泛使用
5. 当前仓库已经存在 server-oriented 类型设计和 direct connect 契约
   参考 [src/server/types.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/server/types.ts)

这意味着：

- 我们不需要迁就历史 Web server 框架
- 可以为 `gclm-code-server` 选一套最适合当前目标的最小栈

## 模块设计总览

建议 `gclm-code-server` 拆成九个一级模块。

### 1. `app`

职责：

- 启动 HTTP 服务
- 注册路由
- 挂载 middleware
- 组装 config、stores、services、adapters

它是装配层，不承载业务逻辑。

### 2. `config`

职责：

- 环境变量读取
- 配置校验
- 默认值填充
- 多环境配置切换

建议职责保持纯净，不夹带业务逻辑。

### 3. `identity`

职责：

- 用户身份抽象
- 渠道身份映射
- tenant / workspace 上下文
- session owner 解析

这是 Web、飞书、钉钉复用的统一身份入口。

### 4. `sessions`

职责：

- session 创建
- session 恢复
- session 查询
- session 归档
- session 与用户、渠道绑定

这是 `gclm-code-server` 的核心领域模块。

### 5. `transport`

职责：

- 输出流订阅
- WebSocket stream 推送
- channel 事件分发
- backpressure / reconnect 策略

这一层负责“怎么送”，不负责“送什么”。

### 6. `permissions`

职责：

- 待审批项登记
- 审批状态流转
- 允许 / 拒绝 / 超时处理
- 回传执行会话

### 7. `channels`

职责：

- Feishu Adapter
- DingTalk Adapter
- 未来其他第三方渠道

约束：

- 只做平台事件适配
- 负责原始 webhook / callback DTO 到内部标准 DTO 的转换
- 不直接碰底层执行细节

### 8. `web`

职责：

- 暴露第一方 Web Console 所需 controller / dto
- 返回 Web 需要的 session 列表、详情、stream 连接信息
- 只承接第一方 Web，不与第三方渠道 adapter 混放

### 9. `audit`

职责：

- 关键操作日志
- 权限审批留痕
- 渠道回调记录
- 会话状态变更记录

第一阶段可以先做薄实现，但模块要存在。

## 推荐目录结构

第一阶段建议放在现有仓库 `src/` 下，降低拆包成本。

建议目录：

```text
src/gclm-code-server/
  app/
    createApp.ts
    server.ts
    middleware/
      auth.ts
      requestId.ts
      errorHandler.ts
      auditContext.ts
  config/
    env.ts
    defaults.ts
    schema.ts
  db/
    client.ts
    migrations/
    migrationRunner.ts
    sqlite.ts
  identity/
    types.ts
    identityService.ts
    channelIdentityMap.ts
    channelIdentityRepository.ts
  sessions/
    types.ts
    sessionService.ts
    sessionRepository.ts
    sessionBindingRepository.ts
    sessionBindingService.ts
    sessionExecutionAdapter.ts
  transport/
    streamHub.ts
    wsSessionStream.ts
    eventFanout.ts
    streamInfoService.ts
  permissions/
    types.ts
    permissionService.ts
    permissionRepository.ts
    permissionTimeoutPolicy.ts
  channels/
    shared/
      channelEvents.ts
      channelEventNormalizer.ts
      idempotencyRepository.ts
    feishu/
      feishuController.ts
      feishuAdapter.ts
      feishuRenderer.ts
      feishuActionHandler.ts
      feishuPayloadTypes.ts
    dingtalk/
      dingtalkController.ts
      dingtalkAdapter.ts
      dingtalkPayloadTypes.ts
  audit/
    auditService.ts
    auditRepository.ts
  web/
    sessionController.ts
    permissionController.ts
    streamController.ts
    dto.ts
```

## 一级模块详细设计

## `app`

### 职责

- 启动 server
- 注册所有 controller
- 注入 service 和 repository
- 安装统一 middleware

### 不负责

- session 业务逻辑
- 权限业务逻辑
- 渠道业务逻辑

### 设计要点

- `createApp()` 返回可测试的 app 实例
- `server.ts` 只负责启动，不混入业务
- middleware 尽量少而稳定

## `config`

### 职责

- 从环境变量读取配置
- 用 schema 校验
- 产出 typed config

### 建议配置项

- `HOST`
- `PORT`
- `AUTH_SECRET`
- `SESSION_BACKEND_MODE`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `DINGTALK_APP_KEY`
- `DINGTALK_APP_SECRET`
- `AUDIT_SINK`
- `DEFAULT_PERMISSION_TIMEOUT_MS`

## `identity`

### 职责

- 统一抽象 Web 用户、飞书用户、钉钉用户
- 产出内部 `UserIdentity`
- 解析 tenant / project / workspace 范围

### 核心接口建议

- `resolveIdentityFromWebRequest()`
- `resolveIdentityFromFeishuEvent()`
- `resolveIdentityFromDingTalkEvent()`
- `bindChannelUserToInternalIdentity()`

### 为什么单独拆出来

因为身份绑定会越来越复杂，它不应该散落在 Web controller 和各渠道 adapter 里。

## `sessions`

### 职责

- session 创建
- session 恢复
- session 查询
- session 归档
- session 绑定

### 建议再拆三层

- `sessionRepository`
  - 存储 session 元数据
- `sessionService`
  - 处理 session 业务逻辑
- `sessionExecutionAdapter`
  - 与 `gclm-code` 通信

### `sessionExecutionAdapter` 的定位

这是 `gclm-code-server` 与 `gclm-code` 的核心接缝。

建议它先统一抽象为接口，例如：

- `createExecutionSession()`
- `sendInput()`
- `interrupt()`
- `subscribeStream()`
- `respondToPermission()`

第一阶段实现可以优先封装现有 direct connect / remote core 能力，避免先定义一套过重的内部 RPC。

## `transport`

### 职责

- 统一把 session 输出流转成 WebSocket 事件
- 把同一个 session 的输出广播给不同 presentation / channel
- 管理订阅生命周期

### 推荐核心对象

- `StreamHub`
  - 维护 session 到 subscriber 的映射
- `EventFanout`
  - 统一分发到 Web 或 channel adapter
- `WsSessionStream`
  - 封装浏览器 WebSocket 行为

### 设计重点

- transport 层不解释业务语义，只做可靠分发
- permission request 也可以视作一种特殊 stream event

## `permissions`

### 职责

- 记录 pending approvals
- 管理审批状态
- 实现超时默认动作
- 回传到运行中的 session

### 状态建议

- `pending`
- `approved`
- `denied`
- `expired`
- `cancelled`

### 为什么要独立模块

因为权限链路是后续多渠道复用的中心能力：

- Web 可审批
- 飞书可审批
- 钉钉也应复用

## `channels`

### 职责

- 平台事件适配
- 平台消息渲染
- 平台回调处理

### 第一阶段建议子模块

- `channels/feishu`
- `channels/dingtalk` 先只放接口骨架

### Feishu 内部建议拆法

- `feishuController`
  - 处理事件入口
- `feishuAdapter`
  - 负责把平台事件映射到 server contract
- `feishuRenderer`
  - 负责文本 / 卡片 / 流式更新渲染
- `feishuActionHandler`
  - 处理审批按钮等动作回调

## `audit`

### 职责

- 关键事件记录
- 请求和 session 关联
- 审批和 actor 关联

### 第一阶段建议落地方式

- 先文件 / stdout / 结构化日志
- 接口设计上预留未来外部 sink

## `web`

### 职责

- 暴露 Web Console 用的 controller 和 DTO
- 不承载 session 业务逻辑

### 为什么单独保留

因为 Web 虽然也是一个渠道，但它和飞书 / 钉钉不同，仍然值得保留独立的 HTTP controller 目录，方便前端对接和 API 演进。

## 内部依赖规则

推荐依赖方向如下：

1. `app` -> 所有 service/controller
2. `web` -> `sessions` / `permissions` / `identity`
3. `channels/*` -> `sessions` / `permissions` / `identity` / `audit`
4. `sessions` -> `identity` / `audit`
5. `transport` -> `sessions`
6. `permissions` -> `sessions` / `audit`
7. `audit` 不反向依赖业务模块

禁止：

- `channels` 直接调用 `gclm-code`
- `web` 直接调用 `gclm-code`
- `audit` 反向控制业务流

## 核心接口边界

建议第一阶段统一定义以下服务接口。

### `SessionService`

- `createSession(input)`
- `resumeSession(input)`
- `listSessions(input)`
- `getSession(input)`
- `archiveSession(input)`
- `sendInput(input)`
- `interrupt(input)`

### `PermissionService`

- `createPendingRequest(input)`
- `listPendingRequests(input)`
- `respond(input)`
- `expire(input)`
- `cancel(input)`

### `IdentityService`

- `resolveFromRequest(input)`
- `resolveFromChannel(input)`
- `assertProjectAccess(input)`

### `AuditService`

- `record(event)`

### `StreamInfoService`

- `getStreamInfo(sessionId, identity)`
- `issueWebSocketToken(sessionId, identity)`
- `verifyWebSocketToken(token)`

职责说明：

- 为 Web 生成连接所需的 stream 参数
- 避免把 `wsUrl` 这类 Web 专属传输字段塞进通用 session 创建响应
- 一期采用短 TTL 的签名 token；如未来需要强撤销，再单独扩展 token revocation 存储

### `ChannelEventNormalizer`

- `normalizeFeishuEvent(raw)`
- `normalizeFeishuAction(raw)`
- `normalizeDingTalkEvent(raw)`

职责说明：

- 渠道原始 payload 与内部标准 DTO 在这里分界
- adapter 保留平台语义，控制面只消费标准化对象

## 存储建议

第一阶段直接引入本地 `SQLite`，并把它视为 `gclm-code-server` 的正式组成，而不是后补治理项。

推荐由 `SQLite` 负责以下状态：

1. session metadata
2. `channel_identities` 作为渠道身份事实源
3. `session_bindings` 作为 session 上下文绑定
4. pending permissions 与审批结果
5. webhook idempotency key、防重放记录与 action 去重
6. 轻量 audit event 与关键状态变更

额外约束：

- `session_bindings` 不应重复拥有独立身份事实，只应引用或派生自 `channel_identities`
- API 与存储层统一使用单一 `idempotency_key` 生成规则，避免一处写 `eventId/actionId`，另一处写 `provider+payloadHash` 却无法落表

这样做的原因：

- 飞书 / 钉钉审批是异步回调链路，pending state 不能只放内存
- webhook 必须有稳定的幂等事实源，否则重试与重放会污染会话
- Web Console 的会话列表、待审批中心、恢复入口都需要稳定读取模型

第一阶段不建议让 `SQLite` 承担重分析型数据仓职责，但必须承担控制面状态存储。

## 技术栈候选

建议实际只比较三个可信选项。

## 方案 A：`Bun + 原生 Bun.serve + zod + Bun WebSocket`

### 优点

- 依赖最少
- 性能和运行时一致性最好
- 最贴近当前仓库主运行时

### 缺点

- 路由、middleware、错误处理、测试装配都要自己多写一层
- 第一阶段看起来轻，第二阶段开始容易长出一堆自制基础设施
- 对团队协作和后续扩展不如轻框架稳

### 适用场景

- 非常小的内部服务
- 只有 3 到 5 个接口

### 对本项目判断

不作为首选。

因为 `gclm-code-server` 从第一阶段开始就不是只有健康检查和两个接口，而是会很快长出：

- session API
- stream API
- permission API
- channel webhook API

纯裸写很容易让基础设施代码反客为主。

## 方案 B：`Bun + Hono + zod + Bun WebSocket`

### 优点

- 仍然保持轻量
- 路由、中间件、错误处理模型清晰
- 对 Bun 兼容较好
- API 层结构比裸写更整齐
- 很适合把 Web、Feishu、DingTalk 这些入口分别拆 controller
- 与 `zod` 组合自然

### 缺点

- 引入一个新框架依赖
- WebSocket 仍需我们自己设计封装，不能完全偷懒

### 适用场景

- 轻量但长期维护的 TypeScript 服务
- 需要 HTTP + WebSocket + webhook 并存

### 对本项目判断

这是当前最推荐的选择。

原因：

- 仓库主运行时已是 Bun
- 我们不需要一个重框架
- 也不应该让基础设施全手写
- 未来多渠道接入会受益于更清晰的 controller / middleware 结构

## 方案 C：`Node + Fastify/Express + zod`

### 优点

- 生态成熟
- 资料多
- 团队可能更熟

### 缺点

- 与当前仓库主运行时不一致
- 需要为 server 单独维护一套运行时和脚本
- 与现有 Bun 构建、运行、测试路径割裂
- 第一阶段为此付出的工程切换成本不值得

### 对本项目判断

不推荐第一阶段采用。

除非后面出现明确约束，例如：

- Bun runtime 某项关键能力无法满足
- 运维环境强制要求 Node-only

在当前信息下没有必要主动引入异构运行时。

## 技术栈推荐

当前推荐：

- Runtime: `Bun`
- Language: `TypeScript`
- HTTP framework: `Hono`
- Validation: `zod`
- WebSocket: `Bun WebSocket` 为主，必要时保留 `ws` 作为兼容或客户端能力
- Logging: 先复用现有项目日志工具和结构化日志输出
- Testing: 继续用 `bun test`

## 选型结论

建议本轮正式拍板以下技术栈：

- Runtime: `Bun`
- Language: `TypeScript`
- HTTP framework: `Hono`
- Validation / DTO schema: `zod`
- Realtime transport: `Bun WebSocket`
- Test runner: `bun test`

并明确以下边界：

- 当前阶段不采用 Rust 作为 `gclm-code-server` 主技术栈
- 当前阶段不采用 Node + Express / Fastify 作为主技术栈
- 当前阶段不采用裸 `Bun.serve` 作为最终落地形态

## 为什么当前不采用 Rust

可以参考其他产品把控制面和执行面分离的架构思路，但当前没有必要因为别的产品可能用了 Rust，就让 `gclm-code-server` 直接切到 Rust。

原因有四个：

### 1. 当前仓库主栈已经是 `Bun + TypeScript`

如果这时单独给 server 切 Rust，会立即引入：

- 两套运行时
- 两套构建链
- 两套调试方式
- 两套依赖管理
- 两套团队心智模型

这会明显提高第一阶段推进成本。

### 2. 第一阶段瓶颈不在极限性能

第一阶段真正要解决的问题是：

- session 模型
- stream 模型
- permission 模型
- Web / 飞书 / 后续钉钉的统一 contract

这些是控制面建模问题，不是必须靠 Rust 才能解决的问题。

### 3. 现有 TypeScript 资产复用价值更高

当前仓库里已经有很多可直接参考或复用的内容：

- remote core 语义
- direct connect contract
- `zod` schema 风格
- Bun runtime 运行方式
- 现有日志和测试体系

如果这时切 Rust，这些复用价值会明显下降。

### 4. 现在最大风险是复杂度，而不是吞吐

`gclm-code-server` 当前最需要避免的是：

- 边界混乱
- 模块失控
- 迭代变慢

而不是过早为了可能并不会出现的性能瓶颈，先承受异构技术栈的复杂度。

## Rust 何时值得重新评估

如果后续出现下面这些条件，再认真评估 Rust 会更合适：

1. `gclm-code-server` 演变成高并发常驻基础设施
2. stream fan-out、长连接数、资源占用成为实测瓶颈
3. 团队已经具备稳定的 Rust 工程能力
4. server 准备从项目内服务演变成独立基础设施产品

在那之前，更合理的策略是：

- 先用当前推荐栈把 `gclm-code-server` 做出来
- 后续若真出现瓶颈，再评估局部 Rust，而不是一开始就全栈 Rust

## 为什么不是裸 `Bun.serve`

因为第一阶段虽然要薄，但不是一次性 demo。

`gclm-code-server` 会很快面对这些问题：

- 多组路由
- request context
- auth middleware
- 错误边界
- webhook 校验
- channel adapter 拆分

这些用轻框架比全手写更稳。

## 为什么不是 Node 框架

因为我们当前最重要的不是“生态最大”，而是：

- 与现有仓库一致
- 快速落地
- 维护成本低
- 少一套运行时

在这个前提下，Bun 路线更合理。

## 第一阶段实现建议

建议采用：

- 目录放在 `src/gclm-code-server/`
- `Bun + Hono + zod`
- WebSocket 采用 Bun 原生能力
- Session 执行适配层优先复用现有 direct connect / remote core 概念
- Feishu 先做完整 adapter
- DingTalk 先保留 adapter contract，不急着做实现

## 验收标准建议

当下面这些条件同时满足时，可以认为 `gclm-code-server` 第一阶段模块设计成立：

1. Web 可以创建、查看、恢复 session
2. Web 可以订阅 stream 并发送输入
3. Feishu 可以创建 / 恢复 session
4. Feishu 可以审批高风险工具
5. `gclm-code-server` 内部没有长出第二套执行 runtime
6. 新增一个 `DingTalk Adapter` 时，不需要改 session/permission 核心模型

## 最终建议

建议你这轮直接拍板以下决策：

1. 采用 `gclm-code-server` 作为正式控制面
2. 模块结构按本文的九个一级模块推进
3. 第一阶段目录放在 `src/gclm-code-server/`
4. 技术栈采用 `Bun + TypeScript + Hono + zod + Bun WebSocket + SQLite`

如果你认可这组判断，下一步最自然的是继续出一份更细的文档：

1. `gclm-code-server` API / DTO 设计稿
2. `Phase 1 Web + Phase 2 Feishu` 的开发任务拆解
