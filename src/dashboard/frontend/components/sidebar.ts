export const SIDEBAR_JS = `
function TabBar() {
  return html\`
    <div class="tab-bar">
      <button
        class=\${'tab-btn' + (currentTab.value === 'terminals' ? ' active' : '')}
        onClick=\${function() { currentTab.value = 'terminals'; activeChatId.value = null; }}
      >Terminals</button>
      <button
        class=\${'tab-btn' + (currentTab.value === 'chats' ? ' active' : '')}
        onClick=\${function() { currentTab.value = 'chats'; loadChats(); }}
      >Chats</button>
    </div>
  \`;
}

function SessionItem(props) {
  var s = props.session;
  var memMB = sessionMemory.value[s.id];
  var ramText = '';
  if (s.status === 'running' && memMB != null && memMB > 0) {
    ramText = memMB >= 1024 ? (memMB / 1024).toFixed(1) + ' GB' : memMB + ' MB';
  }
  var metaText = s.id;
  if (s.status === 'exited' && s.exitedAt) metaText += ' \\u00b7 exited ' + timeAgo(s.exitedAt);

  var tags = s.tags || [];
  var isDelegate = tags.indexOf('delegate-task') >= 0;
  var isOneshot = tags.indexOf('mode:oneshot') >= 0;
  var isInteractive = tags.indexOf('mode:interactive') >= 0;

  var menuOpen = activeSessionMenu.value === s.id;
  var isRenaming = renamingSessionId.value === s.id;
  var inputRef = preactHooks.useRef(null);

  function toggleMenu(e) {
    e.stopPropagation();
    activeSessionMenu.value = menuOpen ? null : s.id;
  }

  // Close menu on outside click
  preactHooks.useEffect(function() {
    if (!menuOpen) return;
    function handler(e) {
      if (!e.target.closest('.session-actions')) {
        activeSessionMenu.value = null;
      }
    }
    document.addEventListener('click', handler, true);
    return function() { document.removeEventListener('click', handler, true); };
  }, [menuOpen]);

  // Focus and pre-fill input when rename mode activates
  preactHooks.useEffect(function() {
    if (isRenaming && inputRef.current) {
      inputRef.current.value = s.name || s.command || '';
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  function startRename(e) {
    e.stopPropagation();
    activeSessionMenu.value = null;
    renamingSessionId.value = s.id;
  }

  function finishRename() {
    if (inputRef.current) {
      var val = inputRef.current.value.trim();
      if (val && val !== (s.name || '')) {
        renameSession(s.id, val);
      }
    }
    renamingSessionId.value = null;
  }

  function onRenameKeyDown(e) {
    e.stopPropagation();
    if (e.key === 'Enter') finishRename();
    if (e.key === 'Escape') renamingSessionId.value = null;
  }

  var nameDisplay = isRenaming
    ? html\`<input ref=\${inputRef} class="session-rename-input" onBlur=\${finishRename} onKeyDown=\${onRenameKeyDown} onClick=\${function(e) { e.stopPropagation(); }} />\`
    : html\`<span class="session-name-text" onDblClick=\${function(e) { e.stopPropagation(); startRename(e); }}>\${s.name || s.command}</span>\`;

  var menuEl = menuOpen ? html\`<div class="session-menu" onClick=\${function(e) { e.stopPropagation(); }}>
    <button class="session-menu-item" onClick=\${startRename}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.5 1.5l3 3L5 14H2v-3z"/><path d="M9.5 3.5l3 3"/></svg>
      Rename
    </button>
  </div>\` : null;

  return html\`
    <div
      class=\${'session-item' + (s.id === activeSessionId.value ? ' active' : '')}
      onClick=\${function() { if (!isRenaming) selectSession(s.id); }}
    >
      <span class=\${'status-dot ' + s.status}></span>
      <div class="session-info">
        <div class="session-cmd">
          \${nameDisplay}
          \${isDelegate && isOneshot ? html\`<span class="delegate-badge oneshot">oneshot</span>\` : null}
          \${isDelegate && isInteractive ? html\`<span class="delegate-badge interactive">interactive</span>\` : null}
          \${ramText ? html\`<span class="ram">\${ramText}</span>\` : null}
        </div>
        <div class="session-meta">\${metaText}</div>
      </div>
      \${s.claudeState === 'blocked' && s.status === 'running' ? html\`<span class="blocked-icon" title="Needs attention">!</span>\` : null}
      <div class="session-actions">
        <button class="session-dots-btn" title="Options" onClick=\${toggleMenu}>\u22ee</button>
        \${menuEl}
      </div>
      <button
        class="close-btn"
        title="Close session"
        onClick=\${function(e) { e.stopPropagation(); closeSession(s.id); }}
      >\u00d7</button>
    </div>
  \`;
}

function TerminalGroup(props) {
  var label = props.label;
  var items = props.items;
  var isCollapsed = !!collapsedTermGroups.value[label];
  var running = items.filter(function(s) { return s.status === 'running'; }).length;
  var stats = running + '/' + items.length;
  var cwd = items[0] && items[0].cwd ? items[0].cwd : '';
  var popoverOpen = activeGroupPopover.value === label;
  var copiedArr = preactHooks.useState(false);
  var isCopied = copiedArr[0];
  var setCopied = copiedArr[1];
  var copyTimerRef = preact.createRef();

  function onCopy(e) {
    e.stopPropagation();
    if (cwd) {
      navigator.clipboard.writeText(cwd).then(function() {
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        setCopied(true);
        copyTimerRef.current = setTimeout(function() {
          setCopied(false);
        }, 1500);
      });
    }
  }

  function onPlusClick(e) {
    e.stopPropagation();
    activeGroupPopover.value = popoverOpen ? null : label;
  }

  function onNewTerminal(e) {
    e.stopPropagation();
    activeGroupPopover.value = null;
    createTerminalInDir(cwd);
  }

  function onNewClaude(e) {
    e.stopPropagation();
    activeGroupPopover.value = null;
    createClaudeSession(cwd);
  }

  function onNewCodex(e) {
    e.stopPropagation();
    activeGroupPopover.value = null;
    createCodexSession(cwd);
  }

  // Close popover on outside click
  preactHooks.useEffect(function() {
    if (!popoverOpen) return;
    function handler(e) {
      if (!e.target.closest('.group-popover-anchor')) {
        activeGroupPopover.value = null;
      }
    }
    document.addEventListener('click', handler, true);
    return function() { document.removeEventListener('click', handler, true); };
  }, [popoverOpen]);

  return html\`
    <div>
      <div
        class="chat-project-group"
        title=\${cwd}
        onClick=\${function() {
          var cg = Object.assign({}, collapsedTermGroups.value);
          cg[label] = !cg[label];
          collapsedTermGroups.value = cg;
        }}
      >
        <span class=\${'chevron' + (isCollapsed ? ' collapsed' : '')}>\u25bc</span>
        <span class="group-name">\${label}</span>
        <span class="group-stats">\${stats}</span>
        <button class=\${'group-action-btn group-copy-btn' + (isCopied ? ' copied' : '')} title="Copy path" onClick=\${onCopy}>
          <span class="copy-icon"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 012 9.5v-7A1.5 1.5 0 013.5 1h7A1.5 1.5 0 0112 2.5V5"/></svg></span>
          <span class="check-icon"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#9ece6a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4 4 6-7"/></svg></span>
        </button>
        <div class="group-popover-anchor" style="position:relative">
          <button class="group-action-btn group-add-btn" title="New session in this directory" onClick=\${onPlusClick}>+</button>
          \${popoverOpen ? html\`
            <div class="group-popover">
              <button class="group-popover-item" onClick=\${onNewTerminal}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="2" width="14" height="12" rx="2"/><path d="M4 6l3 2-3 2"/><path d="M9 10h3"/></svg>
                <span>Terminal</span>
              </button>
              <button class="group-popover-item" onClick=\${onNewClaude}>
                <svg class="agent-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12l-1.5-3.5L3 7l3.5-1.5z"/><path d="M12 2l.5 1.5L14 4l-1.5.5L12 6l-.5-1.5L10 4l1.5-.5z"/></svg>
                <span>Claude Code</span>
              </button>
              <button class="group-popover-item" onClick=\${onNewCodex}>
                <svg class="agent-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12l-1.5-3.5L3 7l3.5-1.5z"/><path d="M12 2l.5 1.5L14 4l-1.5.5L12 6l-.5-1.5L10 4l1.5-.5z"/></svg>
                <span>Codex</span>
              </button>
            </div>
          \` : null}
        </div>
      </div>
      \${!isCollapsed ? items.map(function(s) {
        return html\`<\${SessionItem} key=\${s.id} session=\${s} />\`;
      }) : null}
    </div>
  \`;
}

function SessionList() {
  var ss = sessions.value;
  if (ss.length === 0) {
    return html\`<div style="padding:12px;color:#3b4261;font-size:12px;">No sessions</div>\`;
  }

  // Group by shortened cwd
  var groups = {};
  ss.forEach(function(s) {
    var cwd = s.cwd || 'unknown';
    var label;
    try { label = cwd.replace(/^\\/Users\\/[^/]+/, '~').replace(/^\\/home\\/[^/]+/, '~'); }
    catch(e) { label = cwd; }
    var parts = label.split('/').filter(function(p) { return p; });
    if (parts.length > 0) label = parts[parts.length - 1];
    if (!groups[label]) groups[label] = [];
    groups[label].push(s);
  });

  var keys = Object.keys(groups);
  return html\`\${keys.map(function(label) {
    return html\`<\${TerminalGroup} key=\${label} label=\${label} items=\${groups[label]} />\`;
  })}\`;
}

function ChatItem(props) {
  var c = props.chat;
  return html\`
    <div
      class=\${'chat-item' + (c.sessionId === activeChatId.value ? ' active' : '')}
      onClick=\${function() { openChat(c.sessionId, props.source); }}
    >
      <button
        class="close-btn"
        title="Delete chat"
        onClick=\${function(e) { e.stopPropagation(); activeModal.value = { type: 'deleteChat', chatId: c.sessionId, source: props.source }; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4m2 0v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z"/></svg>
      </button>
      <div class="chat-msg">\${c.firstMessage}</div>
      <div class="chat-meta">\${
        c.messageCount + ' msgs' +
        (c.toolCount ? ' \\u00b7 ' + c.toolCount + ' tools' : '') +
        ' \\u00b7 ' + formatSize(c.sizeBytes) +
        (c.resumeCount ? ' \\u00b7 ' + (c.resumeCount + 1) + ' parts' : '') +
        ' \\u00b7 ' + timeAgo(c.lastTimestamp) +
        (c.model ? ' \\u00b7 ' + c.model : '')
      }</div>
    </div>
  \`;
}

function ChatProjectGroup(props) {
  var project = props.project;
  var items = props.items;
  var totalBytes = items.reduce(function(sum, c) { return sum + (c.sizeBytes || 0); }, 0);
  var isCollapsed = !!collapsedGroups.value[project];

  return html\`
    <div>
      <div
        class="chat-project-group"
        title=\${items[0] && items[0].fullPath ? items[0].fullPath : ''}
        onClick=\${function() {
          var cg = Object.assign({}, collapsedGroups.value);
          cg[project] = !cg[project];
          collapsedGroups.value = cg;
        }}
      >
        <span class=\${'chevron' + (isCollapsed ? ' collapsed' : '')}>\u25bc</span>
        <span class="group-name">\${project}</span>
        <span class="group-stats">\${items.length + ' chat' + (items.length !== 1 ? 's' : '') + ' \\u00b7 ' + formatSize(totalBytes)}</span>
      </div>
      \${!isCollapsed ? items.map(function(c) {
        return html\`<\${ChatItem} key=\${c.sessionId} chat=\${c} source=\${props.source} />\`;
      }) : null}
    </div>
  \`;
}

function ChatsPanel() {
  var searchRef = preact.createRef();

  function onSearchKeyDown(e) {
    if (e.key === 'Enter') {
      var q = e.target.value.trim();
      chatSearchQuery.value = q;
      loadChats(q);
    }
    if (e.key === 'Escape') {
      e.target.value = '';
      chatSearchQuery.value = '';
      loadChats('');
      e.target.blur();
    }
  }

  function clearSearch() {
    chatSearchQuery.value = '';
    if (searchRef.current) searchRef.current.value = '';
    loadChats('');
  }

  var source = chatSource.value;
  var cs = source === 'codex' ? codexChatSessions.value : chatSessions.value;
  var loading = chatLoading.value;
  var query = chatSearchQuery.value;
  var content;
  if (loading) {
    var loadLabel = query ? 'Searching...' : 'Loading chats...';
    content = html\`<div style="padding:12px;color:#565f89;font-size:12px;display:flex;align-items:center;gap:8px;"><span class="chat-spinner"></span> \${loadLabel}</div>\`;
  } else if (cs.length === 0 && query) {
    content = html\`<div class="chat-search-status">No results for "\${query}"</div>\`;
  } else if (cs.length === 0) {
    content = html\`<div class="chat-search-status" style="color:#3b4261">No chats found</div>\`;
  } else {
    var groups = {};
    cs.forEach(function(c) {
      if (!groups[c.project]) groups[c.project] = [];
      groups[c.project].push(c);
    });
    var groupKeys = Object.keys(groups);
    var groupItems = groupKeys.map(function(project) {
      return html\`<\${ChatProjectGroup} key=\${project} project=\${project} items=\${groups[project]} source=\${source} />\`;
    });
    var resultInfo = query ? html\`<div class="chat-search-status">\${cs.length} result\${cs.length !== 1 ? 's' : ''} in \${groupKeys.length} folder\${groupKeys.length !== 1 ? 's' : ''} for "\${query}"</div>\` : null;
    content = [resultInfo, groupItems];
  }

  var clearBtn = query ? html\`<button class="chat-search-clear" onClick=\${clearSearch} title="Clear search (Esc)">\\u2715</button>\` : null;

  return html\`
    <div id="chats-panel">
      <div class="chat-source-toggle">
        <button class=\${'chat-source-btn' + (source === 'claude' ? ' active' : '')} onClick=\${function() { chatSource.value = 'claude'; }}>Claude</button>
        <button class=\${'chat-source-btn' + (source === 'codex' ? ' active' : '')} onClick=\${function() { chatSource.value = 'codex'; }}>Codex</button>
      </div>
      <div class="chat-search-wrap">
        <svg class="chat-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#3b4261" stroke-width="1.5"><circle cx="6.5" cy="6.5" r="5" /><line x1="10" y1="10" x2="14.5" y2="14.5" /></svg>
        <input ref=\${searchRef} type="text" id="chat-search" placeholder="Search by title... (Enter)" onKeyDown=\${onSearchKeyDown} />
        \${clearBtn}
      </div>
      <div id="chat-list">\${content}</div>
    </div>
  \`;
}

function ConnectionStatus() {
  var connected = wsConnected.value;
  var label;
  if (connected) {
    var running = sessions.value.filter(function(s) { return s.status === 'running'; }).length;
    label = 'Connected | ' + running + ' session' + (running !== 1 ? 's' : '');
    var mem = totalMemoryMB.value;
    if (mem > 0) {
      label += ' | RAM ' + (mem >= 1024 ? (mem / 1024).toFixed(1) + ' GB' : mem + ' MB');
    }
  } else {
    label = 'Disconnected \\u2014 reconnecting...';
  }
  return html\`
    <div id="connection-status">
      <span class=\${'dot ' + (connected ? 'connected' : 'disconnected')}></span>
      <span>\${label}</span>
    </div>
  \`;
}

function Sidebar() {
  return html\`
    <div id="sidebar">
      <\${TabBar} />
      \${currentTab.value === 'terminals'
        ? html\`<div id="terminals-panel"><div id="session-list"><\${SessionList} /></div></div>\`
        : html\`<\${ChatsPanel} />\`
      }
      <\${ConnectionStatus} />
    </div>
  \`;
}
`;
