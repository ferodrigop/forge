export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Forge Dashboard</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
    background: #1a1b26;
    color: #a9b1d6;
    height: 100vh;
    display: flex;
    overflow: hidden;
  }

  #sidebar {
    width: 260px;
    min-width: 260px;
    background: #16161e;
    border-right: 1px solid #292e42;
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  #sidebar-header {
    padding: 16px;
    border-bottom: 1px solid #292e42;
    font-size: 14px;
    font-weight: 600;
    color: #7aa2f7;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  #sidebar-header .logo {
    font-size: 18px;
  }

  #session-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .session-item {
    padding: 10px 12px;
    border-radius: 6px;
    cursor: pointer;
    margin-bottom: 4px;
    transition: background 0.15s;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .session-item:hover {
    background: #1a1b26;
  }

  .session-item.active {
    background: #292e42;
  }

  .session-item .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .session-item .status-dot.running {
    background: #9ece6a;
    box-shadow: 0 0 4px #9ece6a88;
  }

  .session-item .status-dot.exited {
    background: #565f89;
  }

  .session-item .session-info {
    flex: 1;
    min-width: 0;
  }

  .session-item .session-cmd {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #c0caf5;
  }

  .session-item .session-id {
    font-size: 11px;
    color: #565f89;
    font-family: monospace;
  }

  #main {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100vh;
    min-width: 0;
  }

  #terminal-header {
    padding: 10px 16px;
    border-bottom: 1px solid #292e42;
    font-size: 13px;
    color: #565f89;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  #terminal-header .session-label {
    color: #7aa2f7;
    font-weight: 500;
  }

  #terminal-container {
    flex: 1;
    padding: 8px;
    min-height: 0;
  }

  #empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #565f89;
    font-size: 14px;
    flex-direction: column;
    gap: 8px;
  }

  #empty-state .hint {
    font-size: 12px;
    color: #3b4261;
  }

  #connection-status {
    padding: 8px 16px;
    border-top: 1px solid #292e42;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  #connection-status .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  #connection-status .dot.connected { background: #9ece6a; }
  #connection-status .dot.disconnected { background: #f7768e; }

  #session-list::-webkit-scrollbar { width: 4px; }
  #session-list::-webkit-scrollbar-track { background: transparent; }
  #session-list::-webkit-scrollbar-thumb { background: #292e42; border-radius: 2px; }
</style>
</head>
<body>
  <div id="sidebar">
    <div id="sidebar-header">
      <span class="logo">\u2692</span> Forge Dashboard
    </div>
    <div id="session-list"></div>
    <div id="connection-status">
      <span class="dot disconnected" id="conn-dot"></span>
      <span id="conn-text">Connecting...</span>
    </div>
  </div>
  <div id="main">
    <div id="empty-state">
      <div>No session selected</div>
      <div class="hint">Create a terminal via MCP to get started</div>
    </div>
  </div>

<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
<script>
(function() {
  let ws = null;
  let term = null;
  let fitAddon = null;
  let activeSessionId = null;
  let sessions = [];
  let resizeObserver = null;

  const sessionList = document.getElementById('session-list');
  const mainArea = document.getElementById('main');
  const connDot = document.getElementById('conn-dot');
  const connText = document.getElementById('conn-text');

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws');

    ws.onopen = function() {
      connDot.className = 'dot connected';
      connText.textContent = 'Connected';
      send({ type: 'list' });
    };

    ws.onclose = function() {
      connDot.className = 'dot disconnected';
      connText.textContent = 'Disconnected — reconnecting...';
      setTimeout(connect, 2000);
    };

    ws.onerror = function() {
      ws.close();
    };

    ws.onmessage = function(ev) {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      handleMessage(msg);
    };
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'sessions':
        sessions = msg.sessions || [];
        renderSessions();
        break;
      case 'sessionCreated':
        if (!sessions.find(function(s) { return s.id === msg.session.id; })) {
          sessions.push(msg.session);
        }
        renderSessions();
        if (!activeSessionId) selectSession(msg.session.id);
        break;
      case 'sessionClosed':
        sessions = sessions.filter(function(s) { return s.id !== msg.session.id; });
        renderSessions();
        if (activeSessionId === msg.session.id) {
          activeSessionId = null;
          showEmptyState();
        }
        break;
      case 'sessionUpdated':
        for (var i = 0; i < sessions.length; i++) {
          if (sessions[i].id === msg.session.id) {
            sessions[i] = msg.session;
          }
        }
        renderSessions();
        break;
      case 'output':
        if (msg.sessionId === activeSessionId && term) {
          term.write(msg.data);
        }
        break;
      case 'error':
        console.error('Server error:', msg.message);
        break;
    }
  }

  function renderSessions() {
    sessionList.innerHTML = '';
    if (sessions.length === 0) {
      sessionList.innerHTML = '<div style="padding:12px;color:#3b4261;font-size:12px;">No sessions</div>';
      return;
    }
    sessions.forEach(function(s) {
      var el = document.createElement('div');
      el.className = 'session-item' + (s.id === activeSessionId ? ' active' : '');
      el.innerHTML =
        '<span class="status-dot ' + s.status + '"></span>' +
        '<div class="session-info">' +
          '<div class="session-cmd">' + escapeHtml(s.command) + '</div>' +
          '<div class="session-id">' + s.id + '</div>' +
        '</div>';
      el.onclick = function() { selectSession(s.id); };
      sessionList.appendChild(el);
    });
  }

  function selectSession(id) {
    if (activeSessionId === id) return;

    if (activeSessionId) {
      send({ type: 'unsubscribe', sessionId: activeSessionId });
    }

    activeSessionId = id;
    renderSessions();
    showTerminal();
    send({ type: 'subscribe', sessionId: id });
  }

  function showTerminal() {
    mainArea.innerHTML =
      '<div id="terminal-header">' +
        '<span>Session: <span class="session-label">' + activeSessionId + '</span></span>' +
      '</div>' +
      '<div id="terminal-container"></div>';

    var container = document.getElementById('terminal-container');

    if (term) { term.dispose(); term = null; }
    if (fitAddon) { fitAddon = null; }
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }

    term = new Terminal({
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        selectionBackground: '#33467c',
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
        brightBlack: '#414868',
        brightRed: '#f7768e',
        brightGreen: '#9ece6a',
        brightYellow: '#e0af68',
        brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff',
        brightWhite: '#c0caf5',
      },
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      cursorBlink: true,
      allowProposedApi: true,
    });

    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    setTimeout(function() { fitAddon.fit(); }, 0);

    resizeObserver = new ResizeObserver(function() {
      if (fitAddon) {
        try { fitAddon.fit(); } catch {}
      }
    });
    resizeObserver.observe(container);

    term.onData(function(data) {
      send({ type: 'input', sessionId: activeSessionId, data: data });
    });

    term.onResize(function(size) {
      send({ type: 'resize', sessionId: activeSessionId, cols: size.cols, rows: size.rows });
    });
  }

  function showEmptyState() {
    if (term) { term.dispose(); term = null; }
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    mainArea.innerHTML =
      '<div id="empty-state">' +
        '<div>No session selected</div>' +
        '<div class="hint">Create a terminal via MCP to get started</div>' +
      '</div>';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  connect();
})();
</script>
</body>
</html>`;
