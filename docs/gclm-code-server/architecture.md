# `gclm-code-server` 统一远程架构设计方案

更新时间：2026-04-06

## 目的

本文整合以下两份已有分析：

- [feishu-remote-architecture.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/feishu-remote-architecture.md)
- [self-hosted-web-plan.md](/Users/gclm/workspace/lab/ai/gclm-code/docs/gclm-code-server/self-hosted-web-plan.md)

并统一收敛到一个正式建议：

- 以第一方 `gclm-code-server` 作为远程会话与多渠道接入中台
- Web、飞书、未来钉钉等渠道统一通过 `gclm-code-server` 接入
- `gclm-code` 继续承担执行面与会话运行面

本文目标不是 PoC 讨论，而是一份可供后续实施拆解的完整设计方案。

## 一句话结论

推荐正式采用以下主线：

1. `gclm-code` 负责执行、工具调用、会话运行和现有 remote core 能力
2. `gclm-code-server` 负责会话编排、统一 API、权限桥、用户绑定、审计与渠道路由
3. `Web Console` 作为浏览器交互入口
4. `Feishu Adapter` 作为飞书入口
5. 未来 `DingTalk Adapter`、其他 IM / App 渠道继续复用同一套 server contract

不推荐的方向：

- 直接把 `references/tlive` 整套产品并成官方主线
- 让 Web、飞书、钉钉分别直连 `gclm-code` 并各自维护一套会话逻辑
- 把官方托管 Web / server 作为正式依赖

## 决策问题

这次真正要做的决策有四个：

1. 我们是否要自建 Web，而不是依赖官方托管 Web
2. 我们是否要把飞书接成第一方远程入口
3. 我们是否要为未来多渠道预留统一中台
4. 我们是否直接复用 `references/tlive` 的已有成果

推荐答案分别是：

1. 是，自建 Web
2. 是，飞书可以作为第一方渠道之一
3. 是，引入 `gclm-code-server`
4. 是，但只复用它适合复用的前端壳与渠道经验，不复用其整套产品边界

## 设计目标

方案需要同时满足下面这些目标：

- 不重新发明现有 `gclm-code` 已经具备的 remote core
- 让 Web、飞书、未来钉钉共享统一的会话与权限能力
- 把身份、ACL、审计、策略放在第一方控制面
- 第一阶段可薄实现，不把项目做成新的重平台
- 后续新增渠道时主要新增 adapter，而不是再造一套远程系统

## 非目标

第一阶段不追求：

- 完整通用运维平台
- 浏览器里的任意 shell 管理后台
- 多组织复杂工作流编排平台
- 独立于 `gclm-code` 的第二套 agent runtime
- 复刻官方 Claude Code Web 的全部产品形态

## 现状判断

### 当前仓库已有能力

当前项目并不缺远程内核，而是缺统一的渠道接入层。

已有核心包括：

1. 远程会话管理：`RemoteSessionManager`
2. direct connect 客户端：`DirectConnectSessionManager`
3. 远程权限桥：`remotePermissionBridge`
4. 远程会话创建：`createDirectConnectSession`
5. 用户入口：`remote-control`、`--remote`、`--teleport`、`ssh`

对应代码参考：

- [RemoteSessionManager.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/remote/RemoteSessionManager.ts)
- [directConnectManager.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/server/directConnectManager.ts)
- [remotePermissionBridge.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/remote/remotePermissionBridge.ts)
- [createDirectConnectSession.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/server/createDirectConnectSession.ts)

这说明：

- `gclm-code` 已经具备强执行面和会话面
- 但当前更偏“CLI / remote client / bridge client”
- 还没有一个第一方“浏览器 + IM 统一入口服务”

### `references/tlive` 的价值

`tlive` 对我们最有价值的不是整套产品，而是两类经验：

1. Web 控制台壳
2. 飞书渠道能力

可重点借鉴：

- [index.html](/Users/gclm/workspace/lab/ai/gclm-code/references/tlive/core/web/index.html)
- [terminal.html](/Users/gclm/workspace/lab/ai/gclm-code/references/tlive/core/web/terminal.html)
- [app.js](/Users/gclm/workspace/lab/ai/gclm-code/references/tlive/core/web/js/app.js)
- [terminal.js](/Users/gclm/workspace/lab/ai/gclm-code/references/tlive/core/web/js/terminal.js)
- `references/tlive` 中飞书 channel adapter 的事件、流式卡片、审批交互经验

