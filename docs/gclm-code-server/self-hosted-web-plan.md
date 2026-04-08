# 自建 Web 远程方案

更新时间：2026-04-06

## 目的

本文补充回答两个已经明确的问题：

1. 我们能否自建 Web，而不是依赖官方托管 Web 服务
2. 我们能否直接复用 `references/tlive` 提供的 Web 页面

同时本文也澄清一个边界问题：

- 如果官方远程服务端不是开源、不可自建，那么它不应进入我们的正式方案

本文定位为架构方案，不是实施任务单。

## 一句话结论

结论分三条：

1. 可以自建 Web，而且更适合当前这个自定义版本
2. 可以复用 `references/tlive/core/web` 作为第一版 Web 控制台前端壳，但不能把它当成“直接可用的完整官方远程方案”
3. 官方托管的 Gclm Code Web / server 如果不能自建、不开源，就不纳入我们的正式架构依赖

因此推荐落地形态是：

- 自建 Web Console
- 复用当前仓库已有的 remote core / direct connect / permission bridge
- 借鉴并局部复用 `tlive` 的 Web 页面与交互方式
- 如需飞书入口，再在 Web / remote core 之外增加独立 `Feishu Adapter`

## 决策对象

这次真正要做的架构决策不是“要不要上 Web”，而是下面三个更具体的问题：

1. Web 页面由谁来承载
2. Web 页面背后的 session / terminal / permission backend 由谁来承载
3. 是否依赖官方托管远程服务

推荐答案分别是：

1. Web 页面由我们自己承载
2. backend 由我们自己的 remote core 或协议兼容 server 承载
3. 不依赖官方托管远程服务

## 为什么建议自建 Web

### 1. 当前仓库已经有足够的远程底座

从现有代码看，项目已经不是“缺一个 Web 才能做远程”，而是已经具备远程底层能力，只差一个更贴合我们产品边界的展示和入口层。

关键基础包括：

- 远程 session 管理
- direct connect 建链
- 权限请求与权限回传
- WebSocket 事件流
- 用户侧已有 `remote-control`、`--remote`、`--teleport`、`ssh` 等入口

也就是说，我们自建 Web 时，不需要重新发明远程协议，只需要补一个“自有 Web 控制台”。

### 2. 当前版本是自定义产品，不适合长期挂官方服务

你前面提的判断是对的：既然这是自定义版本，就没有必要把产品能力长期绑到官方服务入口上。

这么做的问题主要有三类：

- 品牌边界不清晰：用户以为在使用我们的产品，实际上进入了官方产品边界
- 后台不可控：session 生命周期、鉴权、策略、可观测性都不在我们手里
- 后续扩展受限：飞书、企业 ACL、组织策略、审计规则都不好接

如果我们目标是“通过飞书或自有 Web 远程操作项目”，那长期正确方向一定是自建控制面。

### 3. 自建 Web 更符合后续飞书接入

飞书并不一定非要直接操作终端，它更适合作为：

- 任务入口
- 会话通知入口
- 审批入口
- 恢复入口

而 Web 更适合作为：

- 完整 session 列表
- 终端视图
- 长文本与工具过程查看
- 调试与运维入口

所以更顺的产品形态不是“只有飞书”，而是：

- 飞书负责轻入口和审批
- 自建 Web 负责重交互和 session 可视化

## `references/tlive` Web 能复用到什么程度

## 1. 可以直接借鉴甚至局部直接复用的部分

`references/tlive/core/web` 本质上是一套很薄的静态前端，结构比较清晰，第一版非常适合拿来改。

可复用价值最高的是下面几部分：

### 会话列表页

对应文件：

- [index.html](/Users/gclm/workspace/lab/ai/gclm-code/references/tlive/core/web/index.html)
- [app.js](/Users/gclm/workspace/lab/ai/gclm-code/references/tlive/core/web/js/app.js)

可复用点：

- session dashboard 基本布局
- 轮询加载 session 列表
- 空态、状态徽标、会话计数
- 最近输出预览

这一页适合直接改文案、改品牌、改接口后继续使用。

### 终端页

对应文件：

- [terminal.html](/Users/gclm/workspace/lab/ai/gclm-code/references/tlive/core/web/terminal.html)
- [terminal.js](/Users/gclm/workspace/lab/ai/gclm-code/references/tlive/core/web/js/terminal.js)

可复用点：

- `xterm.js` 终端承载方式
- WebSocket 连接终端 session
- resize 同步
- 断线重连覆盖层
- 进程退出后的回跳体验

这部分作为第一版终端页的起点是合适的。

### 前端交互模式

适合继承的设计思路：

- dashboard 与 terminal 分页
- session list -> terminal detail 的二级结构
- WebSocket 直连 terminal
- 浏览器内轻认证令牌

