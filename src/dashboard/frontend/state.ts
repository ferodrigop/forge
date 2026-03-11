export const STATE_JS = `
var sessions = signal([]);
const activeSessionId = signal(null);
const autoFollow = signal(true);
const currentTab = signal('terminals');
const activeModal = signal(null); // { type: 'newTerminal' } | { type: 'deleteChat', chatId }
const termInstance = signal(null);
const fitAddonInstance = signal(null);
const sessionMemory = signal({});
const sessionTokens = signal({}); // sessionId -> { totalBytesWritten, totalBytesRead, estimatedTokens }
const totalMemoryMB = signal(0);
const activityEvents = signal({}); // sessionId -> events[]
const activityLogOpen = signal(true);
const chatSessions = signal([]);
const codexChatSessions = signal([]);
const chatSource = signal('claude'); // 'claude' | 'codex'
const activeChatId = signal(null);
const collapsedGroups = signal({});
const collapsedTermGroups = signal({});
const streamJsonSessions = signal({});
const activeGroupPopover = signal(null);
const statusBarTick = signal(Date.now());
const sessionLastActivity = signal({}); // sessionId -> timestamp
const wsConnected = signal(false);
const sidebarCollapsed = signal(false);
const codeReviewOpen = signal(false);
const termTitle = signal('');
const chatLoading = signal(false);
const chatMessages = signal([]);
var jsonBuf = '';

// --- WebSocket ---
var ws = null;
var authToken = null;

// Desktop app: when HTML is served from a different port than the daemon,
// daemonPort tells us where the real API/WS lives.
var _qp = new URLSearchParams(location.search);
var _daemonPort = _qp.get('daemonPort');
var apiBase = _daemonPort ? 'http://127.0.0.1:' + _daemonPort : '';
var wsHost = _daemonPort ? '127.0.0.1:' + _daemonPort : location.host;

(function initAuthToken() {
  var p = new URLSearchParams(location.search);
  var fromUrl = p.get('token');
  var stored = sessionStorage.getItem('forgeAuthToken') || localStorage.getItem('forgeAuthToken');
  authToken = fromUrl || stored;
  if (authToken) sessionStorage.setItem('forgeAuthToken', authToken);
  if (fromUrl) {
    p.delete('token');
    var clean = p.toString();
    history.replaceState(null, '', location.pathname + (clean ? '?' + clean : ''));
  }
})();

function authHeaders(extra) {
  var headers = Object.assign({}, extra || {});
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  return headers;
}

function connect() {
  var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  var wsUrl = proto + '//' + wsHost + '/ws' + (authToken ? ('?token=' + encodeURIComponent(authToken)) : '');
  ws = new WebSocket(wsUrl);
  ws.onopen = function() {
    wsConnected.value = true;
    wsSend({ type: 'list' });
  };
  ws.onclose = function() {
    wsConnected.value = false;
    setTimeout(connect, 2000);
  };
  ws.onerror = function() { ws.close(); };
  ws.onmessage = function(ev) {
    var msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    handleMessage(msg);
  };
}

function wsSend(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'sessions':
      sessions.value = msg.sessions || [];
      if (!activeSessionId.value && sessions.value.length > 0 && currentTab.value === 'terminals') {
        var running = sessions.value.filter(function(s) { return s.status === 'running'; });
        if (running.length > 0) selectSession(running[running.length - 1].id);
        else selectSession(sessions.value[sessions.value.length - 1].id);
      }
      break;
    case 'sessionCreated':
      if (!sessions.value.find(function(s) { return s.id === msg.session.id; })) {
        sessions.value = [...sessions.value, msg.session];
      }
      if (currentTab.value === 'terminals' && (autoFollow.value || !activeSessionId.value)) {
        selectSession(msg.session.id);
      }
      break;
    case 'sessionClosed':
      sessions.value = sessions.value.filter(function(s) { return s.id !== msg.session.id; });
      if (activeSessionId.value === msg.session.id) {
        var next = sessions.value.find(function(s) { return s.status === 'running'; });
        if (autoFollow.value && next) selectSession(next.id);
        else if (sessions.value.length > 0) selectSession(sessions.value[sessions.value.length - 1].id);
        else activeSessionId.value = null;
      }
      break;
    case 'sessionUpdated':
      sessions.value = sessions.value.map(function(s) {
        return s.id === msg.session.id ? msg.session : s;
      });
      break;
    case 'stats':
      totalMemoryMB.value = msg.totalMemoryMB || 0;
      if (msg.sessions) {
        var mem = Object.assign({}, sessionMemory.value);
        var tok = Object.assign({}, sessionTokens.value);
        for (var j = 0; j < msg.sessions.length; j++) {
          mem[msg.sessions[j].id] = msg.sessions[j].memoryMB;
          if (msg.sessions[j].tokenUsage) tok[msg.sessions[j].id] = msg.sessions[j].tokenUsage;
        }
        sessionMemory.value = mem;
        sessionTokens.value = tok;
        // Merge claudeState into sessions for sidebar rendering (always update, including clearing)
        var csMap = {};
        for (var k = 0; k < msg.sessions.length; k++) {
          csMap[msg.sessions[k].id] = msg.sessions[k].claudeState || null;
        }
        sessions.value = sessions.value.map(function(s) {
          if (s.id in csMap) {
            var newState = csMap[s.id];
            if (s.claudeState !== newState) return Object.assign({}, s, { claudeState: newState });
          }
          return s;
        });
      }
      break;
    case 'output':
      if (msg.sessionId) {
        var la = Object.assign({}, sessionLastActivity.value);
        la[msg.sessionId] = Date.now();
        sessionLastActivity.value = la;
      }
      if (msg.sessionId === activeSessionId.value && termInstance.value) {
        // Capture scroll position BEFORE write (write updates buffer synchronously)
        var vp = termInstance.value.buffer.active;
        var wasAtBottom = vp.baseY + termInstance.value.rows >= vp.length - 5;
        termInstance.value.write(msg.data);
        if (wasAtBottom) termInstance.value.scrollToBottom();
      }
      break;
    case 'history':
      if (msg.events && msg.sessionId) {
        var ae = Object.assign({}, activityEvents.value);
        ae[msg.sessionId] = msg.events;
        activityEvents.value = ae;
      }
      break;
    case 'history_event':
      if (msg.sessionId && msg.event) {
        var ae2 = Object.assign({}, activityEvents.value);
        if (!ae2[msg.sessionId]) ae2[msg.sessionId] = [];
        ae2[msg.sessionId] = [...ae2[msg.sessionId], msg.event];
        activityEvents.value = ae2;
      }
      break;
    case 'error':
      console.error('Server error:', msg.message);
      break;
  }
}

var pendingSubscribe = signal(null);

function selectSession(id) {
  if (activeSessionId.value === id) return;
  if (activeSessionId.value) wsSend({ type: 'unsubscribe', sessionId: activeSessionId.value });
  jsonBuf = '';
  activeChatId.value = null;
  // Set pendingSubscribe — XTermContainer will subscribe after terminal is fit
  pendingSubscribe.value = id;
  termTitle.value = '';
  activeSessionId.value = id;
}

function completeSubscribe(id) {
  wsSend({ type: 'subscribe', sessionId: id });
  var s = sessions.value.find(function(s) { return s.id === id; });
  if (s && s.tags && (s.tags.indexOf('claude-agent') >= 0 || s.tags.indexOf('codex-agent') >= 0)) {
    wsSend({ type: 'get_history', sessionId: id });
  }
}

function closeSession(id) {
  wsSend({ type: 'close', sessionId: id });
}

function reviveSession(id) {
  wsSend({ type: 'revive', sessionId: id });
}

function isClaudeSession() {
  var s = sessions.value.find(function(s) { return s.id === activeSessionId.value; });
  return s && s.tags && s.tags.indexOf('claude-agent') >= 0;
}

// --- Stream-JSON parser ---
function parseStreamJson(raw) {
  jsonBuf += raw;
  var lines = jsonBuf.split('\\n');
  jsonBuf = lines.pop() || '';
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    try { var evt = JSON.parse(line); renderClaudeEvent(evt); }
    catch (e) { if (termInstance.value && line.length > 0) termInstance.value.write(line + '\\r\\n'); }
  }
}

function renderClaudeEvent(evt) {
  var term = termInstance.value;
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
  var term = termInstance.value;
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

// --- Chat API ---
function loadChats(searchQuery) {
  chatLoading.value = true;
  var url = apiBase + '/api/chats?limit=100' + (searchQuery ? '&search=' + encodeURIComponent(searchQuery) : '');
  fetch(url, { headers: authHeaders() }).then(function(r) { return r.json(); }).then(function(data) {
    chatSessions.value = data.sessions || [];
    chatLoading.value = false;
  }).catch(function() {
    chatSessions.value = [];
    chatLoading.value = false;
  });
  // Also load codex chats
  var codexUrl = apiBase + '/api/codex-chats?limit=100' + (searchQuery ? '&search=' + encodeURIComponent(searchQuery) : '');
  fetch(codexUrl, { headers: authHeaders() }).then(function(r) { return r.json(); }).then(function(data) {
    codexChatSessions.value = data.sessions || [];
  }).catch(function() {
    codexChatSessions.value = [];
  });
}

function openChat(chatId, source) {
  activeChatId.value = chatId;
  activeSessionId.value = null;
  chatMessages.value = [];
  chatLoading.value = true;
  // Dispose terminal if active
  if (termInstance.value) {
    termInstance.value.dispose();
    termInstance.value = null;
  }
  var endpoint = source === 'codex' ? '/api/codex-chats/' : '/api/chats/';
  fetch(apiBase + endpoint + encodeURIComponent(chatId), { headers: authHeaders() }).then(function(r) { return r.json(); }).then(function(data) {
    chatMessages.value = data.messages || [];
    chatLoading.value = false;
  }).catch(function() {
    chatMessages.value = [];
    chatLoading.value = false;
  });
}

function continueChat(chatId, source) {
  var endpoint = source === 'codex' ? '/api/codex-chats/' : '/api/chats/';
  fetch(apiBase + endpoint + encodeURIComponent(chatId) + '/continue', { method: 'POST', headers: authHeaders() }).then(function(r) {
    if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Continue failed'); });
    return r.json();
  }).then(function(data) {
    currentTab.value = 'terminals';
    activeChatId.value = null;
    if (data && data.id) selectSession(data.id);
  }).catch(function(err) { alert(err.message || 'Continue failed'); });
}

function deleteChat(chatId, source) {
  var endpoint = source === 'codex' ? '/api/codex-chats/' : '/api/chats/';
  fetch(apiBase + endpoint + encodeURIComponent(chatId), { method: 'DELETE', headers: authHeaders() }).then(function() {
    if (activeChatId.value === chatId) activeChatId.value = null;
    loadChats();
  });
}

function createTerminal(opts) {
  fetch(apiBase + '/api/sessions', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(opts),
  }).then(function(r) { return r.json(); }).then(function() {
    activeModal.value = null;
  }).catch(function(err) { console.error('Create terminal failed', err); });
}

// Tick every second for live duration timer
setInterval(function() { statusBarTick.value = Date.now(); }, 1000);

function createTerminalInDir(cwd) {
  createTerminal({ cwd: cwd });
}

function createClaudeSession(cwd) {
  createTerminal({ agent: 'claude', cwd: cwd });
}

function createCodexSession(cwd) {
  createTerminal({ agent: 'codex', cwd: cwd });
}
`;