不建议照搬：

- 守护进程模型
- 独立 provider runtime
- 整套 bridge manager / daemon / hook 产品边界

## 为什么推荐 `gclm-code-server`

### 1. 多渠道场景下更容易收敛

如果没有 `gclm-code-server`，每个渠道最终都要自己处理：

- session 创建和恢复
- 用户与 session 映射
- 权限审批回传
- 输出流渲染
- 审计与 ACL

这样 Web、飞书、钉钉很快会形成多套近似实现。

### 2. `gclm-code` 更适合执行面

当前代码已经证明 `gclm-code` 很适合：

- 跑会话
- 发消息
- 接消息
- 处理工具调用
- 使用现有 remote core 协议

因此更自然的边界是：

- `gclm-code` 做执行面
- `gclm-code-server` 做控制面

### 3. 更方便未来加钉钉等渠道

有了 `gclm-code-server` 之后，未来接新渠道时，大多数基础能力都可复用：

- session contract
- permission contract
- 审计策略
- user binding
- stream forwarding

新增渠道主要新增 adapter，而不是新增一套远程系统。

## 推荐总体架构

推荐采用六层结构。

### 第一层：Execution Layer

模块：`gclm-code`

职责：

- CLI 执行
- 工具调用
- 本地会话或远程会话运行
- 复用现有 remote core / direct connect / permission bridge

边界：

- 不直接感知飞书、钉钉、Web UI
- 不负责多渠道入口治理

### 第二层：Control Plane

模块：`gclm-code-server`

职责：

- session lifecycle 管理
- 统一 HTTP / WebSocket / webhook API
- user/channel/session binding
- permission request 聚合和回传
- stream fan-out
- 审计日志
- ACL / policy enforcement

这是本方案的核心。

### 第三层：Presentation Layer

模块示意：

- `Web Console`
- 飞书消息 / 卡片
- 钉钉消息 / 卡片

职责：

- 承载第一方 Web 页面与终端体验
- 呈现 server 输出
- 发起用户输入、控制命令和审批动作

说明：

- Web 在本方案中属于第一方 Presentation Layer，不放入 `channels/*`
- 这一层只负责呈现，不持有跨渠道核心业务状态

### 第四层：Channel Adapters

模块示意：

- `Feishu Adapter`
- `DingTalk Adapter`
- 后续其他第三方入口

职责：

- 接收第三方平台 webhook、长连接事件或回调
- 验签、解包、幂等校验、转换为 `gclm-code-server` 的统一事件
- 把 server 输出渲染成平台可消费的卡片 / 文本 / 富消息

### 第五层：Policy Layer

职责：

- 用户绑定
- 项目级 ACL
- tenant / workspace 隔离
- 高风险工具审批规则
- 回调防重放、幂等、超时策略

### 第六层：Local Storage Layer

模块：`SQLite`

职责：

- 持久化 session metadata
- 持久化 channel/session/user binding
- 持久化 pending permission 与审批结果
- 持久化 webhook 幂等键、防重放记录与轻量审计事件

说明：

- 第一阶段即正式引入本地 `SQLite`，而不是仅靠内存或轻持久化
- 这是飞书 / 钉钉这类异步审批与 webhook 场景的最小一致性保障

## 模块边界

### `gclm-code`

职责：

- 会话执行
- 消息处理
- 工具执行
- 当前 remote core 能力复用

不负责：

- 多渠道身份接入
- 渠道级 ACL
- 统一审计与跨渠道 session 路由

### `gclm-code-server`

职责：

- 统一 session API
- 浏览器与 IM 的接入面
- 输出流分发
- 审批请求汇聚
- 渠道和用户上下文绑定
- 给前端和渠道提供稳定 contract

不负责：

- 重新实现 agent runtime
- 重写 `gclm-code` 的工具执行栈

### Web Console

职责：

- session 列表
- terminal 视图
- 基础状态页
- 恢复会话
- 必要时显示审批状态

实现建议：

- 第一版直接改造 `references/tlive/core/web`
- 不直接使用其原有 API contract

### Feishu Adapter

职责：

- 飞书消息接入
- 流式卡片渲染
- 权限审批卡片
- 恢复会话和通知

实现建议：

- 借鉴 `tlive` 的 channel adapter 经验
- 统一通过 `gclm-code-server` 通信