这些模式足够简单，适合先跑通最小可用版本。

## 2. 不能直接照搬的部分

真正不能直接拿来的，不是 HTML 本身，而是它背后的接口约定和产品边界。

### 不能直接复用它的 API 合约

`tlive` Web 默认依赖的是它自己的后端约定，例如：

- `GET /api/sessions`
- `GET /ws/session/:id`
- `token` query / cookie 模式

这些接口路径、返回结构、鉴权方式，未必和我们当前项目一致。

所以正确做法不是“直接上线原页面”，而是：

- 要么我们实现一个兼容 `tlive` Web 的 adapter backend
- 要么把 `tlive` Web 改成适配我们自己的 API contract

推荐后者，因为这样不会把我们未来的 server 设计锁死在 `tlive` 的接口习惯里。

### 不能直接复用它的认证模型

`tlive` Web 里 token 传递方式比较轻，适合作为独立工具的局域网或轻部署模式，但如果我们把它作为正式产品入口，还需要补足：

- 用户身份体系
- 项目级 ACL
- tenant / workspace 隔离
- 失效控制
- 审计日志

这部分必须由我们自己定义。

### 不能直接复用它的产品边界

`tlive` 的 Web 和它自己的 daemon、bridge、session lifecycle 是配套设计的。

如果我们把整套产品边界直接搬过来，会和当前仓库已有 remote core 形成职责重叠：

- 我们已有 remote session 管理
- 它也有自己的一套 session / bridge 组织方式

长期会出现两套远程体系并存的问题，不值得。

## 建议的复用边界

推荐按下面的边界复用：

### 可直接复用或低成本改造

- HTML 页面结构
- `xterm.js` terminal 集成方式
- session list 页面布局
- reconnect / exit UX
- preview 渲染思路

### 需要适配后再复用

- `/api/sessions` 数据结构
- `/ws/session/:id` WebSocket 协议
- token 注入方式
- session 状态字段

### 建议自己重写

- auth / session binding
- permission approval 流程
- 多用户隔离
- 审计与风控
- 与现有 remote core 的 glue code

## 关于 “Gclm Code server” 的澄清

这里需要把“server”拆成两个概念，不然后面容易混淆。

### 概念 1：我们自己的协议兼容后端

这类 server 指的是：

- 我们自己实现的 remote session backend
- 或者 direct connect 兼容 server
- 负责 `/sessions`、`ws_url`、权限桥接、会话管理

这个东西是可以自建的，而且从当前仓库代码看，本项目已经具备很强的协议和 session 基础。

### 概念 2：官方托管的 Gclm Code Web / server

这类 server 指的是官方产品体系里，用来承载 Web 远程操作体验的官方后端能力。

对我们这次方案来说，关键不是它“有没有类似功能”，而是：

- 是否开源
- 是否允许自建
- 是否能被我们正式依赖

如果答案是否定的，那么它就不应该进入我们的主方案。

## 官方 server 是否开源

基于前一轮已经完成的材料整理，当前结论是：

1. 官方 CLI 仓库是公开可见的
2. 但没有发现一个可直接自建、开源交付的官方 Web 远程 backend
3. 已有公开资料更接近“官方托管运行环境”，不是“提供自建 server 套件”

因此在我们的架构决策里，应直接采用下面这条原则：

- 官方托管 Web / server 若不可自建、不开源，则不纳入正式方案

这条原则建议保留，不要摇摆。

## 推荐架构

推荐采用四层结构：

### 第一层：Remote Core

职责：

- session 创建与恢复
- 消息转发
- 工具权限请求
- 中断与重连
- 会话状态管理

来源：

- 直接复用当前仓库已有 remote 能力

### 第二层：Web Gateway

职责：

- 暴露 Web 需要的 HTTP / WebSocket API
- 做 Web auth、session lookup、user binding
- 把浏览器请求映射到 remote core

建议能力：

- `GET /api/v1/sessions`
- `GET /api/v1/sessions/:id`
- `GET /api/v1/sessions/:id/stream-info`
- `WS /ws/v1/session/:id/stream`
- `POST /api/v1/sessions/:id/input`
- `POST /api/v1/sessions/:id/permissions/:requestId/respond`

这一层是我们真正应该自己掌控的“server”。

### 第三层：Web Console

职责：

- session dashboard
- terminal 页面
- 权限提示
- 会话恢复与状态展示

建议做法：

- 第一版直接基于 `references/tlive/core/web` 改造
- 第二版再按我们自己的视觉和信息架构收敛

### 第四层：Feishu Adapter

职责：

- 飞书消息入口
- 审批卡片
- 恢复 session
- 必要时跳转 Web Console

