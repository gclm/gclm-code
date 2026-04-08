# `gclm-code-server` 本地开发快速启动

## 当前可直接运行的能力

- 本地启动 `gclm-code-server`
- 运行独立真实端口 smoke，验证 HTTP / WebSocket / PTY / 会话级签名 token 主链
- 打开第一版自托管 Web Console
- 创建会话、发送输入、查看执行流
- 使用真实 `gclm-code` 子进程执行 turn
- 通过飞书长连接接收入站消息与卡片动作
- 通过飞书 interactive card 持续更新会话状态
- 通过飞书 `CardKit streaming` 渲染 assistant 输出卡片
- 通过 bridge 的 `message.delta` 事件把 thinking / 分段输出持续推给 Web Console 与飞书

## 启动方式

在仓库根目录执行：

```bash
bun run dev:gclm-code-server
```

如果存在本地文件：

```text
.local/gclm-code-server/dev.env
```

启动脚本会自动加载其中的环境变量，适合放本地联调用的飞书参数，不会进入 git。

默认监听：

```text
http://127.0.0.1:4317
```

控制台入口：

```text
http://127.0.0.1:4317/
```

## 可选环境变量

```bash
GCLM_CODE_SERVER_HOST=127.0.0.1
GCLM_CODE_SERVER_PORT=4317
GCLM_CODE_SERVER_SIGNING_SECRET=local-dev-secret
GCLM_CODE_SERVER_AUTH_ENABLED=true
GCLM_CODE_SERVER_DB_PATH=./.local/gclm-code-server/dev.db
GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS=5000
GCLM_CODE_SERVER_FEISHU_ENABLED=false
GCLM_CODE_SERVER_FEISHU_BASE_URL=https://open.feishu.cn
GCLM_CODE_SERVER_FEISHU_APP_ID=cli_app_id
GCLM_CODE_SERVER_FEISHU_APP_SECRET=cli_app_secret
GCLM_CODE_SERVER_FEISHU_USE_LONG_CONNECTION=true
GCLM_CODE_SERVER_FEISHU_VERIFICATION_TOKEN=verification_token
GCLM_CODE_SERVER_FEISHU_ENCRYPT_KEY=encrypt_key
```

示例：

```bash
GCLM_CODE_SERVER_PORT=4320 bun run dev:gclm-code-server
```

推荐把本地飞书参数放进：

```bash
.local/gclm-code-server/dev.env
```

例如：

```bash
GCLM_CODE_SERVER_FEISHU_ENABLED=true
GCLM_CODE_SERVER_FEISHU_APP_ID=your_app_id
GCLM_CODE_SERVER_FEISHU_APP_SECRET=your_app_secret
GCLM_CODE_SERVER_FEISHU_USE_LONG_CONNECTION=true
```

## 当前 Console 可做什么

- 新建 Web session
- 打开 `terminal.html`，先通过 `GET /api/v1/sessions/:id/stream-info` 获取短 TTL 签名 token，再连接 `WS /ws/v1/session/:id`
- 提交普通文本或 slash command
- 查看 `message.completed`、`sdk.message`、`session.execution.completed` 等事件
- 对运行中的 turn 执行 interrupt

## 当前已知限制

- 当前真实执行桥接采用“每个 turn 一个 CLI 子进程”的模式
- prompt 通过 argv 传入，后续轮次通过 `--resume` 续接会话
- permission response API 虽已保留，但在当前真实 CLI 模式下暂未接通稳定的远程回写控制通道
- 飞书默认主入口已切到长连接：服务启动后会主动连接飞书事件流，不再依赖公网 webhook 才能收消息
- 飞书回发层已升级为 interactive card 主渲染，卡片结构已向 `references/tlive` 的轻量 builder 风格靠拢
- assistant 输出链路已进一步接入 `CardKit streaming`：session 进入运行态时会先创建流式卡，assistant 内容到达后更新同一张卡，turn 结束后再关闭 streaming mode
- 当前权限待处理会被提示到飞书，但真正的远程审批回写在真实 CLI 模式下仍未打通
- 当前真实 CLI bridge 还没有 token 级增量输出事件，因此飞书 streaming 现阶段是“会话级流式卡体验”，不是逐 token 打字机式渲染
- 当前 bridge 已补 `message.delta`：
  - 会优先把 thinking 内容作为早期增量推送
  - 如果后续收到 assistant 文本块，也会把最新完整文本作为增量继续推送
  - `message.completed` 仍然保留，作为本轮 assistant 最终完成信号

## 飞书入口

- 长连接主入口：
  - 依赖 `@larksuiteoapi/node-sdk`
  - 启动时自动建立 `WSClient` 长连接
  - 当前订阅：
    - `im.message.receive_v1`
    - `card.action.trigger`

当前支持的最小语义：

- `im.message.receive_v1`
- `permission_response`
- `open_session`
- `resume_session`
- `interrupt_session`

## 飞书长连接诊断

可以先做两步 smoke：

```bash
bun run smoke:feishu-openapi
bun run smoke:feishu-long-connection
```

- `smoke:feishu-openapi` 用来确认 `tenant_access_token` 是否可正常获取
- `smoke:feishu-long-connection` 会直接探测飞书长连接握手接口

如果返回 `code = 1000040350`，表示这套飞书应用的长连接配额已被其他实例占用。此时通常不是 `gclm-code-server` 代码有问题，而是需要先关闭其他仍然持有该 app 长连接的客户端或测试进程，再重新启动当前实例。

## 推荐验证顺序

1. 执行 `bun ./scripts/smoke-gclm-code-server.mjs`
   - 独立拉起临时实例，验证 `status -> auth -> create session -> stream-info -> WS stream -> PTY -> /cost`
   - 如果是在受限沙箱里执行，`Bun.serve` 可能无法监听本地端口；这种情况下请直接在宿主终端运行
2. 启动 `bun run dev:gclm-code-server`
3. 打开 `/`
4. 新建 session 并发送 `/cost`
5. 再发 `/context`，确认 resumed turn 正常执行
6. 执行 `bun run smoke:feishu-openapi`，确认飞书凭证可拿到 `tenant_access_token`
7. 执行 `bun run smoke:feishu-long-connection`，确认长连接探测未报配额占用
8. 在飞书开放平台把事件订阅方式设为“长连接（WebSocket）”，并开通 `im.message.receive_v1`、`card.action.trigger`
9. 给机器人发送消息，确认会收到持续更新的 interactive card
