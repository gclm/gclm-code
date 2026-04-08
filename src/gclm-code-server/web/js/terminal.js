(function() {
    'use strict';

    var params = new URLSearchParams(window.location.search);
    var sessionId = params.get('id');

    if (!sessionId) {
        document.getElementById('terminal').textContent = 'Error: no session ID';
        return;
    }

    var term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "'Cascadia Mono', 'Cascadia Code', 'MesloLGS NF', 'Menlo', 'Consolas', 'DejaVu Sans Mono', monospace",
        theme: {
            background: '#0d1117',
            foreground: '#e6edf3',
            cursor: '#4ecca3',
            selectionBackground: '#264f78',
        },
        allowProposedApi: true,
    });

    var fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    var termEl = document.getElementById('terminal');
    term.open(termEl);

    var statusBadge = document.getElementById('session-status');
    var statusText = document.getElementById('status-text');
    var overlay = document.getElementById('disconnect-overlay');

    var wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var tokenParam = params.get('token') ||
        (document.cookie.match(/(?:^|;\s*)gclm_token=([^;]*)/) || [])[1] || '';
    var backLink = document.getElementById('back-link');
    if (backLink && tokenParam) {
        backLink.href = '/?token=' + encodeURIComponent(tokenParam);
    }
    var ws = null;
    var reconnectTimer = null;
    var processExited = false;
    var inputBuffer = '';
    var submitting = false;
    var connectAttempt = 0;

    function authHeaders() {
        var headers = {};
        if (tokenParam) headers['Authorization'] = 'Bearer ' + tokenParam;
        return headers;
    }

    function submitInput(text) {
        if (submitting) return;
        var trimmed = text.replace(/\r/g, '').trim();
        if (!trimmed) return;
        submitting = true;
        var headers = authHeaders();
        headers['Content-Type'] = 'application/json';
        fetch('/api/v1/sessions/' + sessionId + '/input', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                content: [{ type: 'text', text: trimmed }]
            })
        }).then(function(r) {
            return r.json();
        }).then(function(body) {
            if (!body || !body.ok) {
                term.write('\r\n\x1b[31m[submit failed]\x1b[0m\r\n');
            }
        }).catch(function() {
            term.write('\r\n\x1b[31m[submit failed]\x1b[0m\r\n');
        }).finally(function() {
            submitting = false;
        });
    }

    function setConnected(connected) {
        if (connected) {
            statusBadge.className = 'status-badge online';
            statusText.textContent = 'Connected';
            overlay.style.display = 'none';
        } else {
            statusBadge.className = 'status-badge offline';
            statusText.textContent = 'Reconnecting...';
            overlay.style.display = 'flex';
        }
    }

    function fetchSessionToken() {
        return fetch('/api/v1/sessions/' + sessionId + '/stream-info', {
            headers: authHeaders(),
        }).then(function(r) {
            return r.json().then(function(body) {
                if (!r.ok || !body || !body.ok || !body.data || !body.data.stream || !body.data.stream.token) {
                    throw new Error('failed to fetch session token');
                }
                return body.data.stream.token;
            });
        });
    }

    function connect() {
        fetchSessionToken().then(function(sessionToken) {
            var wsUrl = wsProtocol + '//' + location.host + '/ws/v1/session/' + sessionId +
                '?token=' + encodeURIComponent(sessionToken);
            ws = new WebSocket(wsUrl);

            ws.onopen = function() {
                connectAttempt = 0;
                setConnected(true);
                fitAddon.fit();
            };

            ws.onmessage = function(event) {
                if (typeof event.data === 'string') {
                    try {
                        var ctrl = JSON.parse(event.data);
                        if (ctrl.type === 'exit') {
                            processExited = true;
                            showExitOverlay(ctrl.code);
                            return;
                        }
                        if (ctrl.type === 'size') {
                            return;
                        }
                    } catch(e) { /* not JSON, treat as terminal data */ }
                    term.write(event.data);
                    return;
                }
                var data = new TextDecoder().decode(event.data);
                term.write(data);
            };

            ws.onclose = function() {
                if (processExited) return;
                setConnected(false);
                reconnectTimer = setTimeout(connect, 2000);
            };

            ws.onerror = function() { ws.close(); };
        }).catch(function() {
            if (processExited) return;
            setConnected(false);
            if (connectAttempt === 0) {
                term.write('\r\n\x1b[31m[failed to fetch terminal session token]\x1b[0m\r\n');
            }
            connectAttempt += 1;
            reconnectTimer = setTimeout(connect, 2000);
        });
    }

    term.onData(function(data) {
        if (data === '\r') {
            term.write('\r\n');
            var submitted = inputBuffer;
            inputBuffer = '';
            submitInput(submitted);
            return;
        }
        if (data === '\u007f') {
            if (inputBuffer.length > 0) {
                inputBuffer = inputBuffer.slice(0, -1);
                term.write('\b \b');
            }
            return;
        }
        inputBuffer += data;
        term.write(data);
    });

    window.addEventListener('resize', function() {
        fitAddon.fit();
    });

    // Fetch session info for header
    fetch('/api/v1/sessions/' + sessionId, { headers: authHeaders() })
        .then(function(r) { return r.json(); })
        .then(function(body) {
            var s = (body && body.ok && body.data && body.data.session) || {};
            document.getElementById('session-name').textContent =
                (s.title || s.id) + ' \u00b7 ' + (s.status || 'unknown');
        });

    function showExitOverlay(code) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        statusBadge.className = 'status-badge offline';
        statusText.textContent = 'Exited';
        var content = overlay.querySelector('.disconnect-content');
        content.innerHTML =
            '<div class="disconnect-icon">&#9209;</div>' +
            '<p>Process exited (code ' + code + ')</p>' +
            '<p class="disconnect-hint">Redirecting to dashboard...</p>';
        overlay.style.display = 'flex';
        setTimeout(function() {
            window.location.href = '/' + (tokenParam ? '?token=' + encodeURIComponent(tokenParam) : '');
        }, 3000);
    }

    connect();
})();