这层不应该替代 Web，也不应该拥有独立的远程协议栈。

## 两种实现路径对比

## 路径 A：兼容 `tlive` Web 的后端接口

做法：

- 尽量保持 `tlive` Web 前端不动
- 后端实现它预期的 `/api/sessions` 与 `/ws/session/:id`

优点：

- 首版最快
- 前端改动最小

缺点：

- 后端接口被 `tlive` 历史设计牵着走
- 认证和权限模型容易被迫妥协
- 后续和飞书、ACL、审计整合时会比较别扭

适用时机：

- 只做 PoC 或两周内的内部演示

## 路径 B：改造 `tlive` Web 前端，适配我们自己的 Web Gateway

做法：

- 保留它的页面结构和终端承载方式
- 改写前端请求路径、数据模型、认证注入和状态展示

优点：

- 架构更干净
- 后续更容易接飞书、权限桥、审计和多项目治理
- 不会把正式 API 锁死在参考项目上

缺点：

- 首版略慢一些
- 需要同时动前端和 gateway

适用时机：

- 作为正式产品化路径

## 推荐选择

如果目标是“内部快速看效果”，可以先走路径 A 做一个很薄的兼容层。

如果目标是“作为我们项目的正式自建远程能力”，应直接选择路径 B。

本项目当前更适合路径 B。

## 第一阶段最小范围

建议第一阶段只覆盖：

1. Web 查看 session 列表
2. Web 打开 terminal 并进行基础输入输出
3. Web 处理断线重连与退出状态
4. Web 能承接飞书消息里的“打开会话”链接

先不要放进第一阶段：

1. 浏览器内完整工具审批中心
2. 多租户管理后台
3. 文件上传下载中心
4. 任意 shell 运维平台能力

原因是第一阶段的关键是先把“自建 Web 控制台 + 当前 remote core”跑通，不要把范围做成新产品。

## 最终建议

建议正式采纳下面这组判断：

1. 自建 Web：做，而且应作为正式方向
2. `tlive` Web：复用，但作为前端参考壳和起步实现，不作为整体后端方案
3. 官方托管 server：若不开源、不可自建，则排除
4. 正式主线：`当前 remote core + 自建 Web Gateway + 改造后的 Web Console + 可选 Feishu Adapter`

按这个方向推进，既能复用现有仓库的远程能力，也能最大化利用 `references/tlive` 已经验证过的 Web / 飞书交互经验，同时不会把我们的产品边界绑到官方托管服务上。

## 是否应该直接做 `gclm-code-server`

如果我们把目标从“先做一个 Web 页面”提升到“未来会接多个渠道”，那么直接设计一个第一方 `gclm-code-server` 是合理的，而且比每个渠道分别对接 `gclm-code` 更适合长期演进。

### 这个问题的本质

真正的决策不是“要不要 server”，而是：

1. 渠道是否应该各自实现一套会话接入逻辑
2. `gclm-code` 是否应该直接暴露给 Web / 飞书 / 钉钉
3. 是否需要一个统一的会话与权限中台

如果只考虑单一渠道和短期演示，答案可以是“不需要 server”。

但如果目标是：

- Web 控制台
- 飞书机器人
- 后续钉钉、Telegram、Discord 或企业内部入口

那么更合理的结构是引入一个薄而明确的中台层，也就是 `gclm-code-server`。

## 推荐的 `gclm-code-server` 定位

推荐把 `gclm-code-server` 定义成：

- `gclm-code` 的第一方会话编排与渠道接入层
- 一个统一暴露 HTTP / WebSocket / webhook 能力的服务
- Web、飞书、钉钉等渠道共享的会话与权限入口

它不应该是：

- 第二套独立 AI runtime
- 替代 `gclm-code` 本体的产品
- 重写现有 remote core 的平行系统

换句话说，`gclm-code-server` 应该是：

- 对上承接渠道
- 对下编排 `gclm-code`
- 中间承载身份、会话、权限、审计和路由

## 为什么这种结构更适合多渠道

### 1. 避免渠道重复造轮子

如果没有 `gclm-code-server`，Web、飞书、钉钉往往都要分别处理：

- session 创建与恢复
- 用户到 session 的映射
- 工具权限审批
- 会话状态查询
- 输出流转发

这样做短期能跑，但渠道一多就会变成三套、四套半重复逻辑。

### 2. `gclm-code` 更适合做执行面，不适合直接做所有渠道入口

从当前仓库能力看，`gclm-code` 已经很强，但它当前更像：

- CLI 主程序
- remote session client / bridge client
- direct connect 协议消费者

它已经具备很好的“执行面”能力，但并没有现成成型的“统一多渠道入口服务”。

因此更自然的分层是：

