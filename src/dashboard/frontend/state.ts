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
const geminiChatSessions = signal([]);
const chatSource = signal('claude'); // 'claude' | 'codex' | 'gemini'
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
const editorMode = signal(false);
const termTitle = signal('');
const chatLoading = signal(false);
const chatSearchQuery = signal('');
const activeSessionMenu = signal(null);
const renamingSessionId = signal(null);
const chatMessages = signal([]);
const voiceAvailable = signal(false);
const voiceState = signal('idle'); // 'idle' | 'recording' | 'transcribing'
const voiceError = signal(''); // brief error message shown in status bar
var jsonBuf = '';

// --- Split Pane State ---
var splitRoot = signal({ type: 'leaf', id: 'pane-1', sessionId: null });
var focusedPaneId = signal('pane-1');
var _paneCounter = 1;
var paneTerminals = {}; // paneId -> { term, fitAddon, sessionId }

function _nextPaneId() { return 'pane-' + (++_paneCounter); }

function _findInTree(node, paneId) {
  if (node.type === 'leaf') return node.id === paneId ? node : null;
  for (var i = 0; i < node.children.length; i++) {
    var f = _findInTree(node.children[i], paneId);
    if (f) return f;
  }
  return null;
}

function _replaceInTree(node, paneId, replacement) {
  if (node.type === 'leaf') return node.id === paneId ? replacement : node;
  return {
    type: 'split', id: node.id, direction: node.direction,
    sizes: node.sizes.slice(),
    children: node.children.map(function(c) { return _replaceInTree(c, paneId, replacement); })
  };
}

function _removeFromTree(node, paneId) {
  if (node.type === 'leaf') return node;
  for (var i = 0; i < node.children.length; i++) {
    if (node.children[i].type === 'leaf' && node.children[i].id === paneId) {
      return node.children[i === 0 ? 1 : 0];
    }
  }
  var newChildren = node.children.map(function(c) { return _removeFromTree(c, paneId); });
  return { type: 'split', id: node.id, direction: node.direction, sizes: node.sizes.slice(), children: newChildren };
}

function _firstLeaf(node) {
  if (node.type === 'leaf') return node;
  return _firstLeaf(node.children[0]);
}

function _leafCount(node) {
  if (node.type === 'leaf') return 1;
  return node.children.reduce(function(c, child) { return c + _leafCount(child); }, 0);
}

function _collectLeaves(node, acc) {
  if (node.type === 'leaf') { acc.push(node); return; }
  for (var i = 0; i < node.children.length; i++) _collectLeaves(node.children[i], acc);
}

function splitPane(direction) {
  var paneId = focusedPaneId.value;
  var oldNode = _findInTree(splitRoot.value, paneId);
  if (!oldNode) return;
  var newId = _nextPaneId();
  var splitNode = {
    type: 'split', id: 'split-' + newId, direction: direction,
    children: [
      { type: 'leaf', id: paneId, sessionId: oldNode.sessionId },
      { type: 'leaf', id: newId, sessionId: null }
    ],
    sizes: [50, 50]
  };
  splitRoot.value = _replaceInTree(splitRoot.value, paneId, splitNode);
  focusedPaneId.value = newId;
  activeSessionId.value = null;
}

function closePane(paneId) {
  if (splitRoot.value.type === 'leaf') {
    splitRoot.value = { type: 'leaf', id: splitRoot.value.id, sessionId: null };
    activeSessionId.value = null;
    return;
  }
  delete paneTerminals[paneId];
  var newRoot = _removeFromTree(splitRoot.value, paneId);
  splitRoot.value = newRoot;
  var fl = _firstLeaf(newRoot);
  focusedPaneId.value = fl.id;
  activeSessionId.value = fl.sessionId;
  var pt = paneTerminals[fl.id];
  if (pt) {
    termInstance.value = pt.term;
    fitAddonInstance.value = pt.fitAddon;
  }
}

