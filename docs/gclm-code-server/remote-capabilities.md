# 远程能力盘点

更新时间：2026-04-06

## 目的

本文盘点当前仓库里已经存在的远程能力，区分：

- 已有实现的底层能力
- 用户可见的命令入口
- 是否可直接尝试
- 直接使用前的前提条件

本文只基于仓库当前代码和文档做分析，不假设某个特定线上环境一定已开启全部能力。

## 总体结论

当前项目并不缺“远程能力内核”，相反已经具备多条远程链路：

1. `remote-control`：把本地 CLI 会话接到 Web / App 远程继续使用
2. `--remote` / `--teleport`：创建或恢复远程会话
3. `ssh`：把 CLI 跑到远程主机上，本地渲染 UI
4. `direct connect`：连接一个兼容的远程 Gclm Code server
5. 远程会话协议层：消息流、权限请求、权限回传、中断
6. 远程辅助命令：`session`、`remote-env`、`web-setup`

但这些能力不是全部都处于“公开 GA、无条件开箱即用”的状态。当前远程能力明显分成三层：

- 可直接尝试的用户能力
- 已实现但带有 feature gate / 策略门禁的能力
- 不直接面向用户、但已经很完整的底层协议能力

## 能力分层

### A. 最像可直接使用的能力

#### 1. Remote Control

用途：把本地环境接到 `claude.ai/code` 或 Claude App，从其他设备继续操作当前终端会话。

主要证据：

- 命令定义在 [src/commands/bridge/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/commands/bridge/index.ts)
- 帮助文案在 [src/bridge/bridgeMain.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/bridge/bridgeMain.ts)

关键信号：

- 命令名是 `remote-control`，别名 `rc`
- 描述为“Connect this terminal for remote-control sessions”
- 帮助文案明确写到可以从 web 或 app 访问本地环境

是否可直接尝试：可以。

前提条件：

- 当前构建启用了 `BRIDGE_MODE`
- 运行时 `isBridgeEnabled()` 返回真
- 通常需要已登录且满足产品侧订阅 / 权限要求

风险判断：

- 这是仓库里最明确的一条远程主线
- 但命令在 CLI 帮助里被刻意隐藏，说明它已经存在，但当前仍是受控开放而非完全公开

建议试用顺序：

1. 先确认当前二进制是否包含 `BRIDGE_MODE`
2. 运行 `gc remote-control` 或会话内 `/remote-control`
3. 如果命令不可见或不可用，再回看 feature gate 与账号条件

#### 2. SSH Remote

用途：通过 SSH 在远程 Linux 主机上运行 Gclm Code，本地继续用 TUI 交互。

主要证据：

- 入口和说明在 [src/main.tsx](/Users/gclm/workspace/lab/ai/gclm-code/src/main.tsx)

关键信号：

- 子命令形态为 `gc ssh <host> [dir]`
- 描述里明确写到：自动部署二进制、通过本地机器反向代理 API 认证、不要求远端预先 setup
- 注释里明确写到：工具在远端运行，UI 在本地渲染

是否可直接尝试：可以，而且是当前最值得优先试的一条。

前提条件：

- 当前构建启用了 `SSH_REMOTE`
- 本地到目标主机 SSH 可达
- 远端环境满足运行要求

风险判断：

- 这条链路的产品语义很清楚，偏向工程实用能力
- 对“远程操作项目”这个目标来说，它比 IM 集成更接近立即可落地的生产路径

建议试用顺序：

1. 先用一台测试机跑 `gc ssh <user@host> <dir>`
2. 确认二进制部署、权限模式、中断和文件操作都正常
3. 再评估是否要继续叠加飞书渠道层

### B. 已实现但明显还在受控开放的能力

#### 3. `--remote` / `--teleport`

用途：

- `--remote` 创建远程会话
- `--teleport` 恢复远程会话

主要证据：

- 参数定义在 [src/main.tsx](/Users/gclm/workspace/lab/ai/gclm-code/src/main.tsx)
- 会话创建与恢复逻辑也在 [src/main.tsx](/Users/gclm/workspace/lab/ai/gclm-code/src/main.tsx)

关键信号：

- 注释明确写到：这些 flag 对所有 build 打开，但仍隐藏帮助，说明“已实现但未 GA”
- 远程会话创建会检查 `allow_remote_sessions` 组织策略
- 会生成远程 URL，并给出 `gc --teleport <sessionId>` 恢复路径

是否可直接尝试：可以尝试，但不应把它视为完全公开、完全稳定的默认入口。

前提条件：

- 组织策略允许 `allow_remote_sessions`
- 当前账号认证可用
- 远程后端链路可用
- 某些模式可能还受 runtime feature 控制

风险判断：

- 仓库实现相对完整
- 但明显还处于“可用、未正式公开”的阶段
- 适合内部试点，不适合作为对外默认文案

#### 4. `web-setup` / `remote-env`

用途：

- `web-setup`：配置 Web 侧远程环境
- `remote-env`：配置 teleport session 的默认远程环境

主要证据：

- [src/commands/remote-setup/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/commands/remote-setup/index.ts)
- [src/commands/remote-env/index.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/commands/remote-env/index.ts)

是否可直接尝试：通常不建议把它们当第一入口。

