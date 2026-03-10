export const TERMINAL_VIEW_JS = `
function XTermContainer() {
  var containerRef = preact.createRef();
  var resizeObserverRef = { current: null };

  function initTerminal() {
    var container = containerRef.current;
    if (!container) return;

    // Dispose previous
    if (termInstance.value) { termInstance.value.dispose(); termInstance.value = null; }
    if (fitAddonInstance.value) { fitAddonInstance.value = null; }
    if (resizeObserverRef.current) { resizeObserverRef.current.disconnect(); resizeObserverRef.current = null; }

    if (!activeSessionId.value) return;

    var term = new Terminal({
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
      cursorStyle: 'bar',
      allowProposedApi: true,
    });

    var fa = new FitAddon.FitAddon();
    term.loadAddon(fa);
    term.open(container);

    var ro = new ResizeObserver(function() {
      if (fa) { try { fa.fit(); } catch(e) {} }
    });
    ro.observe(container);
    resizeObserverRef.current = ro;

    // macOS keybindings
    term.attachCustomKeyEventHandler(function(ev) {
      if (ev.type !== 'keydown') return true;
      if (ev.metaKey) {
        if (ev.key === 'ArrowLeft') { wsSend({ type: 'input', sessionId: activeSessionId.value, data: '\\x01' }); return false; }   // Home (Ctrl+A)
        if (ev.key === 'ArrowRight') { wsSend({ type: 'input', sessionId: activeSessionId.value, data: '\\x05' }); return false; }  // End (Ctrl+E)
        if (ev.key === 'Backspace') { wsSend({ type: 'input', sessionId: activeSessionId.value, data: '\\x15' }); return false; }   // Kill line (Ctrl+U)
        if (ev.key === 'ArrowUp') { wsSend({ type: 'input', sessionId: activeSessionId.value, data: '\\x1b[1;5A' }); return false; }   // Beginning of input
        if (ev.key === 'ArrowDown') { wsSend({ type: 'input', sessionId: activeSessionId.value, data: '\\x1b[1;5B' }); return false; } // End of input
      }
      return true;
    });
    term.onData(function(data) { wsSend({ type: 'input', sessionId: activeSessionId.value, data: data }); });
    term.onResize(function(size) { wsSend({ type: 'resize', sessionId: activeSessionId.value, cols: size.cols, rows: size.rows }); });
    term.onTitleChange(function(title) { termTitle.value = title || ''; });

    termInstance.value = term;
    fitAddonInstance.value = fa;

    // Subscribe after fit so backlog renders at correct terminal dimensions
    setTimeout(function() {
      if (fa) { try { fa.fit(); } catch(e) {} }
      if (pendingSubscribe.value) {
        completeSubscribe(pendingSubscribe.value);
        pendingSubscribe.value = null;
      }
    }, 0);
  }

  preactHooks.useEffect(function() {
    initTerminal();
    return function() {
      if (termInstance.value) { termInstance.value.dispose(); termInstance.value = null; }
      if (resizeObserverRef.current) { resizeObserverRef.current.disconnect(); }
    };
  }, [activeSessionId.value]);

  return html\`<div id="terminal-container" ref=\${containerRef}></div>\`;
}

function ActivityLog() {
  var isOpen = activityLogOpen.value;
  var events = (activityEvents.value[activeSessionId.value]) || [];
  var toolIcons = { Bash: '$', Write: '+', Edit: '~', Read: '>', Glob: '?', Grep: '/', Agent: '@', TaskCreate: '\\u25a1', TaskUpdate: '\\u2713' };
  var toolColors = { Bash: '#e0af68', Write: '#9ece6a', Edit: '#7dcfff', Read: '#7aa2f7', Glob: '#7aa2f7', Grep: '#7aa2f7', Agent: '#bb9af7', TaskCreate: '#e0af68', TaskUpdate: '#9ece6a' };

  var items = [];
  for (var i = events.length - 1; i >= 0 && i >= events.length - 100; i--) {
    var ev = events[i];
    if (ev.type === 'tool_call') {
      var icon = toolIcons[ev.toolName] || '*';
      var color = toolColors[ev.toolName] || '#565f89';
      var detail = ev.summary.indexOf(':') > 0 ? ev.summary.slice(ev.summary.indexOf(':') + 2) : '';
      items.push(html\`
        <div class="activity-event" key=\${i}>
          <span class="activity-icon" style=\${'color:' + color}>\${icon}</span>
          <span class="activity-name">\${ev.toolName}</span>
          <span class="activity-detail">\${detail}</span>
          <span class="activity-time">\${timeAgo(ev.timestamp)}</span>
        </div>
      \`);
    } else if (ev.type === 'tool_result' && ev.isError) {
      items.push(html\`
        <div class="activity-event error" key=\${i}>
          <span class="activity-icon">\u2717</span>
          <span class="activity-detail">\${ev.errorMessage || 'error'}</span>
          <span class="activity-time">\${timeAgo(ev.timestamp)}</span>
        </div>
      \`);
    } else if (ev.type === 'session_init') {
      items.push(html\`
        <div class="activity-event" key=\${i}>
          <span class="activity-icon" style="color:#7aa2f7">\u25b6</span>
          <span class="activity-name">Session started</span>
          <span class="activity-detail">\${(ev.model || '') + (ev.cwd ? ' ' + ev.cwd : '')}</span>
          <span class="activity-time">\${timeAgo(ev.timestamp)}</span>
        </div>
      \`);
    }
  }

  return html\`
    <div>
      <div id="activity-log-header" onClick=\${function() { activityLogOpen.value = !activityLogOpen.value; }}>
        Activity Log <span>\${isOpen ? '\\u25bc' : '\\u25b6'}</span>
      </div>
      \${isOpen ? html\`
        <div id="activity-log">
          \${items.length === 0
            ? html\`<div style="padding:8px 12px;color:#3b4261;font-size:11px;">No tool calls yet</div>\`
            : items
          }
        </div>
      \` : null}
    </div>
  \`;
}

function TerminalStatusBar() {
  var activeSession = sessions.value.find(function(s) { return s.id === activeSessionId.value; });
  if (!activeSession) return null;
  var cwd = activeSession.cwd || '';
  // Shorten home dir
  var home = '';
  try { home = cwd.replace(/^\\/Users\\/[^/]+/, '~').replace(/^\\/home\\/[^/]+/, '~'); } catch(e) { home = cwd; }

  // I/O stats from live stats
  var tok = sessionTokens.value[activeSession.id];
  var ioText = '';
  if (tok) {
    var bw = tok.totalBytesWritten || 0;
    var br = tok.totalBytesRead || 0;
    var fmtBytes = function(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? (b / 1024).toFixed(1) + ' KB' : b + ' B'; };
    ioText = '\\u2191' + fmtBytes(bw) + ' \\u2193' + fmtBytes(br);
  }

  // Session duration (live timer)
  var now = statusBarTick.value;
  var durationText = '';
  if (activeSession.createdAt) {
    var elapsed = Math.floor((now - new Date(activeSession.createdAt).getTime()) / 1000);
    if (elapsed < 0) elapsed = 0;
    var h = Math.floor(elapsed / 3600);
    var m = Math.floor((elapsed % 3600) / 60);
    var s = elapsed % 60;
    durationText = h > 0 ? h + 'h ' + m + 'm' : m > 0 ? m + 'm ' + s + 's' : s + 's';
  }

  // Last activity indicator
  var activityText = '';
  var lastActivity = sessionLastActivity.value[activeSession.id];
  if (lastActivity && activeSession.status === 'running') {
    var idleSec = Math.floor((now - lastActivity) / 1000);
    if (idleSec <= 5) {
      activityText = 'Active';
    } else {
      var im = Math.floor(idleSec / 60);
      activityText = 'Idle ' + (im > 0 ? im + 'm' : idleSec + 's');
    }
  }

  return html\`
    <div id="terminal-status-bar">
      <span class="status-bar-item" title=\${cwd}>\u{1F4C2} \${home}</span>
      \${ioText ? html\`<span class="status-bar-item" style="color:#7dcfff">\${ioText}</span>\` : null}
      \${durationText ? html\`<span class="status-bar-item" style="color:#565f89">\u23f1 \${durationText}</span>\` : null}
      \${activityText ? html\`<span class="status-bar-item \${'activity-' + (activityText === 'Active' ? 'active' : 'idle')}">\${activityText}</span>\` : null}
      <span class="status-bar-spacer"></span>
      <span class="status-bar-item">\${activeSession.id}</span>
      <span class="status-bar-item status-badge \${activeSession.status}">\${activeSession.status}</span>
    </div>
  \`;
}

function ClaudeStatusBadge() {
  var activeSession = sessions.value.find(function(s) { return s.id === activeSessionId.value; });
  if (!activeSession || !activeSession.tags || activeSession.tags.indexOf('claude-agent') < 0) return null;
  if (activeSession.status === 'exited') return null;

  if (activeSession.claudeState === 'blocked') {
    return html\`<span class="claude-badge permission">Needs attention</span>\`;
  }

  var title = termTitle.value;
  if (!title || title.indexOf('Claude') < 0) return null;
  if (title.indexOf('\\u2733') >= 0) {
    return html\`<span class="claude-badge waiting">Waiting for input</span>\`;
  }
  return html\`<span class="claude-badge working"><span class="pulse-dot"></span> Working</span>\`;
}

function TerminalView() {
  var activeSession = sessions.value.find(function(s) { return s.id === activeSessionId.value; });
  var headerLabel = activeSession && activeSession.name ? activeSession.name : activeSessionId.value;

  var startedText = '';
  if (activeSession && activeSession.createdAt) {
    startedText = 'Started ' + timeAgo(activeSession.createdAt);
  }

  return html\`
    <div id="main">
      <div id="terminal-header">
        <span>Session: <span class="session-label">\${headerLabel}</span> <\${ClaudeStatusBadge} /></span>
        \${startedText ? html\`<span class="header-time">\${startedText}</span>\` : null}
      </div>
      <\${XTermContainer} />
      <\${TerminalStatusBar} />
    </div>
  \`;
}
`;