### DingTalk Adapter

职责：

- 与 Feishu Adapter 对称
- 尽量复用相同 server contract

## 推荐通信模型

### `gclm-code-server` 与 `gclm-code`

建议作为第一阶段保守做法，使用现有可复用协议能力，而不是新造一套全自定义 RPC。

可选方式：

1. 优先复用 direct connect 风格的 session contract
2. 必要时在 server 内部封装对 `gclm-code` 的子进程管理
3. 保持 message、permission、interrupt、stream 语义与现有 remote core 尽可能一致

核心原则：

- `gclm-code-server` 是 orchestration 层
- `gclm-code` 是 execution 层

### `gclm-code-server` 与 Web

建议暴露：

- `GET /api/v1/sessions`
- `GET /api/v1/sessions/:id`
- `POST /api/v1/sessions`
- `POST /api/v1/sessions/:id/input`
- `POST /api/v1/sessions/:id/interrupt`
- `POST /api/v1/sessions/:id/archive`
- `GET /api/v1/sessions/:id/permissions/pending`
- `POST /api/v1/sessions/:id/permissions/:requestId/respond`
- `GET /api/v1/sessions/:id/stream-info`
- `WS /ws/v1/session/:id/stream`

说明：

- `WS /ws/v1/session/:id/stream` 仍是统一流式出口
- Web 所需的连接参数通过 `GET /api/v1/sessions/:id/stream-info` 获取
- 通用 `CreateSessionResponse` 不再直接泄漏 `wsUrl` 这类 Web 专属传输信息
- stream token 一期建议采用短 TTL 的签名令牌模型，不依赖数据库持久化；会话归档或用户登出后的强撤销暂不承诺，依赖短 TTL 与重新握手控制

### `gclm-code-server` 与飞书

建议内建：

- `FeishuLongConnection`
- `FeishuAdapter`
- `FeishuPublisher`

边界要求：

- `Feishu Adapter` 先处理飞书原始长连接事件 / 卡片动作
- 原始平台 payload 只留在 adapter 内部 DTO 中
- 进入控制面的统一对象应是标准化后的 `ChannelInboundEvent`、`ChannelActionCommand` 等内部 DTO

### `gclm-code-server` 与钉钉

建议预留长连接 adapter 骨架，由 server 启动时内建消费

## 关键数据流

### 场景 1：Web 新建会话

1. 用户打开 Web Console
2. Web 调用 `POST /api/v1/sessions`
3. `gclm-code-server` 校验用户身份和项目权限
4. `gclm-code-server` 创建或附着会话
5. Web 通过 `WS /ws/v1/session/:id/stream` 订阅输出

### 场景 2：Web 输入消息

1. 用户在 Web terminal 或输入区提交消息
2. Web 调 `POST /api/v1/sessions/:id/input`
3. `gclm-code-server` 将消息路由到对应 `gclm-code` 会话
4. 输出流继续返回给 Web

### 场景 3：飞书发起任务

1. 用户在飞书对机器人发消息
2. `Feishu Adapter` 收到事件
3. adapter 调 `gclm-code-server`
4. server 找到或新建该用户的 session
5. server 将结果流返回 adapter
6. adapter 更新飞书消息或卡片

### 场景 4：飞书审批工具

1. `gclm-code` 会话产生权限请求
2. `gclm-code-server` 记录 pending approval
3. `Feishu Session Relay` / `Feishu Publisher` 根据控制面状态更新飞书卡片
4. adapter 通过平台长连接接收 `card.action.trigger`
5. 用户点击允许或拒绝
6. adapter 在进程内解析动作并调用 `POST /api/v1/sessions/:id/permissions/:requestId/respond` 对应的控制面语义
7. server 将结果回传执行中的会话

### 场景 5：未来钉钉接入

1. `DingTalk Adapter` 收到消息
2. 调用与飞书相同的 server contract
3. server 复用既有 session、permission、audit 逻辑

## 统一模型建议

为了避免各渠道都发明自己的对象模型，建议 `gclm-code-server` 统一定义以下核心实体：

### UserIdentity

字段建议：

- `id`
- `provider`
- `provider_user_id`
- `display_name`
- `tenant_id`

### ChannelSessionBinding

字段建议：

- `channel`
- `channel_user_id`
- `session_id`
- `project_id`
- `last_active_at`

### Session

字段建议：

