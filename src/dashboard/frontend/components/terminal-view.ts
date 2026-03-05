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
      allowProposedApi: true,
    });

    var fa = new FitAddon.FitAddon();
    term.loadAddon(fa);
    term.open(container);
    setTimeout(function() { fa.fit(); }, 0);

    var ro = new ResizeObserver(function() {
      if (fa) { try { fa.fit(); } catch(e) {} }
    });
    ro.observe(container);
    resizeObserverRef.current = ro;

    term.onData(function(data) { wsSend({ type: 'input', sessionId: activeSessionId.value, data: data }); });
    term.onResize(function(size) { wsSend({ type: 'resize', sessionId: activeSessionId.value, cols: size.cols, rows: size.rows }); });

    termInstance.value = term;
    fitAddonInstance.value = fa;
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

  return html\`
    <div id="terminal-status-bar">
      <span class="status-bar-item" title=\${cwd}>\u{1F4C2} \${home}</span>
      <span class="status-bar-spacer"></span>
      <span class="status-bar-item">\${activeSession.id}</span>
      <span class="status-bar-item status-badge \${activeSession.status}">\${activeSession.status}</span>
    </div>
  \`;
}

function TerminalView() {
  var activeSession = sessions.value.find(function(s) { return s.id === activeSessionId.value; });
  var headerLabel = activeSession && activeSession.name ? activeSession.name : activeSessionId.value;
  var showLog = isClaudeSession();

  return html\`
    <div id="main">
      <div id="terminal-header">
        <span>Session: <span class="session-label">\${headerLabel}</span></span>
      </div>
      <\${XTermContainer} />
      \${showLog ? html\`<\${ActivityLog} />\` : null}
      <\${TerminalStatusBar} />
    </div>
  \`;
}
`;
