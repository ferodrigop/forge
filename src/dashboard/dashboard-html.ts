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
    padding: 12px 16px;
    border-bottom: 1px solid #292e42;
    font-size: 14px;
    font-weight: 600;
    color: #7aa2f7;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  #sidebar-header .logo { font-size: 18px; }
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
  #auto-follow-btn.active { background: #1a3a2a; border-color: #9ece6a; color: #9ece6a; }

  /* Tab bar */
  .tab-bar {
    display: flex;
    border-bottom: 1px solid #292e42;
    background: #16161e;
  }
  .tab-btn {
    flex: 1;
    padding: 8px 0;
    text-align: center;
    font-size: 12px;
    font-weight: 500;
    color: #565f89;
    cursor: pointer;
    border: none;
    background: transparent;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }
  .tab-btn:hover { color: #a9b1d6; }
  .tab-btn.active { color: #7aa2f7; border-bottom-color: #7aa2f7; }

  #terminals-panel, #chats-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  #session-list, #chat-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  #chat-search {
    margin: 8px;
    padding: 6px 10px;
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 4px;
    color: #c0caf5;
    font-size: 12px;
    outline: none;
    width: calc(100% - 16px);
  }
  #chat-search:focus { border-color: #7aa2f7; }
  #chat-search::placeholder { color: #3b4261; }

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
  .session-item:hover { background: #1a1b26; }
  .session-item.active { background: #292e42; }

  .session-item .status-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  }
  .session-item .status-dot.running { background: #9ece6a; box-shadow: 0 0 4px #9ece6a88; }
  .session-item .status-dot.exited { background: #565f89; }

  .session-item .session-info { flex: 1; min-width: 0; }
  .session-item .session-cmd {
    font-size: 13px; font-weight: 500; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; color: #c0caf5;
    display: flex; align-items: center; gap: 6px;
  }
  .session-item .session-cmd .ram { font-size: 11px; color: #565f89; font-weight: 400; flex-shrink: 0; }
  .session-item .session-meta {
    font-size: 11px; color: #565f89; font-family: monospace;
    display: flex; align-items: center; gap: 6px;
  }

  .session-item .close-btn {
    flex-shrink: 0; width: 20px; height: 20px; border-radius: 4px;
    border: none; background: transparent; color: #565f89;
    font-size: 14px; cursor: pointer; display: flex;
    align-items: center; justify-content: center; opacity: 0; transition: all 0.15s;
  }
  .session-item:hover .close-btn { opacity: 1; }
  .session-item .close-btn:hover { background: #f7768e22; color: #f7768e; }

  /* Chat list items */
  .chat-item {
    padding: 8px 12px; border-radius: 6px; cursor: pointer;
    margin-bottom: 4px; transition: background 0.15s;
  }
  .chat-item:hover { background: #1a1b26; }
  .chat-item.active { background: #292e42; }
  .chat-item .chat-msg {
    font-size: 12px; color: #c0caf5; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  .chat-item .chat-meta {
    font-size: 11px; color: #565f89; display: flex;
    align-items: center; gap: 6px; margin-top: 2px;
  }
  .chat-item .close-btn {
    float: right; width: 18px; height: 18px; border-radius: 4px;
    border: none; background: transparent; color: #565f89;
    font-size: 13px; cursor: pointer; opacity: 0; transition: all 0.15s;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .chat-item:hover .close-btn { opacity: 1; }
  .chat-item .close-btn:hover { background: #f7768e22; color: #f7768e; }

  .chat-project-group {
    font-size: 11px; font-weight: 600; color: #565f89;
    padding: 8px 12px 4px; text-transform: uppercase; letter-spacing: 0.5px;
  }

  #main {
    flex: 1; display: flex; flex-direction: column; height: 100vh; min-width: 0;
  }

  #terminal-header {
    padding: 10px 16px; border-bottom: 1px solid #292e42;
    font-size: 13px; color: #565f89;
    display: flex; align-items: center; justify-content: space-between;
  }
  #terminal-header .session-label { color: #7aa2f7; font-weight: 500; }

  #terminal-container { flex: 1; padding: 8px; min-height: 0; }

  #terminal-input-bar {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-top: 1px solid #292e42; background: #16161e;
  }
  #terminal-input-bar input {
    flex: 1; background: #1a1b26; border: 1px solid #292e42;
    border-radius: 4px; padding: 6px 10px; color: #c0caf5;
    font-family: monospace; font-size: 13px; outline: none;
  }
  #terminal-input-bar input:focus { border-color: #7aa2f7; }
  #terminal-input-bar input::placeholder { color: #3b4261; }
  #terminal-input-bar .input-hint { font-size: 11px; color: #3b4261; white-space: nowrap; }
  #terminal-input-bar button {
    background: #292e42; border: 1px solid #3b4261; border-radius: 4px;
    color: #a9b1d6; padding: 5px 10px; font-size: 12px; cursor: pointer; white-space: nowrap;
  }
  #terminal-input-bar button:hover { background: #3b4261; color: #c0caf5; }
  #terminal-input-bar button.ctrl-c { color: #f7768e; border-color: #f7768e44; }
  #terminal-input-bar button.ctrl-c:hover { background: #f7768e22; }

  /* Activity Log panel */
  #activity-log {
    max-height: 200px; overflow-y: auto; border-top: 1px solid #292e42;
    background: #16161e; font-size: 12px;
  }
  #activity-log-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 12px; cursor: pointer; user-select: none;
    color: #565f89; font-size: 11px; font-weight: 600;
    border-top: 1px solid #292e42; background: #16161e;
  }
  #activity-log-header:hover { color: #a9b1d6; }
  .activity-event {
    padding: 4px 12px; display: flex; align-items: center; gap: 8px;
    color: #a9b1d6;
  }
  .activity-event .activity-icon { width: 16px; text-align: center; flex-shrink: 0; }
  .activity-event .activity-name { font-weight: 500; color: #c0caf5; }
  .activity-event .activity-detail { color: #565f89; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .activity-event .activity-time { color: #3b4261; font-size: 10px; flex-shrink: 0; }
  .activity-event.error { color: #f7768e; }

  /* Chat message viewer */
  #chat-viewer {
    flex: 1; overflow-y: auto; padding: 16px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .chat-bubble {
    max-width: 85%; padding: 10px 14px; border-radius: 10px;
    font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
  }
  .chat-bubble.human { align-self: flex-end; background: #292e42; color: #c0caf5; border-bottom-right-radius: 4px; }
  .chat-bubble.assistant { align-self: flex-start; background: #1e2030; color: #a9b1d6; border-bottom-left-radius: 4px; }
  .chat-bubble .tool-block {
    background: #1a1b26; border: 1px solid #292e42; border-radius: 4px;
    padding: 6px 8px; margin: 4px 0; font-family: monospace; font-size: 12px;
    color: #7aa2f7;
  }
  .chat-header-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-bottom: 1px solid #292e42;
  }
  .chat-header-bar .continue-btn {
    background: #7aa2f7; border: none; border-radius: 4px;
    color: #1a1b26; padding: 5px 12px; font-size: 12px; font-weight: 600;
    cursor: pointer;
  }
  .chat-header-bar .continue-btn:hover { background: #89b4fa; }

  #empty-state {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: #565f89; font-size: 14px; flex-direction: column; gap: 8px;
  }
  #empty-state .hint { font-size: 12px; color: #3b4261; }

  #connection-status {
    padding: 8px 16px; border-top: 1px solid #292e42;
    font-size: 11px; display: flex; align-items: center; gap: 6px;
  }
  #connection-status .dot { width: 6px; height: 6px; border-radius: 50%; }
  #connection-status .dot.connected { background: #9ece6a; }
  #connection-status .dot.disconnected { background: #f7768e; }

  #session-list::-webkit-scrollbar, #chat-list::-webkit-scrollbar, #activity-log::-webkit-scrollbar, #chat-viewer::-webkit-scrollbar { width: 4px; }
  #session-list::-webkit-scrollbar-track, #chat-list::-webkit-scrollbar-track, #activity-log::-webkit-scrollbar-track, #chat-viewer::-webkit-scrollbar-track { background: transparent; }
  #session-list::-webkit-scrollbar-thumb, #chat-list::-webkit-scrollbar-thumb, #activity-log::-webkit-scrollbar-thumb, #chat-viewer::-webkit-scrollbar-thumb { background: #292e42; border-radius: 2px; }

  /* Delete confirmation modal */
  .modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.6); display: flex;
    align-items: center; justify-content: center; z-index: 1000;
  }
  .modal-box {
    background: #1e2030; border: 1px solid #292e42; border-radius: 8px;
    padding: 20px 24px; min-width: 320px; max-width: 400px;
  }
  .modal-box h3 { font-size: 14px; color: #c0caf5; margin-bottom: 8px; font-weight: 600; }
  .modal-box p { font-size: 12px; color: #565f89; margin-bottom: 16px; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .modal-actions button {
    padding: 6px 14px; border-radius: 4px; font-size: 12px;
    cursor: pointer; border: 1px solid #292e42; font-weight: 500;
  }
  .modal-actions .modal-cancel {
    background: transparent; color: #a9b1d6; border-color: #3b4261;
  }
  .modal-actions .modal-cancel:hover { background: #292e42; }
  .modal-actions .modal-delete {
    background: #f7768e22; color: #f7768e; border-color: #f7768e44;
  }
  .modal-actions .modal-delete:hover { background: #f7768e33; }

  .hidden { display: none !important; }
</style>
</head>
<body>
  <div id="sidebar">
    <div id="sidebar-header">
      <span class="logo">\u2692</span> Forge
      <span class="spacer"></span>
      <button id="auto-follow-btn" class="active" title="Auto-follow new sessions">Follow</button>
    </div>
    <div class="tab-bar">
      <button class="tab-btn active" data-tab="terminals">Terminals</button>
      <button class="tab-btn" data-tab="chats">Chats</button>
    </div>
    <div id="terminals-panel">
      <div id="session-list"></div>
    </div>
    <div id="chats-panel" class="hidden">
      <input type="text" id="chat-search" placeholder="Search chats...">
      <div id="chat-list"></div>
    </div>
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
  var ws = null;
  var term = null;
  var fitAddon = null;
  var activeSessionId = null;
  var sessions = [];
  var resizeObserver = null;
  var autoFollow = true;
  var streamJsonSessions = {};
  var sessionMemory = {};
  var totalMemoryMB = 0;
  var currentTab = 'terminals';
  var chatSessions = [];
  var activeChatId = null;
  var activityEvents = {}; // sessionId -> events[]
  var activityLogOpen = true;

  var sessionList = document.getElementById('session-list');
  var chatList = document.getElementById('chat-list');
  var mainArea = document.getElementById('main');
  var connDot = document.getElementById('conn-dot');
  var connText = document.getElementById('conn-text');
  var autoFollowBtn = document.getElementById('auto-follow-btn');
  var terminalsPanel = document.getElementById('terminals-panel');
  var chatsPanel = document.getElementById('chats-panel');
  var chatSearchInput = document.getElementById('chat-search');

  // Tab switching
  var tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      currentTab = btn.dataset.tab;
      tabBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      if (currentTab === 'terminals') {
        terminalsPanel.classList.remove('hidden');
        chatsPanel.classList.add('hidden');
        autoFollowBtn.classList.remove('hidden');
      } else {
        terminalsPanel.classList.add('hidden');
        chatsPanel.classList.remove('hidden');
        autoFollowBtn.classList.add('hidden');
        loadChats();
      }
    });
  });

  autoFollowBtn.onclick = function() {
    autoFollow = !autoFollow;
    autoFollowBtn.className = autoFollow ? 'active' : '';
  };

  // Chat search
  var chatSearchTimer = null;
  chatSearchInput.addEventListener('input', function() {
    clearTimeout(chatSearchTimer);
    chatSearchTimer = setTimeout(function() { loadChats(); }, 300);
  });

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
  }

  function timeAgo(isoStr) {
    if (!isoStr) return '';
    var diff = Date.now() - new Date(isoStr).getTime();
    if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  }

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws');
    ws.onopen = function() {
      connDot.className = 'dot connected';
      updateFooter();
      send({ type: 'list' });
    };
    ws.onclose = function() {
      connDot.className = 'dot disconnected';
      connText.textContent = 'Disconnected \\u2014 reconnecting...';
      setTimeout(connect, 2000);
    };
    ws.onerror = function() { ws.close(); };
    ws.onmessage = function(ev) {
      var msg;
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
        if (!activeSessionId && sessions.length > 0 && currentTab === 'terminals') {
          var running = sessions.filter(function(s) { return s.status === 'running'; });
          if (running.length > 0) selectSession(running[running.length - 1].id);
          else selectSession(sessions[sessions.length - 1].id);
        }
        break;
      case 'sessionCreated':
        if (!sessions.find(function(s) { return s.id === msg.session.id; })) sessions.push(msg.session);
        renderSessions();
        updateFooter();
        if (currentTab === 'terminals' && (autoFollow || !activeSessionId)) selectSession(msg.session.id);
        break;
      case 'sessionClosed':
        sessions = sessions.filter(function(s) { return s.id !== msg.session.id; });
        renderSessions();
        updateFooter();
        if (activeSessionId === msg.session.id) {
          var next = sessions.find(function(s) { return s.status === 'running'; });
          if (autoFollow && next) selectSession(next.id);
          else if (sessions.length > 0) selectSession(sessions[sessions.length - 1].id);
          else { activeSessionId = null; showEmptyState(); }
        }
        break;
      case 'sessionUpdated':
        for (var i = 0; i < sessions.length; i++) {
          if (sessions[i].id === msg.session.id) sessions[i] = msg.session;
        }
        renderSessions();
        updateFooter();
        break;
      case 'stats':
        totalMemoryMB = msg.totalMemoryMB || 0;
        if (msg.sessions) {
          for (var j = 0; j < msg.sessions.length; j++) sessionMemory[msg.sessions[j].id] = msg.sessions[j].memoryMB;
        }
        renderSessions();
        updateFooter();
        break;
      case 'output':
        if (msg.sessionId === activeSessionId && term) {
          var activeS = sessions.find(function(s) { return s.id === activeSessionId; });
          var isClaude = activeS && activeS.tags && activeS.tags.indexOf('claude-agent') >= 0;
          if (!isClaude) isClaude = !!streamJsonSessions[msg.sessionId];
          if (!isClaude && msg.data) {
            if (msg.data.indexOf('"type":"system"') >= 0 || msg.data.indexOf('"type":"assistant"') >= 0 ||
                msg.data.indexOf('"type":"result"') >= 0 || msg.data.indexOf('"type":"rate_limit_event"') >= 0) {
              isClaude = true;
              streamJsonSessions[msg.sessionId] = true;
            }
          }
          if (isClaude) parseStreamJson(msg.data);
          else term.write(msg.data);
        }
        break;
      case 'history':
        if (msg.events && msg.sessionId) {
          activityEvents[msg.sessionId] = msg.events;
          if (msg.sessionId === activeSessionId) renderActivityLog();
        }
        break;
      case 'history_event':
        if (msg.sessionId && msg.event) {
          if (!activityEvents[msg.sessionId]) activityEvents[msg.sessionId] = [];
          activityEvents[msg.sessionId].push(msg.event);
          if (msg.sessionId === activeSessionId) renderActivityLog();
        }
        break;
      case 'error':
        console.error('Server error:', msg.message);
        break;
    }
  }

  function renderSessions() {
    if (currentTab !== 'terminals') return;
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
      if (s.status === 'exited' && s.exitedAt) metaText += ' \\u00b7 exited ' + timeAgo(s.exitedAt);
      el.innerHTML =
        '<span class="status-dot ' + s.status + '"></span>' +
        '<div class="session-info">' +
          '<div class="session-cmd">' +
            '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(s.name || s.command) + '</span>' +
            (ramText ? '<span class="ram">' + ramText + '</span>' : '') +
          '</div>' +
          '<div class="session-meta">' + metaText + '</div>' +
        '</div>' +
        '<button class="close-btn" data-id="' + s.id + '" title="Close session">\\u00d7</button>';
      el.querySelector('.close-btn').onclick = function(e) { e.stopPropagation(); send({ type: 'close', sessionId: s.id }); };
      el.onclick = function() { selectSession(s.id); };
      sessionList.appendChild(el);
    });
  }

  function selectSession(id) {
    if (activeSessionId === id) return;
    if (activeSessionId) send({ type: 'unsubscribe', sessionId: activeSessionId });
    activeSessionId = id;
    activeChatId = null;
    jsonBuf = '';
    renderSessions();
    showTerminal();
    send({ type: 'subscribe', sessionId: id });
    // Request history for claude-agent sessions
    var s = sessions.find(function(s) { return s.id === id; });
    if (s && s.tags && s.tags.indexOf('claude-agent') >= 0) {
      send({ type: 'get_history', sessionId: id });
    }
  }

  function isClaudeSession() {
    var s = sessions.find(function(s) { return s.id === activeSessionId; });
    return s && s.tags && s.tags.indexOf('claude-agent') >= 0;
  }

  function showTerminal() {
    var activeSession = sessions.find(function(s) { return s.id === activeSessionId; });
    var headerLabel = activeSession && activeSession.name ? activeSession.name : activeSessionId;
    var isRunning = activeSession && activeSession.status === 'running';
    var showLog = isClaudeSession();
    mainArea.innerHTML =
      '<div id="terminal-header">' +
        '<span>Session: <span class="session-label">' + escapeHtml(headerLabel) + '</span></span>' +
      '</div>' +
      '<div id="terminal-container"></div>' +
      (showLog ? '<div id="activity-log-header">Activity Log <span id="activity-toggle">' + (activityLogOpen ? '\\u25bc' : '\\u25b6') + '</span></div><div id="activity-log"' + (activityLogOpen ? '' : ' class="hidden"') + '></div>' : '') +
      '<div id="terminal-input-bar">' +
        '<input type="text" id="term-input" placeholder="Type and press Enter to send..." ' + (!isRunning ? 'disabled' : '') + '>' +
        '<button class="ctrl-c" id="btn-ctrl-c" title="Send Ctrl+C"' + (!isRunning ? ' disabled' : '') + '>Ctrl+C</button>' +
        '<span class="input-hint">Enter sends with newline</span>' +
      '</div>';

    var container = document.getElementById('terminal-container');
    var termInput = document.getElementById('term-input');
    var ctrlCBtn = document.getElementById('btn-ctrl-c');
    var logHeader = document.getElementById('activity-log-header');

    if (logHeader) {
      logHeader.onclick = function() {
        activityLogOpen = !activityLogOpen;
        var logEl = document.getElementById('activity-log');
        var toggleEl = document.getElementById('activity-toggle');
        if (logEl) logEl.classList.toggle('hidden');
        if (toggleEl) toggleEl.textContent = activityLogOpen ? '\\u25bc' : '\\u25b6';
      };
    }

    termInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && activeSessionId) {
        send({ type: 'input', sessionId: activeSessionId, data: termInput.value + '\\n' });
        termInput.value = '';
      }
    });
    ctrlCBtn.addEventListener('click', function() {
      if (activeSessionId) send({ type: 'input', sessionId: activeSessionId, data: '\\x03' });
    });

    if (term) { term.dispose(); term = null; }
    if (fitAddon) { fitAddon = null; }
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }

    term = new Terminal({
      theme: {
        background: '#1a1b26', foreground: '#a9b1d6', cursor: '#c0caf5',
        selectionBackground: '#33467c', black: '#15161e', red: '#f7768e',
        green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7',
        cyan: '#7dcfff', white: '#a9b1d6', brightBlack: '#414868', brightRed: '#f7768e',
        brightGreen: '#9ece6a', brightYellow: '#e0af68', brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5',
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
      if (fitAddon) { try { fitAddon.fit(); } catch {} }
    });
    resizeObserver.observe(container);

    term.onData(function(data) { send({ type: 'input', sessionId: activeSessionId, data: data }); });
    term.onResize(function(size) { send({ type: 'resize', sessionId: activeSessionId, cols: size.cols, rows: size.rows }); });

    if (showLog) renderActivityLog();
  }

  function renderActivityLog() {
    var logEl = document.getElementById('activity-log');
    if (!logEl || !activeSessionId) return;
    var events = activityEvents[activeSessionId] || [];
    if (events.length === 0) {
      logEl.innerHTML = '<div style="padding:8px 12px;color:#3b4261;font-size:11px;">No tool calls yet</div>';
      return;
    }
    var html = '';
    var toolIcons = { Bash: '$', Write: '+', Edit: '~', Read: '>', Glob: '?', Grep: '/', Agent: '@', TaskCreate: '\\u25a1', TaskUpdate: '\\u2713' };
    var toolColors = { Bash: '#e0af68', Write: '#9ece6a', Edit: '#7dcfff', Read: '#7aa2f7', Glob: '#7aa2f7', Grep: '#7aa2f7', Agent: '#bb9af7', TaskCreate: '#e0af68', TaskUpdate: '#9ece6a' };
    for (var i = events.length - 1; i >= 0 && i >= events.length - 100; i--) {
      var ev = events[i];
      if (ev.type === 'tool_call') {
        var icon = toolIcons[ev.toolName] || '*';
        var color = toolColors[ev.toolName] || '#565f89';
        var detail = ev.summary.indexOf(':') > 0 ? ev.summary.slice(ev.summary.indexOf(':') + 2) : '';
        html += '<div class="activity-event"><span class="activity-icon" style="color:' + color + '">' + icon + '</span><span class="activity-name">' + escapeHtml(ev.toolName) + '</span><span class="activity-detail">' + escapeHtml(detail) + '</span><span class="activity-time">' + timeAgo(ev.timestamp) + '</span></div>';
      } else if (ev.type === 'tool_result' && ev.isError) {
        html += '<div class="activity-event error"><span class="activity-icon">\\u2717</span><span class="activity-detail">' + escapeHtml(ev.errorMessage || 'error') + '</span><span class="activity-time">' + timeAgo(ev.timestamp) + '</span></div>';
      } else if (ev.type === 'session_init') {
        html += '<div class="activity-event"><span class="activity-icon" style="color:#7aa2f7">\\u25b6</span><span class="activity-name">Session started</span><span class="activity-detail">' + escapeHtml((ev.model || '') + (ev.cwd ? ' ' + ev.cwd : '')) + '</span><span class="activity-time">' + timeAgo(ev.timestamp) + '</span></div>';
      }
    }
    logEl.innerHTML = html;
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

  // --- Chats ---
  function loadChats() {
    var search = chatSearchInput.value || '';
    var url = '/api/chats?limit=100' + (search ? '&search=' + encodeURIComponent(search) : '');
    fetch(url).then(function(r) { return r.json(); }).then(function(data) {
      chatSessions = data.sessions || [];
      renderChats();
    }).catch(function() {
      chatList.innerHTML = '<div style="padding:12px;color:#3b4261;font-size:12px;">Failed to load chats</div>';
    });
  }

  function renderChats() {
    chatList.innerHTML = '';
    if (chatSessions.length === 0) {
      chatList.innerHTML = '<div style="padding:12px;color:#3b4261;font-size:12px;">No chats found</div>';
      return;
    }
    // Group by project
    var groups = {};
    chatSessions.forEach(function(c) {
      if (!groups[c.project]) groups[c.project] = [];
      groups[c.project].push(c);
    });
    Object.keys(groups).forEach(function(project) {
      var items = groups[project];
      var totalBytes = items.reduce(function(sum, c) { return sum + (c.sizeBytes || 0); }, 0);
      var groupEl = document.createElement('div');
      groupEl.className = 'chat-project-group';
      groupEl.textContent = project + ' \\u2014 ' + items.length + ' chat' + (items.length !== 1 ? 's' : '') + ' \\u00b7 ' + formatSize(totalBytes);
      if (items[0] && items[0].fullPath) groupEl.title = items[0].fullPath;
      chatList.appendChild(groupEl);
      groups[project].forEach(function(c) {
        var el = document.createElement('div');
        el.className = 'chat-item' + (c.sessionId === activeChatId ? ' active' : '');
        el.innerHTML =
          '<button class="close-btn" title="Delete chat"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4m2 0v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z"/></svg></button>' +
          '<div class="chat-msg">' + escapeHtml(c.firstMessage) + '</div>' +
          '<div class="chat-meta">' + c.messageCount + ' msgs' + (c.toolCount ? ' \\u00b7 ' + c.toolCount + ' tools' : '') + ' \\u00b7 ' + formatSize(c.sizeBytes) + ' \\u00b7 ' + timeAgo(c.lastTimestamp) + (c.model ? ' \\u00b7 ' + c.model : '') + '</div>';
        el.querySelector('.close-btn').onclick = function(e) {
          e.stopPropagation();
          showDeleteModal(c.sessionId);
        };
        el.onclick = function() { openChat(c.sessionId); };
        chatList.appendChild(el);
      });
    });
  }

  function openChat(chatId) {
    activeChatId = chatId;
    activeSessionId = null;
    if (term) { term.dispose(); term = null; }
    renderChats();
    mainArea.innerHTML =
      '<div class="chat-header-bar">' +
        '<span style="color:#565f89;font-size:13px;">Chat: <span style="color:#7aa2f7;font-weight:500;">' + chatId.slice(0, 8) + '...</span></span>' +
        '<button class="continue-btn" id="continue-btn">Continue Session</button>' +
      '</div>' +
      '<div id="chat-viewer"><div style="color:#3b4261;text-align:center;">Loading...</div></div>';

    document.getElementById('continue-btn').onclick = function() {
      fetch('/api/chats/' + chatId + '/continue', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(info) {
        // Switch to terminals tab
        currentTab = 'terminals';
        tabBtns.forEach(function(b) { b.classList.remove('active'); });
        tabBtns[0].classList.add('active');
        terminalsPanel.classList.remove('hidden');
        chatsPanel.classList.add('hidden');
        autoFollowBtn.classList.remove('hidden');
        // Session will appear via WS sessionCreated event
      }).catch(function(err) { console.error('Continue failed', err); });
    };

    fetch('/api/chats/' + chatId).then(function(r) { return r.json(); }).then(function(data) {
      renderChatMessages(data.messages || []);
    }).catch(function() {
      document.getElementById('chat-viewer').innerHTML = '<div style="color:#f7768e;text-align:center;">Failed to load messages</div>';
    });
  }

  function renderChatMessages(messages) {
    var viewer = document.getElementById('chat-viewer');
    if (!viewer) return;
    if (messages.length === 0) {
      viewer.innerHTML = '<div style="color:#3b4261;text-align:center;">Empty session</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      var role = m.type || m.role || 'unknown';
      if (role === 'human' || role === 'user') {
        var text = '';
        if (m.message && m.message.content) {
          if (typeof m.message.content === 'string') text = m.message.content;
          else if (Array.isArray(m.message.content)) {
            text = m.message.content.filter(function(c) { return c.type === 'text'; }).map(function(c) { return c.text; }).join('\\n');
          }
        }
        if (text) html += '<div class="chat-bubble human">' + escapeHtml(text) + '</div>';
      } else if (role === 'assistant') {
        var parts = '';
        if (m.message && m.message.content) {
          var content = m.message.content;
          if (typeof content === 'string') {
            parts = escapeHtml(content);
          } else if (Array.isArray(content)) {
            for (var j = 0; j < content.length; j++) {
              var block = content[j];
              if (block.type === 'text' && block.text) {
                parts += escapeHtml(block.text);
              } else if (block.type === 'tool_use') {
                var toolDetail = formatToolBlock(block);
                parts += '<div class="tool-block">' + toolDetail + '</div>';
              }
            }
          }
        }
        if (parts) html += '<div class="chat-bubble assistant">' + parts + '</div>';
      }
    }
    viewer.innerHTML = html || '<div style="color:#3b4261;text-align:center;">No displayable messages</div>';
    viewer.scrollTop = viewer.scrollHeight;
  }

  function formatToolBlock(block) {
    var name = block.name || 'unknown';
    var input = block.input || {};
    var detail = name;
    if (name === 'Bash' && input.command) detail += ': ' + input.command.slice(0, 100);
    else if ((name === 'Read' || name === 'Write' || name === 'Edit') && input.file_path) detail += ': ' + input.file_path;
    else if (name === 'Glob' && input.pattern) detail += ': ' + input.pattern;
    else if (name === 'Grep' && input.pattern) detail += ': /' + input.pattern + '/';
    else if (name === 'Agent' && input.description) detail += ': ' + input.description.slice(0, 80);
    return escapeHtml(detail);
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
      try { var evt = JSON.parse(line); renderClaudeEvent(evt); }
      catch (e) { if (term && line.length > 0) term.write(line + '\\r\\n'); }
    }
  }

  function renderClaudeEvent(evt) {
    if (!term) return;
    var type = evt.type;
    if (type === 'system' && evt.subtype === 'init') {
      term.write('\\x1b[90m--- Claude session started ---\\x1b[0m\\r\\n');
      if (evt.cwd) term.write('\\x1b[90m    cwd: ' + evt.cwd + '\\x1b[0m\\r\\n');
      if (evt.model) term.write('\\x1b[90m    model: ' + evt.model + '\\x1b[0m\\r\\n');
      term.write('\\r\\n');
      return;
    }
    if (type === 'assistant' && evt.message && evt.message.content) {
      var parts = evt.message.content;
      if (typeof parts === 'string') { term.write('\\x1b[37m' + parts.replace(/\\n/g, '\\r\\n') + '\\x1b[0m\\r\\n'); return; }
      if (!Array.isArray(parts)) return;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.type === 'text' && p.text) term.write('\\x1b[37m' + p.text.replace(/\\n/g, '\\r\\n') + '\\x1b[0m\\r\\n');
        else if (p.type === 'tool_use') renderToolUse(p);
      }
      return;
    }
    if (type === 'content_block_delta') {
      if (evt.delta && evt.delta.type === 'text_delta' && evt.delta.text)
        term.write('\\x1b[37m' + evt.delta.text.replace(/\\n/g, '\\r\\n') + '\\x1b[0m');
      return;
    }
    if (type === 'content_block_start') {
      if (evt.content_block && evt.content_block.type === 'tool_use') renderToolUse(evt.content_block);
      return;
    }
    if (type === 'result') {
      var isErr = evt.is_error || (evt.error != null);
      if (isErr) {
        var errMsg = (evt.error && evt.error.message) || 'error';
        term.write('\\x1b[31m  \\u2717 ' + errMsg.slice(0, 100) + '\\x1b[0m\\r\\n');
      }
      return;
    }
  }

  function renderToolUse(p) {
    if (!term) return;
    var toolName = p.name || 'unknown';
    var input = p.input || {};
    var detail = '';
    if (toolName === 'Bash' && input.command) detail = '  ' + input.command.slice(0, 120);
    else if (toolName === 'Write' && input.file_path) detail = '  ' + input.file_path;
    else if (toolName === 'Edit' && input.file_path) detail = '  ' + input.file_path;
    else if (toolName === 'Read' && input.file_path) detail = '  ' + input.file_path;
    else if (toolName === 'Glob' && input.pattern) detail = '  ' + input.pattern;
    else if (toolName === 'Grep' && input.pattern) detail = '  /' + input.pattern + '/';
    else if (toolName === 'Agent') detail = '  ' + (input.description || '').slice(0, 80);
    else if ((toolName === 'TaskCreate' || toolName === 'TaskUpdate') && input.subject) detail = '  ' + input.subject;
    var icon = ({
      'Bash': '\\x1b[33m$\\x1b[0m', 'Write': '\\x1b[32m+\\x1b[0m', 'Edit': '\\x1b[36m~\\x1b[0m',
      'Read': '\\x1b[34m>\\x1b[0m', 'Glob': '\\x1b[34m?\\x1b[0m', 'Grep': '\\x1b[34m/\\x1b[0m',
      'Agent': '\\x1b[35m@\\x1b[0m', 'TaskCreate': '\\x1b[33m\\u25a1\\x1b[0m', 'TaskUpdate': '\\x1b[32m\\u2713\\x1b[0m',
    })[toolName] || '\\x1b[90m*\\x1b[0m';
    term.write(icon + ' \\x1b[1m' + toolName + '\\x1b[0m' + (detail ? '\\x1b[90m' + detail + '\\x1b[0m' : '') + '\\r\\n');
  }

  function showDeleteModal(sessionId) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-box">' +
        '<h3>Delete this chat session?</h3>' +
        '<p>This action cannot be undone. The session file will be permanently removed.</p>' +
        '<div class="modal-actions">' +
          '<button class="modal-cancel">Cancel</button>' +
          '<button class="modal-delete">Delete</button>' +
        '</div>' +
      '</div>';
    overlay.querySelector('.modal-cancel').onclick = function() { overlay.remove(); };
    overlay.querySelector('.modal-delete').onclick = function() {
      overlay.remove();
      fetch('/api/chats/' + sessionId, { method: 'DELETE' }).then(function() { loadChats(); });
    };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }

  connect();
})();
</script>
</body>
</html>`;