- `id`
- `status`
- `project_id`
- `owner_user_id`
- `created_at`
- `updated_at`

### PendingPermission

字段建议：

- `id`
- `session_id`
- `tool_name`
- `tool_use_id`
- `status`
- `requested_by_provider`
- `requested_at`
- `expires_at`
- `resolved_at`
- `resolved_by`

### WebhookIdempotency

字段建议：

- `provider`
- `idempotency_key`
- `payload_hash`
- `received_at`
- `expires_at`

### 统一存储策略建议

第一阶段直接采用本地 `SQLite`，不再把存储停留在“内存 + 轻持久化”的过渡形态。

建议 `SQLite` 承担：

1. session metadata
2. channel identity 与 session binding
3. pending permission 与审批结果
4. webhook 幂等、防重放与短期回调缓存
5. 轻量 audit event

补充约束：

- `channel_identities` 应作为渠道身份事实源
- `session_bindings` 应引用已解析的渠道身份，而不是与身份表并列成为第二事实源
- webhook 幂等键需要统一定义为单一 `idempotency_key` 生成规则，不能在 API 与 schema 中分别解释

这样做的核心原因是：

- 飞书 / 钉钉审批天然是异步回调，进程重启后不能丢 pending state
- webhook 需要天然防重放与可追溯，而不是只靠内存去重
- 自建 Web Console 后，session list、恢复入口和审批中心也需要稳定事实源
- `transport`
- `metadata`

### PermissionRequest

字段建议：

- `id`
- `session_id`
- `tool_name`
- `tool_use_id`
- `input`
- `status`
- `requested_at`
- `resolved_at`
- `resolved_by`

### AuditEvent

字段建议：

- `id`
- `event_type`
- `session_id`
- `actor_type`
- `actor_id`
- `channel`
- `payload`
- `created_at`

## Web 方案

### 是否自建 Web

结论：做，而且应作为正式方向。

原因：

- 当前项目是自定义版本，不适合长期依赖官方托管服务
- Web 是重交互入口，比 IM 更适合 terminal、长文本、调试状态展示
- 未来飞书和钉钉可把“打开会话”跳转到 Web

### `tlive` Web 的复用边界

可直接借鉴：

- 页面结构
- `xterm.js` 承载方式
- terminal reconnect / exit UX
- session dashboard 布局

需要改造：

- API 路径
- 鉴权模式
- session 状态结构
- 权限流交互

建议重写：

- auth / ACL
- permission 审批桥
- 与 `gclm-code-server` 的 contract

### Web 第一阶段范围

建议第一阶段只做：

1. session 列表
2. terminal 打开和基础输入输出
3. 断线重连和退出态
4. 飞书消息里可跳转打开会话

先不做：

1. 重型管理后台
2. 全量审批中心
3. 文件管理中心
4. 任意运维平台能力

## 飞书方案

### 飞书的定位

飞书更适合做：

- 消息入口
- 会话通知
- 审批入口
- 恢复入口

而不是单独承担全部 terminal 能力。

### 飞书第一阶段范围

建议第一阶段只做：

1. 飞书发起新会话
2. 飞书恢复已有会话
3. 飞书接收流式结果与工具进度
4. 飞书审批高风险工具

### 应借鉴 `tlive` 的部分

1. 自建应用配置与权限清单
2. 事件订阅方式
3. CardKit v2 流式卡片
4. 按钮审批交互
5. 多消息类型处理经验

### 不建议照搬的部分

1. 整套 daemon 生命周期
2. provider runtime 管理
3. 与 Web terminal 强耦合的产品边界
4. 独立于现有 remote core 的 bridge 主循环

## 为什么不建议直接官方化 `tlive`

### 1. 产品边界不一致

`tlive` 是独立工具，而我们已有自己的 remote core 和用户入口。

如果直接并入，会形成两套并行体系：

1. 项目原生 remote / direct connect
2. `tlive` 风格 bridge / daemon / hook

### 2. 安全与治理边界不同

我们需要的是：

- 第一方身份体系
- 项目 ACL
- 多租户隔离
- 审计
- 幂等和防重放

这些不应被 `tlive` 的工具边界牵着走。

### 3. 长期维护成本更高

直接整包并入 `tlive` 会让：

- 维护责任变乱
- 接口边界模糊
- 未来 server contract 难以收敛

## 官方托管 server 的位置

当前结论保持不变：