前提条件：

- `web-setup` 需要远程 session 策略允许，且还受 runtime feature 开关约束
- `remote-env` 需要订阅身份和远程 session 策略都满足

风险判断：

- 它们更像配套命令，不是远程能力的起点
- 适合在主远程链路跑通后再配置

#### 5. Assistant Viewer

用途：附着到一个远程 assistant session，以 viewer 模式接收实时事件。

主要证据：

- 相关逻辑在 [src/main.tsx](/Users/gclm/workspace/lab/ai/gclm-code/src/main.tsx)

是否可直接尝试：技术上可以，但更像产品内特定模式，而不是通用远控入口。

前提条件：

- 对应 feature 和远端会话环境可用
- 登录态与远端发现链路正常

风险判断：

- 这是建立在现有 remote session 协议之上的附着式视图能力
- 对外部集成的参考价值高，对普通用户入口的价值次之

### C. 偏基础设施 / 集成能力

#### 6. Direct Connect

用途：连接一个兼容协议的远程 Gclm Code server。

主要证据：

- 入口逻辑在 [src/main.tsx](/Users/gclm/workspace/lab/ai/gclm-code/src/main.tsx)
- 会话创建逻辑在 [src/server/createDirectConnectSession.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/server/createDirectConnectSession.ts)
- 连接管理在 [src/server/directConnectManager.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/server/directConnectManager.ts)

关键信号：

- 会向远端 `POST /sessions`
- 拿到 `session_id` 与 `ws_url`
- 之后通过 WebSocket 收发消息和权限请求

是否可直接尝试：如果你手上已经有兼容的 server / `cc://` URL，可以。

前提条件：

- 当前构建启用了 `DIRECT_CONNECT`
- 已有可连接的远端 server
- server 实现兼容当前协议

风险判断：

- 这更像系统对系统对接能力
- 对飞书接入非常重要，因为它说明渠道层不必自己发明远控协议

## 底层远程协议能力

这一层不是终端用户直接操作的入口，但对后续接飞书、App、Web 或其他 IM 渠道很关键。

### 1. `RemoteSessionManager`

职责：

- 通过 WebSocket 订阅远端 session
- 通过 HTTP 发送用户消息
- 接收权限请求和取消事件
- 把权限结果回传到远端
- 处理重连和错误

代码位置：

- [src/remote/RemoteSessionManager.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/remote/RemoteSessionManager.ts)

判断：

- 这已经是一套完整的“远程会话客户端”
- 如果后面接飞书，飞书层不应该重新发明这一层

### 2. `DirectConnectSessionManager`

职责：

- 建立 direct connect 的 WebSocket 会话
- 发送用户消息
- 接收权限请求
- 发送中断和权限响应

代码位置：

- [src/server/directConnectManager.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/server/directConnectManager.ts)

判断：

- 这说明仓库已经具备一个更通用的远程协议通道
- 未来接第三方入口时可以复用

### 3. `remotePermissionBridge`

职责：

- 把远端的工具权限请求包装成本地 UI 可以消费的结构
- 为本地未知工具创建 stub，避免远端工具集扩展时客户端直接崩掉

代码位置：

- [src/remote/remotePermissionBridge.ts](/Users/gclm/workspace/lab/ai/gclm-code/src/remote/remotePermissionBridge.ts)

判断：

- 这是远程审批桥最关键的一块之一
- 说明现有内核天然适合做“IM 上审批工具权限”这类能力

## 当前是否能直接使用

### 可以优先尝试

1. `gc ssh <host> [dir]`
2. `gc remote-control` 或会话内 `/remote-control`
3. `gc --remote "你的任务描述"`
4. `gc --teleport <sessionId>`

### 可以尝试，但更偏受控 / 实验

1. `web-setup`
2. `remote-env`
3. Assistant viewer
4. direct connect / `open <cc-url>`

### 不应被理解成“开箱即用”

以下情况会让远程能力存在于代码里，但你当前无法直接成功跑通：

1. 构建时没带上相关 feature gate
2. 运行时账号不是目标可用身份
3. 组织策略关闭了 `allow_remote_sessions`
4. 远端服务端链路当前不可用
5. 某些命令仍被刻意隐藏，说明产品上还没完全放开

## 建议的试用顺序

如果你的目标是先验证“当前项目能不能远程操作”，建议按下面顺序来：

1. 先试 `gc ssh <host> [dir]`
2. 再试 `gc remote-control`
3. 然后试 `gc --remote "任务"`
4. 如果你有兼容 server，再试 direct connect

这样排序的原因：

- SSH Remote 最直接，最不依赖产品侧 Web 远端环境
- Remote Control 最接近官方面向用户的远控形态
- `--remote` / `--teleport` 更像受控开放中的远程 session 能力
- direct connect 更偏集成能力，不适合拿来做第一验证路径

## 对飞书接入的含义

这份盘点的核心结论是：

- 当前仓库已经有可复用的远程会话内核
- 如果要做飞书远程入口，不应把飞书做成第二套远控协议
- 更合理的方向是：让飞书只做渠道层，复用现有 remote session、direct connect、permission bridge

也就是说，飞书接入不需要从零开始做“远程控制”，而是应该接在现有 remote core 之上。
