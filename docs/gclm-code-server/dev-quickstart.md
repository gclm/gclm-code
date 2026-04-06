# `gclm-code-server` 本地开发快速启动

## 当前可直接运行的能力

- 本地启动 `gclm-code-server`
- 打开第一版自托管 Web Console
- 创建会话、发送输入、查看执行流
- 使用真实 `gclm-code` 子进程执行 turn
- 接收飞书 `events/actions` 的第一版控制面入口

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
http://127.0.0.1:4317/console
```

## 可选环境变量

```bash
GCLM_CODE_SERVER_HOST=127.0.0.1
GCLM_CODE_SERVER_PORT=4317
GCLM_CODE_SERVER_SIGNING_SECRET=local-dev-secret
GCLM_CODE_SERVER_DB_PATH=./.local/gclm-code-server/dev.db
GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS=5000
GCLM_CODE_SERVER_FEISHU_ENABLED=false
GCLM_CODE_SERVER_FEISHU_BASE_URL=https://open.feishu.cn
GCLM_CODE_SERVER_FEISHU_APP_ID=cli_app_id
GCLM_CODE_SERVER_FEISHU_APP_SECRET=cli_app_secret
GCLM_CODE_SERVER_FEISHU_VERIFICATION_TOKEN=verification_token
GCLM_CODE_SERVER_FEISHU_ENCRYPT_KEY=encrypt_key
GCLM_CODE_SERVER_FEISHU_BYPASS_SIGNATURE_VERIFICATION=false
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
GCLM_CODE_SERVER_FEISHU_VERIFICATION_TOKEN=your_verification_token
GCLM_CODE_SERVER_FEISHU_ENCRYPT_KEY=your_encrypt_key
```

## 当前 Console 可做什么

- 新建 Web session
- 连接 `/sessions/:id/stream-info` 下发的 WebSocket 流
- 提交普通文本或 slash command
- 查看 `message.completed`、`sdk.message`、`session.execution.completed` 等事件
- 对运行中的 turn 执行 interrupt

## 当前已知限制

- 当前真实执行桥接采用“每个 turn 一个 CLI 子进程”的模式
- prompt 通过 argv 传入，后续轮次通过 `--resume` 续接会话
- permission response API 虽已保留，但在当前真实 CLI 模式下暂未接通稳定的远程回写控制通道
- 飞书 adapter 已接入最小回推链路：入站建会话后会把 assistant 文本、权限待处理提示、执行失败/中断状态推回飞书
- 飞书回发层当前仍只实现最小文本消息，不包含卡片流式刷新、消息更新或复杂交互态
- 当前权限待处理会被提示到飞书，但真正的远程审批回写在真实 CLI 模式下仍未打通

## 飞书入口

- `POST /channels/feishu/events`
- `POST /channels/feishu/actions`

当前支持的最小语义：

- `url_verification`
- `im.message.receive_v1`
- `permission_response`
- `open_session`
- `resume_session`

## 飞书签名校验

- 当设置了 `GCLM_CODE_SERVER_FEISHU_VERIFICATION_TOKEN` 时，会校验 payload 中的 `token`
- 当设置了 `GCLM_CODE_SERVER_FEISHU_ENCRYPT_KEY` 时，会校验 `x-lark-request-timestamp`、`x-lark-request-nonce`、`x-lark-signature`
- 本地联调时如果确实需要跳过 header 签名校验，可以显式设置：

```bash
GCLM_CODE_SERVER_FEISHU_BYPASS_SIGNATURE_VERIFICATION=true
```

建议只在纯本地调试时使用，接入真实飞书应用后关闭

## 推荐验证顺序

1. 启动 `bun run dev:gclm-code-server`
2. 打开 `/console`
3. 新建 session 并发送 `/cost`
4. 再发 `/context`，确认 resumed turn 正常执行
5. 如需测飞书入口，可先手工 POST 到 `/channels/feishu/events`
6. 如需验证飞书 OpenAPI 凭证是否可用，可执行 `bun run smoke:feishu-openapi`
