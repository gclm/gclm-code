# 飞书远程接入架构草图

更新时间：2026-04-06

## 目的

本文回答两个问题：

1. 如果要让用户通过飞书远程操作当前项目，飞书接入应挂载在哪一层
2. 为什么不建议把 `references/tlive` 直接作为官方远程能力并入主干

本文不是实施细节设计稿，而是一份架构草图与边界建议，目的是先让整体方向清楚。

## 一句话结论

推荐方案：

- 保留 `references/tlive` 作为渠道参考实现
- 官方方案复用现有 remote core
- 新增第一方 `Feishu Bridge` 作为渠道适配层
- 不把飞书、Web terminal、hook daemon、远程协议耦成一整套并行系统

不推荐：

- 直接把 `tlive` 当作官方远程主线整包接入

## 现状判断

### 仓库已有的核心能力

当前仓库已经具备：

1. 远程会话管理：`RemoteSessionManager`
2. direct connect 会话管理：`DirectConnectSessionManager`
3. 远程权限桥：`remotePermissionBridge`
4. 用户入口：`remote-control`、`--remote`、`--teleport`、`ssh`

这些能力说明，本项目缺的不是远程内核，而是“渠道入口层”。

### `references/tlive` 的价值

`tlive` 的价值主要在渠道层：

1. 飞书应用接入流程完整
2. 飞书长连接事件处理完整
3. 文本、图片、文件、按钮回调都做了
4. 飞书 CardKit v2 流式卡片做得很完整
5. 手机审批工具权限这一条产品链路已经跑通

所以 `tlive` 最值得复用的不是它的整体产品边界，而是它的飞书渠道经验。

## 推荐架构

推荐拆成三层：

### 第一层：Remote Core

职责：

- 会话创建与恢复
- 远程消息协议
- 远程权限请求与响应
- 中断、取消、重连
- 会话状态持久化

现有仓库映射：

- [src/remote/RemoteSessionManager.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/remote/RemoteSessionManager.ts)
- [src/server/directConnectManager.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/server/directConnectManager.ts)
- [src/remote/remotePermissionBridge.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/remote/remotePermissionBridge.ts)
- [src/server/createDirectConnectSession.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/server/createDirectConnectSession.ts)

这一层应该继续归项目主干所有，不感知飞书、Telegram、Discord 之类具体平台。

### 第二层：Channel Adapter

职责：

- 接收飞书消息 / 卡片点击 / 文件上传事件
- 把平台事件转换成统一的 `InboundMessage`
- 把远程会话输出转换成飞书文本 / 卡片 / 流式更新
- 把平台按钮点击转换成统一的权限决策输入

建议新增模块示意：

- `src/channels/feishu/FeishuAdapter.ts`
- `src/channels/feishu/FeishuStreamingCard.ts`
- `src/channels/feishu/FeishuMessageMapper.ts`
- `src/channels/feishu/FeishuPermissionActions.ts`

这一层可以大量借鉴 `references/tlive/bridge/src/channels/feishu.ts` 和 `references/tlive/bridge/src/channels/feishu-streaming.ts` 的做法，但不应把其整套 bridge manager、provider 路由、守护进程模型一起复制进来。

### 第三层：Policy Layer

职责：

- 飞书用户与项目身份绑定
- 会话创建权限
- 工具审批规则
- 审计日志
- 项目级 ACL
- 高风险工具的附加限制

这一层必须由我们自己定义，不能直接照搬 `tlive` 的本地工具思路。

## 推荐的数据流

### 场景 1：飞书发起一个新任务

1. 用户在飞书私聊机器人发送消息
2. `Feishu Adapter` 收到事件
3. 渠道层校验飞书用户身份、项目权限、会话策略
4. 渠道层调用 `Remote Core` 创建或附着远程 session
5. `Remote Core` 把消息送入远程会话
6. 远程会话持续产出流式事件
7. `Feishu Adapter` 把输出更新到飞书卡片

### 场景 2：飞书审批一个工具调用

1. 远程 session 发出 `can_use_tool` 权限请求
2. `Remote Core` 把事件暴露给渠道层
3. `Feishu Adapter` 生成飞书互动卡片
4. 用户点击允许 / 拒绝 / 范围放行
5. 飞书回调回到 `Feishu Adapter`
6. 渠道层把决策回传给 `Remote Core`
7. 远程 session 继续执行或终止

### 场景 3：飞书恢复已有会话

1. 用户发送“继续上次会话”或在卡片上点击恢复
2. `Feishu Adapter` 查到用户最近 session
3. 渠道层附着到已有 remote session
4. 后续消息继续走同一会话

