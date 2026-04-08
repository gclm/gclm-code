(function() {
    'use strict';

    var sessionsEl = document.getElementById('sessions');
    var emptyMsg = document.getElementById('empty-msg');
    var countBadge = document.getElementById('session-count');
    var statusBadge = document.getElementById('status');
    var tokenParam = new URLSearchParams(window.location.search).get('token') ||
        (document.cookie.match(/(?:^|;\s*)gclm_token=([^;]*)/) || [])[1] || '';

    if (!sessionsEl) return;

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function timeSince(isoStr) {
        var diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
        if (diff < 60) return diff + 's ago';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
    }

    function showSkeletons() {
        var html = '';
        for (var i = 0; i < 3; i++) {
            html += '<div class="skeleton-card">' +
                '<div class="skeleton-line short"></div>' +
                '<div class="skeleton-line medium"></div>' +
                '<div class="skeleton-line long"></div>' +
                '</div>';
        }
        sessionsEl.innerHTML = html;
    }

    var prevSessionHash = '';

    function loadSessions() {
        var headers = {};
        if (tokenParam) headers['Authorization'] = 'Bearer ' + tokenParam;

        fetch('/api/v1/sessions', { headers: headers })
            .then(function(resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.json();
            })
            .then(function(body) {
                statusBadge.className = 'status-badge online';
                statusBadge.querySelector('.status-text').textContent = 'Connected';

                var sessions = (body && body.ok && body.data && body.data.items) || [];
                if (sessions.length === 0) {
                    sessionsEl.innerHTML = '';
                    emptyMsg.style.display = 'block';
                    countBadge.textContent = '0';
                    prevSessionHash = '';
                    return;
                }

                var hash = sessions.map(function(s) {
                    return s.id + ':' + s.status + ':' + s.updatedAt;
                }).join('|');
                if (hash === prevSessionHash) return;
                prevSessionHash = hash;

                emptyMsg.style.display = 'none';
                countBadge.textContent = sessions.length;

                sessionsEl.innerHTML = sessions.map(function(s) {
                    var isRunning = s.status === 'running';
                    var termUrl = '/terminal.html?id=' + s.id + (tokenParam ? '&token=' + encodeURIComponent(tokenParam) : '');
                    var statusClass = isRunning ? 'running' : 'exited';
                    var title = s.title || s.id;
                    var preview = title.length > 80 ? title.substring(0, 80) + '...' : title;
                    var updated = s.updatedAt ? timeSince(s.updatedAt) : '';

                    return '<div class="session-card ' + statusClass + '" onclick="location.href=\'' + termUrl + '\'">' +
                        '<div class="card-header">' +
                            '<span class="name">' + escapeHtml(title) + '</span>' +
                            '<span class="card-status ' + statusClass + '">' + escapeHtml(s.status) + '</span>' +
                        '</div>' +
                        '<div class="meta">' +
                            '<span class="meta-cwd">' + escapeHtml(s.sourceChannel || 'web') + '</span>' +
                            '&middot; ' + escapeHtml(updated) +
                        '</div>' +
                        '<pre class="preview">' + escapeHtml(preview) + '</pre>' +
                        '</div>';
                }).join('');
            })
            .catch(function(e) {
                console.error('Failed to load sessions:', e);
                statusBadge.className = 'status-badge offline';
                statusBadge.querySelector('.status-text').textContent = 'Disconnected';
            });
    }

    showSkeletons();
    loadSessions();
    setInterval(loadSessions, 3000);
})();