1. 官方 CLI 仓库公开可见
2. 没有发现一个明确可自建、开源交付的官方 Web backend
3. 因此官方托管 Web / server 不纳入正式架构依赖

建议原则继续保持：

- 若不开源、不可自建，则不纳入正式主线

## API 草案

建议 `gclm-code-server` 第一阶段至少定义以下接口。

### Session API

- `POST /api/v1/sessions`
  - 创建会话或恢复会话
- `GET /api/v1/sessions`
  - 列出当前用户可见会话
- `GET /api/v1/sessions/:id`
  - 查看会话详情
- `POST /api/v1/sessions/:id/input`
  - 投递用户输入
- `POST /api/v1/sessions/:id/interrupt`
  - 中断当前执行
- `POST /api/v1/sessions/:id/archive`
  - 归档会话

### Stream API

- `WS /ws/v1/session/:id/stream`
  - 订阅会话输出与状态事件

### Permission API

- `GET /api/v1/sessions/:id/permissions/pending`
  - 查询待审批项
- `POST /api/v1/sessions/:id/permissions/:requestId/respond`
  - 回传允许 / 拒绝 / 范围放行

### Channel Runtime

- `FeishuLongConnection`
- `DingtalkLongConnection`（预留）
- `WecomLongConnection`（预留）

### Admin / Health API

- `GET /api/v1/status`
- `GET /metrics`
- `GET /audit/events`

## 目录建议

建议新增服务端目录，例如：

```text
src/gclm-code-server/
  app.ts
  config/
  sessions/
  transport/
  permissions/
  audit/
  channels/
    feishu/
    dingtalk/
  web/
    api/
    auth/
```

或者单独拆出工作区：

```text
packages/gclm-code-server/
  src/
```

第一阶段如果想降低改动面，建议先放在 `src/gclm-code-server/`。

## 实施阶段建议

### Phase 0：Contract 验证

目标：

- 明确 `gclm-code-server` 与 `gclm-code` 的最小 contract
- 验证 session、stream、permission 三条主链可行

输出：

- 最小 API 定稿
- 一条从 session 创建到输出流返回的闭环

### Phase 1：Web 最小可用

目标：

- 自建 Web Console 跑通

输出：

- session 列表
- terminal 页面
- reconnect / exit UX
- 基础输入输出

### Phase 2：飞书接入

目标：

- 飞书成为第一方远程入口之一

输出：

- 飞书创建 / 恢复会话
- 飞书流式结果
- 飞书审批高风险工具

### Phase 3：治理补强

目标：

- 让这条链路达到长期可维护状态

输出：

- 用户绑定
- ACL
- 审计
- 回调幂等
- 限流与告警

说明：

- `SQLite` 不是 Phase 3 才补，而是从 Phase 1 就落地
- Phase 3 补的是更完整的索引、TTL 清理、统计与治理能力

### Phase 4：钉钉与更多渠道

目标：

- 验证多渠道扩展性

输出：

- DingTalk Adapter
- 复用相同 server contract

## 风险与取舍

### 风险 1：server 做得过重

风险：

- 容易演变成第二套平台

控制方式：

- 第一阶段只做 session、stream、permission、channel adapter contract

### 风险 2：过早绑定 `tlive` API

风险：

- 正式 API 被参考项目限制

控制方式：

- 复用其前端壳，不直接继承其后端 contract

### 风险 3：权限与审计后补成本高

风险：

- 前期为求快绕过治理，后期补齐代价大

控制方式：

- 第一阶段即预留 policy 与 audit 模型

### 风险 4：`gclm-code-server` 与 `gclm-code` 边界不清

风险：

- 执行面和控制面互相侵入

控制方式：

- 明确 server 不重写 runtime
- 明确 `gclm-code` 不直接承接多渠道入口治理

## 最终建议

建议正式采纳以下架构判断：

1. `gclm-code-server` 是正确的长期方向
2. `gclm-code` 继续作为执行面，不做多渠道中台
3. Web 与飞书先落到 `gclm-code-server` 之上
4. `references/tlive` 作为参考实现复用，不作为官方主线整包接入
5. 官方托管 Web / server 若不开源、不可自建，则排除

如果后续要进入开发阶段，我建议下一步直接基于本文继续往下拆两份文档：

1. `gclm-code-server` 模块设计与目录拆分
2. `Phase 1 Web + Phase 2 Feishu` 的实施任务清单
