function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderConsolePage(): string {
  const title = escapeHtml('gclm-code-server Console')

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe6;
        --panel: rgba(255, 250, 242, 0.92);
        --panel-strong: #fffdf8;
        --ink: #182126;
        --muted: #68737d;
        --line: rgba(24, 33, 38, 0.1);
        --brand: #0e7a6d;
        --brand-strong: #0b5f55;
        --accent: #e48d44;
        --danger: #ad3f2f;
        --shadow: 0 20px 60px rgba(44, 36, 27, 0.12);
        --radius: 22px;
        --mono: "SFMono-Regular", "SF Mono", ui-monospace, Menlo, monospace;
        --sans: "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: var(--sans);
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(228, 141, 68, 0.28), transparent 28%),
          radial-gradient(circle at top right, rgba(14, 122, 109, 0.18), transparent 26%),
          linear-gradient(180deg, #f8f2e9 0%, var(--bg) 50%, #efe7dc 100%);
      }

      .shell {
        width: min(1440px, calc(100vw - 32px));
        margin: 16px auto;
        display: grid;
        grid-template-columns: 340px minmax(0, 1fr);
        gap: 16px;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        backdrop-filter: blur(16px);
      }

      .sidebar {
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-height: calc(100vh - 32px);
      }

      .main {
        padding: 18px;
        display: grid;
        grid-template-rows: auto auto minmax(220px, 1fr);
        gap: 16px;
        min-height: calc(100vh - 32px);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(14, 122, 109, 0.12);
        color: var(--brand-strong);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1, h2, h3, p {
        margin: 0;
      }

      h1 {
        font-size: 28px;
        line-height: 1.1;
      }

      .subtle {
        color: var(--muted);
        font-size: 14px;
      }

      .session-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        overflow: auto;
        padding-right: 2px;
      }

      .session-card {
        width: 100%;
        text-align: left;
        border: 1px solid transparent;
        border-radius: 18px;
        padding: 14px;
        background: rgba(255, 255, 255, 0.55);
        cursor: pointer;
        transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
      }

      .session-card:hover {
        transform: translateY(-1px);
        border-color: rgba(14, 122, 109, 0.2);
      }

      .session-card.active {
        background: rgba(14, 122, 109, 0.12);
        border-color: rgba(14, 122, 109, 0.36);
      }

      .session-card-title {
        font-size: 15px;
        font-weight: 700;
      }

      .session-card-meta {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 12px;
        color: var(--muted);
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 999px;
        background: rgba(24, 33, 38, 0.06);
      }

      .toolbar, .session-head, .composer {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
      }

      .toolbar {
        justify-content: space-between;
      }

      button, textarea, input {
        font: inherit;
      }

      button {
        border: none;
        border-radius: 14px;
        padding: 11px 16px;
        cursor: pointer;
        transition: transform 140ms ease, opacity 140ms ease, background 140ms ease;
      }

      button:hover {
        transform: translateY(-1px);
      }

      button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        transform: none;
      }

      .primary {
        background: var(--brand);
        color: white;
      }

      .secondary {
        background: rgba(24, 33, 38, 0.08);
        color: var(--ink);
      }

      .danger {
        background: rgba(173, 63, 47, 0.12);
        color: var(--danger);
      }

      .stack {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .surface {
        background: var(--panel-strong);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 14px;
      }

      .terminal {
        min-height: 280px;
        max-height: 54vh;
        overflow: auto;
        padding: 16px;
        border-radius: 18px;
        background: #172126;
        color: #e4f4ec;
        font-family: var(--mono);
        white-space: pre-wrap;
        line-height: 1.55;
      }

      .event {
        margin-bottom: 14px;
        padding-bottom: 14px;
        border-bottom: 1px solid rgba(228, 244, 236, 0.1);
      }

      .event:last-child {
        border-bottom: none;
        margin-bottom: 0;
        padding-bottom: 0;
      }

      .event-label {
        color: #87d3c7;
        font-size: 12px;
        margin-bottom: 6px;
      }

      .permissions {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .permission-card {
        border: 1px solid rgba(228, 141, 68, 0.24);
        background: rgba(228, 141, 68, 0.08);
        border-radius: 16px;
        padding: 12px;
      }

      textarea {
        width: 100%;
        min-height: 120px;
        resize: vertical;
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 14px 16px;
        background: rgba(255, 255, 255, 0.72);
      }

      .status {
        min-height: 22px;
        color: var(--muted);
        font-size: 13px;
      }

      .empty {
        padding: 24px;
        border: 1px dashed rgba(24, 33, 38, 0.18);
        border-radius: 18px;
        text-align: center;
        color: var(--muted);
      }

      code {
        font-family: var(--mono);
        font-size: 12px;
      }

      @media (max-width: 1080px) {
        .shell {
          grid-template-columns: 1fr;
        }

        .sidebar, .main {
          min-height: auto;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside class="panel sidebar">
        <div class="stack">
          <span class="eyebrow">Self-hosted Console</span>
          <h1>gclm-code-server</h1>
          <p class="subtle">直接复用现有 Session API 和 WebSocket 流，便于先跑通 Web 远程操作闭环。</p>
        </div>

        <div class="toolbar">
          <h2>Sessions</h2>
          <button class="secondary" id="refresh-sessions">刷新</button>
        </div>

        <div class="surface stack">
          <label class="subtle" for="new-session-title">新会话标题</label>
          <input id="new-session-title" type="text" placeholder="例如：Remote triage" />
          <button class="primary" id="create-session">新建会话</button>
        </div>

        <div class="session-list" id="session-list">
          <div class="empty">还没有会话，先创建一个。</div>
        </div>
      </aside>

      <main class="panel main">
        <section class="surface stack">
          <div class="session-head">
            <div class="stack" style="gap: 6px">
              <h2 id="active-session-title">未选择会话</h2>
              <div class="session-card-meta" id="active-session-meta"></div>
            </div>
            <div style="margin-left: auto" class="toolbar">
              <button class="secondary" id="reconnect-stream">重连流</button>
              <button class="danger" id="interrupt-session">中断</button>
            </div>
          </div>
          <div class="status" id="status-line">等待初始化。</div>
        </section>

        <section class="surface stack">
          <div class="toolbar">
            <h3>Pending Permissions</h3>
            <span class="subtle">当前真实 CLI 模式暂未支持远程 permission response 回写，先展示为只读。</span>
          </div>
          <div class="permissions" id="permissions-list">
            <div class="empty">暂无待处理权限。</div>
          </div>
        </section>

        <section class="stack">
          <div class="surface stack">
            <h3>Console Feed</h3>
            <div class="terminal" id="event-log"></div>
          </div>

          <div class="surface stack">
            <h3>Send Input</h3>
            <textarea id="prompt-input" placeholder="输入一条消息或 slash command，例如 /cost"></textarea>
            <div class="composer">
              <button class="primary" id="send-input">发送</button>
              <button class="secondary" id="clear-log">清空本地日志</button>
            </div>
          </div>
        </section>
      </main>
    </div>

    <script>
      const state = {
        sessions: [],
        activeSessionId: null,
        socket: null,
        events: [],
      }

      const refs = {
        sessionList: document.getElementById('session-list'),
        createSession: document.getElementById('create-session'),
        refreshSessions: document.getElementById('refresh-sessions'),
        titleInput: document.getElementById('new-session-title'),
        activeTitle: document.getElementById('active-session-title'),
        activeMeta: document.getElementById('active-session-meta'),
        statusLine: document.getElementById('status-line'),
        permissionsList: document.getElementById('permissions-list'),
        eventLog: document.getElementById('event-log'),
        promptInput: document.getElementById('prompt-input'),
        sendInput: document.getElementById('send-input'),
        clearLog: document.getElementById('clear-log'),
        reconnectStream: document.getElementById('reconnect-stream'),
        interruptSession: document.getElementById('interrupt-session'),
      }

      function setStatus(text) {
        refs.statusLine.textContent = text
      }

      function formatTime(value) {
        if (!value) return 'n/a'
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
      }

      function renderSessions() {
        if (state.sessions.length === 0) {
          refs.sessionList.innerHTML = '<div class="empty">还没有会话，先创建一个。</div>'
          return
        }

        refs.sessionList.innerHTML = state.sessions.map(session => {
          const active = session.id === state.activeSessionId ? 'active' : ''
          const title = session.title || session.id
          return \`
            <button class="session-card \${active}" data-session-id="\${session.id}">
              <div class="session-card-title">\${escapeHtml(title)}</div>
              <div class="session-card-meta">
                <span class="pill">\${escapeHtml(session.status)}</span>
                <span class="pill">\${escapeHtml(session.sourceChannel)}</span>
                <span class="pill">\${escapeHtml(formatTime(session.updatedAt))}</span>
              </div>
            </button>
          \`
        }).join('')

        refs.sessionList.querySelectorAll('[data-session-id]').forEach(node => {
          node.addEventListener('click', () => selectSession(node.getAttribute('data-session-id')))
        })
      }

      function renderActiveSession() {
        const session = state.sessions.find(item => item.id === state.activeSessionId)
        if (!session) {
          refs.activeTitle.textContent = '未选择会话'
          refs.activeMeta.innerHTML = ''
          return
        }

        refs.activeTitle.textContent = session.title || session.id
        refs.activeMeta.innerHTML = [
          session.status,
          session.sourceChannel,
          session.executionSessionRef || 'no execution ref',
          formatTime(session.updatedAt),
        ].map(value => \`<span class="pill">\${escapeHtml(String(value))}</span>\`).join('')
      }

      function renderPermissions(items) {
        if (!items || items.length === 0) {
          refs.permissionsList.innerHTML = '<div class="empty">暂无待处理权限。</div>'
          return
        }

        refs.permissionsList.innerHTML = items.map(item => \`
          <div class="permission-card">
            <div><strong>\${escapeHtml(item.toolName || 'unknown')}</strong></div>
            <div class="subtle">requestId: <code>\${escapeHtml(item.id)}</code></div>
            <pre><code>\${escapeHtml(item.inputJson || '{}')}</code></pre>
          </div>
        \`).join('')
      }

      function pushEvent(type, data) {
        state.events.push({ type, data, at: new Date().toISOString() })
        if (state.events.length > 200) {
          state.events.shift()
        }

        refs.eventLog.innerHTML = state.events.map(event => {
          const text = typeof event.data === 'string'
            ? event.data
            : JSON.stringify(event.data, null, 2)
          return \`
            <div class="event">
              <div class="event-label">\${escapeHtml(event.type)} · \${escapeHtml(formatTime(event.at))}</div>
              <div>\${escapeHtml(text)}</div>
            </div>
          \`
        }).join('')
        refs.eventLog.scrollTop = refs.eventLog.scrollHeight
      }

      function upsertSession(session) {
        const index = state.sessions.findIndex(item => item.id === session.id)
        if (index >= 0) {
          state.sessions[index] = session
        } else {
          state.sessions.unshift(session)
        }
        renderSessions()
        renderActiveSession()
      }

      async function loadSessions(selectLatest = true) {
        const response = await fetch('/sessions')
        const json = await response.json()
        state.sessions = Array.isArray(json.items) ? json.items : []
        renderSessions()

        if (selectLatest && state.sessions[0]) {
          await selectSession(state.sessions[0].id)
        } else {
          renderActiveSession()
        }
      }

      async function loadPendingPermissions(sessionId) {
        const response = await fetch(\`/sessions/\${sessionId}/permissions/pending\`)
        const json = await response.json()
        renderPermissions(json.items || [])
      }

      async function connectStream(sessionId) {
        if (state.socket) {
          state.socket.close()
          state.socket = null
        }

        const response = await fetch(\`/sessions/\${sessionId}/stream-info\`)
        const json = await response.json()
        const stream = json.stream
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
        const socket = new WebSocket(\`\${protocol}//\${location.host}\${stream.path}?token=\${encodeURIComponent(stream.token)}\`)
        state.socket = socket

        socket.addEventListener('open', () => {
          setStatus(\`已连接会话流：\${sessionId}\`)
          pushEvent('console.connected', { sessionId })
        })

        socket.addEventListener('message', event => {
          const payload = JSON.parse(String(event.data))
          if (payload.type === 'session.updated' && payload.data) {
            upsertSession(payload.data)
          }
          if (payload.type === 'permission.requested' || payload.type === 'permission.cancelled') {
            loadPendingPermissions(sessionId).catch(error => {
              pushEvent('console.error', { scope: 'permissions-refresh', message: error.message })
            })
          }
          if (payload.type === 'message.completed' || payload.type === 'message.delta') {
            pushEvent(payload.type, payload.data && payload.data.text ? payload.data.text : payload.data)
            return
          }
          pushEvent(payload.type, payload.data)
        })

        socket.addEventListener('close', () => {
          if (state.socket === socket) {
            setStatus(\`会话流已断开：\${sessionId}\`)
            state.socket = null
          }
        })

        socket.addEventListener('error', () => {
          setStatus(\`会话流异常：\${sessionId}\`)
        })
      }

      async function selectSession(sessionId) {
        state.activeSessionId = sessionId
        renderSessions()
        const response = await fetch(\`/sessions/\${sessionId}\`)
        const json = await response.json()
        if (json.session) {
          upsertSession(json.session)
        }
        renderPermissions(json.pendingPermissions || [])
        await connectStream(sessionId)
      }

      async function createSession() {
        refs.createSession.disabled = true
        try {
          const response = await fetch('/sessions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sourceChannel: 'web',
              mode: 'create',
              title: refs.titleInput.value.trim() || undefined,
            }),
          })
          const json = await response.json()
          refs.titleInput.value = ''
          upsertSession(json.session)
          await selectSession(json.session.id)
          setStatus('已创建新会话。')
        } finally {
          refs.createSession.disabled = false
        }
      }

      async function sendInput() {
        if (!state.activeSessionId) {
          setStatus('请先选择一个会话。')
          return
        }

        const text = refs.promptInput.value.trim()
        if (!text) {
          setStatus('请输入消息后再发送。')
          return
        }

        refs.sendInput.disabled = true
        try {
          const response = await fetch(\`/sessions/\${state.activeSessionId}/input\`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              content: [{ type: 'text', text }],
            }),
          })
          const json = await response.json()
          refs.promptInput.value = ''
          pushEvent('console.input.submitted', json)
          setStatus(\`输入已提交：\${json.requestId}\`)
        } finally {
          refs.sendInput.disabled = false
        }
      }

      async function interruptSession() {
        if (!state.activeSessionId) {
          setStatus('请先选择一个会话。')
          return
        }

        const response = await fetch(\`/sessions/\${state.activeSessionId}/interrupt\`, {
          method: 'POST',
        })
        const json = await response.json()
        pushEvent('console.interrupt', json)
        setStatus(json.accepted ? '已请求中断当前执行。' : '当前没有可中断的执行。')
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;')
      }

      refs.createSession.addEventListener('click', () => {
        createSession().catch(error => {
          setStatus(error.message)
          pushEvent('console.error', { scope: 'create-session', message: error.message })
        })
      })
      refs.refreshSessions.addEventListener('click', () => {
        loadSessions(false).catch(error => {
          setStatus(error.message)
          pushEvent('console.error', { scope: 'load-sessions', message: error.message })
        })
      })
      refs.sendInput.addEventListener('click', () => {
        sendInput().catch(error => {
          setStatus(error.message)
          pushEvent('console.error', { scope: 'send-input', message: error.message })
        })
      })
      refs.clearLog.addEventListener('click', () => {
        state.events = []
        refs.eventLog.innerHTML = ''
      })
      refs.reconnectStream.addEventListener('click', () => {
        if (!state.activeSessionId) {
          setStatus('请先选择一个会话。')
          return
        }
        connectStream(state.activeSessionId).catch(error => {
          setStatus(error.message)
          pushEvent('console.error', { scope: 'reconnect-stream', message: error.message })
        })
      })
      refs.interruptSession.addEventListener('click', () => {
        interruptSession().catch(error => {
          setStatus(error.message)
          pushEvent('console.error', { scope: 'interrupt-session', message: error.message })
        })
      })
      refs.promptInput.addEventListener('keydown', event => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault()
          sendInput().catch(error => {
            setStatus(error.message)
            pushEvent('console.error', { scope: 'send-input', message: error.message })
          })
        }
      })

      loadSessions(true).catch(error => {
        setStatus(error.message)
        pushEvent('console.error', { scope: 'bootstrap', message: error.message })
      })
    </script>
  </body>
</html>`
}
