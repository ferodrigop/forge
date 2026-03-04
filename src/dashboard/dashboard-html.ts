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

  #sidebar-header .spacer { flex: 1; }

  #auto-follow-btn {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid #292e42;
    background: transparent;
    color: #565f89;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  #auto-follow-btn.active {
    background: #1a3a2a;
    border-color: #9ece6a;
    color: #9ece6a;
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
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .session-item .session-cmd .ram {
    font-size: 11px;
    color: #565f89;
    font-weight: 400;
    flex-shrink: 0;
  }

  .session-item .session-meta {
    font-size: 11px;
    color: #565f89;
    font-family: monospace;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .session-item .close-btn {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: #565f89;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all 0.15s;
  }

  .session-item:hover .close-btn {
    opacity: 1;
  }

  .session-item .close-btn:hover {
    background: #f7768e22;
    color: #f7768e;
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

  #terminal-input-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-top: 1px solid #292e42;
    background: #16161e;
  }

  #terminal-input-bar input {
    flex: 1;
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 4px;
    padding: 6px 10px;
    color: #c0caf5;
    font-family: monospace;
    font-size: 13px;
    outline: none;
  }

  #terminal-input-bar input:focus {
    border-color: #7aa2f7;
  }

  #terminal-input-bar input::placeholder {
    color: #3b4261;
  }

  #terminal-input-bar .input-hint {
    font-size: 11px;
    color: #3b4261;
    white-space: nowrap;
  }

  #terminal-input-bar button {
    background: #292e42;
    border: 1px solid #3b4261;
    border-radius: 4px;
    color: #a9b1d6;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  #terminal-input-bar button:hover {
    background: #3b4261;
    color: #c0caf5;
  }

  #terminal-input-bar button.ctrl-c {
    color: #f7768e;
    border-color: #f7768e44;
  }

  #terminal-input-bar button.ctrl-c:hover {
    background: #f7768e22;
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
      <span class="spacer"></span>
      <button id="auto-follow-btn" class="active" title="Auto-follow new sessions">Follow</button>
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
  let autoFollow = true;
  let streamJsonSessions = {}; // sessionId -> true if detected as stream-json
  let sessionMemory = {}; // sessionId -> memoryMB (updated via stats)
  let totalMemoryMB = 0;

  const sessionList = document.getElementById('session-list');
  const mainArea = document.getElementById('main');
  const connDot = document.getElementById('conn-dot');
  const connText = document.getElementById('conn-text');
  const autoFollowBtn = document.getElementById('auto-follow-btn');

  autoFollowBtn.onclick = function() {
    autoFollow = !autoFollow;
    autoFollowBtn.className = autoFollow ? 'active' : '';
  };

  function timeAgo(isoStr) {
    if (!isoStr) return '';
    var diff = Date.now() - new Date(isoStr).getTime();
    if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws');

    ws.onopen = function() {
      connDot.className = 'dot connected';
      updateFooter();
      send({ type: 'list' });
    };

    ws.onclose = function() {
      connDot.className = 'dot disconnected';
      connText.textContent = 'Disconnected \u2014 reconnecting...';
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

  function updateFooter() {
    var running = sessions.filter(function(s) { return s.status === 'running'; }).length;
    var label = 'Connected | ' + running + ' session' + (running !== 1 ? 's' : '');
    if (totalMemoryMB > 0) {
      label += ' | ' + (totalMemoryMB >= 1024 ? (totalMemoryMB / 1024).toFixed(1) + ' GB' : totalMemoryMB + ' MB');
    }
    connText.textContent = label;
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'sessions':
        sessions = msg.sessions || [];
        renderSessions();
        updateFooter();
        // Auto-select on initial load if nothing is selected
        if (!activeSessionId && sessions.length > 0) {
          var running = sessions.filter(function(s) { return s.status === 'running'; });
          if (running.length > 0) {
            selectSession(running[running.length - 1].id);
          } else {
            selectSession(sessions[sessions.length - 1].id);
          }
        }
        break;
      case 'sessionCreated':
        if (!sessions.find(function(s) { return s.id === msg.session.id; })) {
          sessions.push(msg.session);
        }
        renderSessions();
        updateFooter();
        if (autoFollow || !activeSessionId) selectSession(msg.session.id);
        break;
      case 'sessionClosed':
        sessions = sessions.filter(function(s) { return s.id !== msg.session.id; });
        renderSessions();
        updateFooter();
        if (activeSessionId === msg.session.id) {
          var nextRunning = sessions.find(function(s) { return s.status === 'running'; });
          if (autoFollow && nextRunning) {
            selectSession(nextRunning.id);
          } else if (sessions.length > 0) {
            selectSession(sessions[sessions.length - 1].id);
          } else {
            activeSessionId = null;
            showEmptyState();
          }
        }
        break;
      case 'sessionUpdated':
        for (var i = 0; i < sessions.length; i++) {
          if (sessions[i].id === msg.session.id) {
            sessions[i] = msg.session;
          }
        }
        renderSessions();
        updateFooter();
        break;
      case 'stats':
        totalMemoryMB = msg.totalMemoryMB || 0;
        if (msg.sessions) {
          for (var j = 0; j < msg.sessions.length; j++) {
            sessionMemory[msg.sessions[j].id] = msg.sessions[j].memoryMB;
          }
        }
        renderSessions();
        updateFooter();
        break;
      case 'output':
        if (msg.sessionId === activeSessionId && term) {
          var activeS = sessions.find(function(s) { return s.id === activeSessionId; });
          var isClaude = activeS && activeS.tags && activeS.tags.indexOf('claude-agent') >= 0;
          // Check cached detection
          if (!isClaude) isClaude = !!streamJsonSessions[msg.sessionId];
          // Fallback: detect stream-json by content markers anywhere in data
          if (!isClaude && msg.data) {
            if (msg.data.indexOf('"type":"system"') >= 0 ||
                msg.data.indexOf('"type":"assistant"') >= 0 ||
                msg.data.indexOf('"type":"result"') >= 0 ||
                msg.data.indexOf('"type":"rate_limit_event"') >= 0) {
              isClaude = true;
              streamJsonSessions[msg.sessionId] = true;
            }
          }
          if (isClaude) {
            parseStreamJson(msg.data);
          } else {
            term.write(msg.data);
          }
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

      var memMB = sessionMemory[s.id];
      var ramText = '';
      if (s.status === 'running' && memMB != null && memMB > 0) {
        ramText = memMB >= 1024 ? (memMB / 1024).toFixed(1) + ' GB' : memMB + ' MB';
      }

      var metaText = s.id;
      if (s.status === 'exited' && s.exitedAt) {
        metaText += ' \u00b7 exited ' + timeAgo(s.exitedAt);
      }

      el.innerHTML =
        '<span class="status-dot ' + s.status + '"></span>' +
        '<div class="session-info">' +
          '<div class="session-cmd">' +
            '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(s.name || s.command) + '</span>' +
            (ramText ? '<span class="ram">' + ramText + '</span>' : '') +
          '</div>' +
          '<div class="session-meta">' + metaText + '</div>' +
        '</div>' +
        '<button class="close-btn" data-id="' + s.id + '" title="Close session">\u00d7</button>';

      el.querySelector('.close-btn').onclick = function(e) {
        e.stopPropagation();
        send({ type: 'close', sessionId: s.id });
      };
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
    jsonBuf = ''; // Reset stream-json buffer on session switch
    renderSessions();
    showTerminal();
    send({ type: 'subscribe', sessionId: id });
  }

  function showTerminal() {
    var activeSession = sessions.find(function(s) { return s.id === activeSessionId; });
    var headerLabel = activeSession && activeSession.name ? activeSession.name : activeSessionId;
    var isRunning = activeSession && activeSession.status === 'running';
    mainArea.innerHTML =
      '<div id="terminal-header">' +
        '<span>Session: <span class="session-label">' + escapeHtml(headerLabel) + '</span></span>' +
      '</div>' +
      '<div id="terminal-container"></div>' +
      '<div id="terminal-input-bar">' +
        '<input type="text" id="term-input" placeholder="Type and press Enter to send..." ' + (!isRunning ? 'disabled' : '') + '>' +
        '<button class="ctrl-c" id="btn-ctrl-c" title="Send Ctrl+C"' + (!isRunning ? ' disabled' : '') + '>Ctrl+C</button>' +
        '<span class="input-hint">Enter sends with newline</span>' +
      '</div>';

    var container = document.getElementById('terminal-container');
    var termInput = document.getElementById('term-input');
    var ctrlCBtn = document.getElementById('btn-ctrl-c');

    // Input bar: send text + newline on Enter
    termInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && activeSessionId) {
        var val = termInput.value;
        send({ type: 'input', sessionId: activeSessionId, data: val + '\\n' });
        termInput.value = '';
      }
    });

    // Ctrl+C button
    ctrlCBtn.addEventListener('click', function() {
      if (activeSessionId) {
        send({ type: 'input', sessionId: activeSessionId, data: '\\x03' });
      }
    });

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

  // --- Stream-JSON parser for claude-agent sessions ---
  var jsonBuf = '';

  function parseStreamJson(raw) {
    jsonBuf += raw;
    var lines = jsonBuf.split('\\n');
    jsonBuf = lines.pop() || '';

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      try {
        var evt = JSON.parse(line);
        renderClaudeEvent(evt);
      } catch (e) {
        // Not JSON — write raw (e.g. startup text)
        if (term && line.length > 0) term.write(line + '\\r\\n');
      }
    }
  }

  function renderClaudeEvent(evt) {
    if (!term) return;

    var type = evt.type;

    // System init — show a brief header
    if (type === 'system' && evt.subtype === 'init') {
      term.write('\\x1b[90m--- Claude session started ---\\x1b[0m\\r\\n');
      if (evt.cwd) term.write('\\x1b[90m    cwd: ' + evt.cwd + '\\x1b[0m\\r\\n');
      if (evt.model) term.write('\\x1b[90m    model: ' + evt.model + '\\x1b[0m\\r\\n');
      term.write('\\r\\n');
      return;
    }

    // Assistant text + tool_use content
    if (type === 'assistant' && evt.message && evt.message.content) {
      var parts = evt.message.content;
      if (typeof parts === 'string') {
        term.write('\\x1b[37m' + parts.replace(/\\n/g, '\\r\\n') + '\\x1b[0m\\r\\n');
        return;
      }
      if (!Array.isArray(parts)) return;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.type === 'text' && p.text) {
          term.write('\\x1b[37m' + p.text.replace(/\\n/g, '\\r\\n') + '\\x1b[0m\\r\\n');
        } else if (p.type === 'tool_use') {
          renderToolUse(p);
        }
      }
      return;
    }

    // Content block delta (streaming text)
    if (type === 'content_block_delta') {
      if (evt.delta && evt.delta.type === 'text_delta' && evt.delta.text) {
        term.write('\\x1b[37m' + evt.delta.text.replace(/\\n/g, '\\r\\n') + '\\x1b[0m');
      }
      return;
    }

    // Content block start (tool_use)
    if (type === 'content_block_start') {
      if (evt.content_block && evt.content_block.type === 'tool_use') {
        renderToolUse(evt.content_block);
      }
      return;
    }

    // Tool results
    if (type === 'result') {
      var isErr = evt.is_error || (evt.error != null);
      if (isErr) {
        var errMsg = (evt.error && evt.error.message) || 'error';
        term.write('\\x1b[31m  \u2717 ' + errMsg.slice(0, 100) + '\\x1b[0m\\r\\n');
      }
      return;
    }

    // Ignore other types silently (e.g., message_start, message_delta, message_stop)
  }

  function renderToolUse(p) {
    if (!term) return;
    var toolName = p.name || 'unknown';
    var input = p.input || {};
    var detail = '';
    if (toolName === 'Bash' && input.command) {
      detail = '  ' + input.command.slice(0, 120);
    } else if (toolName === 'Write' && input.file_path) {
      detail = '  ' + input.file_path;
    } else if (toolName === 'Edit' && input.file_path) {
      detail = '  ' + input.file_path;
    } else if (toolName === 'Read' && input.file_path) {
      detail = '  ' + input.file_path;
    } else if (toolName === 'Glob' && input.pattern) {
      detail = '  ' + input.pattern;
    } else if (toolName === 'Grep' && input.pattern) {
      detail = '  /' + input.pattern + '/';
    } else if (toolName === 'Agent') {
      detail = '  ' + (input.description || '').slice(0, 80);
    } else if ((toolName === 'TaskCreate' || toolName === 'TaskUpdate') && input.subject) {
      detail = '  ' + input.subject;
    }
    var icon = ({
      'Bash': '\\x1b[33m$\\x1b[0m',
      'Write': '\\x1b[32m+\\x1b[0m',
      'Edit': '\\x1b[36m~\\x1b[0m',
      'Read': '\\x1b[34m>\\x1b[0m',
      'Glob': '\\x1b[34m?\\x1b[0m',
      'Grep': '\\x1b[34m/\\x1b[0m',
      'Agent': '\\x1b[35m@\\x1b[0m',
      'TaskCreate': '\\x1b[33m\u25a1\\x1b[0m',
      'TaskUpdate': '\\x1b[32m\u2713\\x1b[0m',
    })[toolName] || '\\x1b[90m*\\x1b[0m';
    term.write(icon + ' \\x1b[1m' + toolName + '\\x1b[0m' + (detail ? '\\x1b[90m' + detail + '\\x1b[0m' : '') + '\\r\\n');
  }

  connect();
})();
</script>
</body>
</html>`;