function setPaneSession(paneId, sessionId) {
  var node = _findInTree(splitRoot.value, paneId);
  if (!node || node.sessionId === sessionId) return;
  function _update(n) {
    if (n.type === 'leaf') {
      if (n.id === paneId) return { type: 'leaf', id: n.id, sessionId: sessionId };
      return n;
    }
    return { type: 'split', id: n.id, direction: n.direction, sizes: n.sizes.slice(), children: n.children.map(_update) };
  }
  splitRoot.value = _update(splitRoot.value);
}

function updateSplitSizes(splitId, newSizes) {
  function _update(n) {
    if (n.type === 'leaf') return n;
    var updated = { type: 'split', id: n.id, direction: n.direction, sizes: n.id === splitId ? newSizes : n.sizes.slice(), children: n.children.map(_update) };
    return updated;
  }
  splitRoot.value = _update(splitRoot.value);
}

function registerPaneTerminal(paneId, term, fitAddon, sid) {
  paneTerminals[paneId] = { term: term, fitAddon: fitAddon, sessionId: sid };
}

function unregisterPaneTerminal(paneId) {
  delete paneTerminals[paneId];
}

function focusPane(paneId) {
  var node = _findInTree(splitRoot.value, paneId);
  if (!node) return;
  focusedPaneId.value = paneId;
  activeSessionId.value = node.sessionId;
  var pt = paneTerminals[paneId];
  if (pt) {
    termInstance.value = pt.term;
    fitAddonInstance.value = pt.fitAddon;
  }
}