## 为什么不建议直接并入 `tlive`

### 1. 产品边界不一致

`tlive` 是一个独立工具，默认把这些东西绑在一起：

- Web terminal
- IM bridge
- Hook 审批
- provider 选择
- 守护进程
- 独立配置目录

而我们当前项目已经有自己的 remote core 和用户入口。

如果直接并入 `tlive`，很容易形成两套并行体系：

1. 项目原生 remote / bridge
2. `tlive` 风格的外置 bridge / daemon / hook 系统

长期会让产品边界和维护责任变乱。

### 2. 架构耦合过重

`tlive` 的飞书能力不是一个很薄的 channel adapter，而是跟它自己的 bridge manager、provider runtime、hook 流程紧耦合。

对一个独立工具来说这没问题，但对我们的官方远程能力来说，更合理的做法是：

- 飞书只关心渠道交互
- 远程协议继续由项目主干负责

### 3. 安全与治理要求不同

`tlive` 已经有白名单、审批超时默认拒绝、按钮审批这些不错的安全设计。

但如果我们把飞书能力定义成“官方远程入口”，还需要更强的平台治理：

1. 飞书用户到项目身份映射
2. 项目级访问控制
3. 敏感工具审批策略
4. 操作审计
5. 回调防重放
6. 多组织隔离
7. 员工离职或权限变更后的即时失效

这些更适合放在我们自己的 policy layer，而不是嵌进 `tlive` 的工具边界里。

## 第一阶段建议范围

建议第一阶段只做三件事：

1. 飞书发起 / 恢复远程会话
2. 飞书接收流式结果和工具进度
3. 飞书审批高风险工具调用

先不要纳入第一阶段：

1. 完整 Web terminal 暴露
2. 任意 shell 远程操作
3. 通用文件上传下载
4. 多项目切换编排
5. 跨渠道统一会话管理后台

原因：

- 第一阶段目标应该是证明“飞书可以成为现有远程能力的稳定入口”
- 不应该一上来就把终端暴露、运维自动化、渠道统一平台全部绑进同一批范围

## 第一阶段模块草图

建议最小实现模块为：

1. `FeishuAppConfig`
   - 管理 App ID / Secret / allowed users / tenant 配置
2. `FeishuEventListener`
   - 管理长连接事件订阅与回调解析
3. `FeishuSessionRouter`
   - 维护飞书用户和 remote session 的映射
4. `FeishuMessageRenderer`
   - 把远程输出渲染成普通消息或流式卡片
5. `FeishuPermissionBridge`
   - 把工具权限请求转成飞书互动卡片并回传决策
6. `FeishuAuditSink`
   - 记录关键操作、审批和错误日志

## 建议复用与借鉴点

### 应该借鉴 `tlive` 的部分

1. 飞书自建应用的配置和权限申请清单
2. 事件订阅采用长连接 WebSocket
3. CardKit v2 流式卡片做法
4. 卡片按钮承载权限审批
5. 文本、图片、文件等消息类型的处理经验

### 不建议直接照搬的部分

1. 整套 daemon 生命周期
2. 独立的 provider runtime 管理
3. 与 Web terminal 强耦合的产品边界
4. 独立于现有 remote core 的桥接主循环
5. 作为官方主线的整体配置模型

## 落地顺序建议

### Phase 0：验证

目标：证明飞书渠道和现有 remote core 能正常打通。

输出：

- 飞书机器人收消息
- 可向现有 remote session 发消息
- 能在飞书看到最终回复

### Phase 1：流式输出

目标：把远程事件稳定渲染成飞书流式卡片。

输出：

- 正文流式更新
- 工具进度摘要
- 会话结束态和错误态

### Phase 2：审批桥

目标：让飞书可审批高风险工具。

输出：

- 允许 / 拒绝
- 超时默认拒绝
- 审批结果回传远端 session

### Phase 3：治理补强

目标：把这条链路提升到“官方可维护能力”。

输出：

- 用户绑定和 ACL
- 审计日志
- 失败告警
- 限流和回调幂等

## 结论

当前最合理的官方方案不是“把 `tlive` 官方化”，而是：

- 用 `tlive` 验证飞书渠道做法
- 复用本项目已存在的 remote core
- 新增一个第一方 `Feishu Bridge`
- 让飞书成为现有远程能力的入口，而不是第二套远程系统

这个方向的最大好处是：

1. 不会破坏现有远程主干
2. 后续可扩展到其他 IM 渠道
3. 权限、审计、策略都能继续收敛在项目主干里
4. 第一阶段范围可控，适合先内部试点