- `gclm-code` 负责执行和会话运行
- `gclm-code-server` 负责接入、编排和治理

### 3. 后续新增渠道的成本更低

如果有了 `gclm-code-server`，后续接钉钉时通常只需要新增：

- `DingTalk Adapter`
- `DingTalk Message Renderer`
- `DingTalk Approval Actions`

而不需要再重新定义：

- session API
- permission API
- 会话恢复机制
- 用户与项目绑定逻辑

这就是你说的“以后接别的渠道会不会更方便”的核心答案：会，而且会明显更方便。

## 推荐的四层结构

建议把整体形态收敛成下面四层：

### 第一层：`gclm-code`

职责：

- CLI 执行
- 工具调用
- 本地/远程会话运行
- 现有 remote core、direct connect、permission bridge 能力复用

这一层尽量不要感知飞书、钉钉、Web 页面。

### 第二层：`gclm-code-server`

职责：

- session lifecycle 管理
- user/channel/session 绑定
- HTTP / WebSocket / webhook 暴露
- approval request 聚合与回传
- 审计、ACL、策略治理
- 给各渠道提供统一 contract

建议它成为未来的“渠道中台”。

### 第三层：Channel Adapters

包括：

- Web Console
- Feishu Adapter
- DingTalk Adapter
- 未来其他 IM / App 渠道

职责：

- 接平台事件
- 调 `gclm-code-server`
- 渲染平台输出
- 回传平台按钮/审批事件

### 第四层：Policy / Org Layer

职责：

- 身份映射
- 租户隔离
- 项目授权
- 风险工具审批
- 审计与留痕

这一层可以先做薄，但一定要预留。

## 推荐的数据流

### Web

1. 浏览器请求 `gclm-code-server`
2. server 校验用户身份和访问权限
3. server 创建或附着 `gclm-code` session
4. server 将会话输出通过 WebSocket 推给 Web Console

### 飞书

1. 飞书消息进入 `Feishu Adapter`
2. adapter 调 `gclm-code-server`
3. server 路由到对应 session 或创建新 session
4. 输出流返回给 adapter，再渲染成飞书消息或卡片

### 钉钉

1. 钉钉消息进入 `DingTalk Adapter`
2. adapter 复用和飞书相同的 server contract
3. server 继续复用同一套 session / permission / audit 逻辑

也就是说，新增渠道主要是“新 adapter”，而不是“新会话系统”。

## 两种实现路径对比

### 路径 A：直接让各渠道分别对接 `gclm-code`

优点：

- 首版快
- server 可以晚一点做

缺点：

- 多渠道会快速复制逻辑
- 权限、审计、身份绑定容易散在各处
- Web 和飞书的 contract 很难统一

适合：

- 单渠道 PoC

### 路径 B：先定义 `gclm-code-server`，所有渠道统一接它

优点：

- 架构边界清楚
- 后续接钉钉成本低
- 权限与治理集中
- 能形成稳定的第一方远程接口

缺点：

- 首版比“只做前端壳”多一层抽象
- 前期要做 contract 设计

适合：

- 目标明确包含多渠道接入
- 希望做正式方案而不是一次性 PoC

## 推荐选择

如果只做内部快速演示，可以先不独立命名 `gclm-code-server`，先做一个很薄的 Web/Feishu adapter backend。

但如果你已经明确希望：

- Web
- 飞书
- 未来钉钉等更多渠道

那我更推荐从一开始就按 `gclm-code-server` 的方向设计，只是第一阶段实现保持“薄”，不要做成重平台。

## 第一阶段建议范围

第一阶段的 `gclm-code-server` 只做这些最小能力：

1. `POST /api/v1/sessions`
   - 创建或恢复一个可路由的会话
2. `GET /api/v1/sessions`
   - 查询当前用户可见的会话
3. `WS /ws/v1/session/:id/stream`
   - 订阅输出流
4. `POST /api/v1/sessions/:id/input`
   - 投递用户输入
5. `POST /api/v1/sessions/:id/permissions/:requestId/respond`
   - 回传审批结果
6. 飞书长连接事件入口
   - 由 `FeishuLongConnection` 在进程内消费 `im.message.receive_v1`、`card.action.trigger`
7. 钉钉 / 企业微信长连接
   - 后续预留

先不要一上来做：

- 全量管理后台
- 通用插件市场
- 多组织复杂编排
- 任意 shell 运维平台

## 最终结论补充

在“只做 Web Console”与“直接做统一 server”之间，如果未来明确是多渠道，我更推荐后者，但要控制第一阶段范围。

也就是：

- 架构上：直接定义 `gclm-code-server`
- 实现上：第一阶段只做薄中台
- 渠道上：先接 Web + 飞书
- 扩展上：为钉钉等后续渠道预留统一 contract