function cycleFocus(dir) {
  var leaves = [];
  _collectLeaves(splitRoot.value, leaves);
  if (leaves.length <= 1) return;
  var idx = 0;
  for (var i = 0; i < leaves.length; i++) {
    if (leaves[i].id === focusedPaneId.value) { idx = i; break; }
  }
  var next = dir === 'next' ? (idx + 1) % leaves.length : (idx - 1 + leaves.length) % leaves.length;
  focusPane(leaves[next].id);
}

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
    checkVoiceAvailable();
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
      // Route output to all pane terminals showing this session
      var _ptKeys = Object.keys(paneTerminals);
      for (var _pi = 0; _pi < _ptKeys.length; _pi++) {
        var _pt = paneTerminals[_ptKeys[_pi]];
        if (_pt && _pt.sessionId === msg.sessionId && _pt.term) {
          var vp = _pt.term.buffer.active;
          var wasAtBottom = vp.baseY + _pt.term.rows >= vp.length - 1;
          var prevBaseY = vp.baseY;
          _pt.term.write(msg.data);
          if (wasAtBottom) {
            _pt.term.scrollToBottom();
          } else {
            var newBaseY = _pt.term.buffer.active.baseY;
            var drift = newBaseY - prevBaseY;
            if (drift > 0) _pt.term.scrollLines(-drift);
          }
        }
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

function selectSession(id, opts) {
  if (!id) return;
  if (activeSessionId.value === id) return;
  if (opts && opts.manual) autoFollow.value = false;
  if (activeSessionId.value) wsSend({ type: 'unsubscribe', sessionId: activeSessionId.value });
  activeChatId.value = null;
  jsonBuf = '';
  termTitle.value = '';
  activeSessionId.value = id;
  setPaneSession(focusedPaneId.value, id);
}

function closeSession(id) {
  wsSend({ type: 'close', sessionId: id });
}

function reviveSession(id) {
  wsSend({ type: 'revive', sessionId: id });
}

function renameSession(id, newName) {
  fetch(apiBase + '/api/sessions/' + id, {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ name: newName }),
  }).then(function(r) { return r.json(); }).then(function(data) {
    var updated = sessions.value.map(function(s) {
      if (s.id === id) return Object.assign({}, s, { name: data.name });
      return s;
    });
    sessions.value = updated;
  }).catch(function() {});
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
  // Also load gemini chats
  var geminiUrl = apiBase + '/api/gemini-chats?limit=100' + (searchQuery ? '&search=' + encodeURIComponent(searchQuery) : '');
  fetch(geminiUrl, { headers: authHeaders() }).then(function(r) { return r.json(); }).then(function(data) {
    geminiChatSessions.value = data.sessions || [];
  }).catch(function() {
    geminiChatSessions.value = [];
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
  var endpoint = source === 'codex' ? '/api/codex-chats/' : source === 'gemini' ? '/api/gemini-chats/' : '/api/chats/';
  fetch(apiBase + endpoint + encodeURIComponent(chatId), { headers: authHeaders() }).then(function(r) { return r.json(); }).then(function(data) {
    chatMessages.value = data.messages || [];
    chatLoading.value = false;
  }).catch(function() {
    chatMessages.value = [];
    chatLoading.value = false;
  });
}

function continueChat(chatId, source) {
  var endpoint = source === 'codex' ? '/api/codex-chats/' : source === 'gemini' ? '/api/gemini-chats/' : '/api/chats/';
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
  var endpoint = source === 'codex' ? '/api/codex-chats/' : source === 'gemini' ? '/api/gemini-chats/' : '/api/chats/';
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

function createGeminiSession(cwd) {
  createTerminal({ agent: 'gemini', cwd: cwd });
}

function createCursorSession(cwd) {
  createTerminal({ agent: 'cursor', cwd: cwd });
}

function createWindsurfSession(cwd) {
  createTerminal({ agent: 'windsurf', cwd: cwd });
}

function createCopilotSession(cwd) {
  createTerminal({ agent: 'copilot', cwd: cwd });
}

function createDeepAgentsSession(cwd) {
  createTerminal({ agent: 'deep-agents', cwd: cwd });
}

// --- Voice Input ---
var _voiceMediaRecorder = null;
var _voiceChunks = [];
var _voiceStream = null;

function checkVoiceAvailable() {
  fetch(apiBase + '/api/transcribe', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) { voiceAvailable.value = !!data.available; })
    .catch(function() { voiceAvailable.value = false; });
}

function showVoiceError(msg) {
  voiceError.value = msg;
  setTimeout(function() { voiceError.value = ''; }, 4000);
}

function startVoiceRecording() {
  if (voiceState.value !== 'idle') return;
  if (!activeSessionId.value) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showVoiceError('Microphone not available (requires HTTPS)');
    return;
  }

  navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    _voiceStream = stream;
    _voiceChunks = [];

    // Pick a supported mime type
    var mimeType = 'audio/webm';
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
      else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) mimeType = 'audio/ogg;codecs=opus';
      else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
    }

    _voiceMediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
    _voiceMediaRecorder.ondataavailable = function(e) {
      if (e.data.size > 0) _voiceChunks.push(e.data);
    };
    _voiceMediaRecorder.onstop = function() {
      // Stop microphone
      _voiceStream.getTracks().forEach(function(t) { t.stop(); });
      _voiceStream = null;

      if (_voiceChunks.length === 0) {
        voiceState.value = 'idle';
        return;
      }

      voiceState.value = 'transcribing';
      var blob = new Blob(_voiceChunks, { type: mimeType });
      _voiceChunks = [];

      var form = new FormData();
      form.append('file', blob, 'recording.webm');

      fetch(apiBase + '/api/transcribe', {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Transcription failed'); });
        return r.json();
      }).then(function(data) {
        voiceState.value = 'idle';
        if (data.text && activeSessionId.value) {
          wsSend({ type: 'input', sessionId: activeSessionId.value, data: data.text });
        }
      }).catch(function(err) {
        voiceState.value = 'idle';
        showVoiceError('Transcription failed: ' + (err.message || err));
        console.error('Transcription error:', err);
      });
    };

    _voiceMediaRecorder.start();
    voiceState.value = 'recording';
  }).catch(function(err) {
    showVoiceError('Microphone access denied');
    console.error('Microphone access denied:', err);
    voiceState.value = 'idle';
  });
}

function stopVoiceRecording() {
  if (voiceState.value !== 'recording' || !_voiceMediaRecorder) return;
  _voiceMediaRecorder.stop();
  _voiceMediaRecorder = null;
}

function toggleVoiceRecording() {
  if (voiceState.value === 'recording') stopVoiceRecording();
  else if (voiceState.value === 'idle') startVoiceRecording();
}
`;
