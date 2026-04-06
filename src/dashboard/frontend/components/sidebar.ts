export const SIDEBAR_JS = `
function TabBar() {
  function onKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      var next = currentTab.value === 'terminals' ? 'chats' : 'terminals';
      currentTab.value = next;
      if (next === 'chats') loadChats();
      else activeChatId.value = null;
      var btn = e.currentTarget.querySelector('[aria-selected="true"]');
      if (btn) btn.focus();
    }
  }

  return html\`
    <div class="tab-bar" role="tablist" aria-label="Navigation" onKeyDown=\${onKeyDown}>
      <button
        role="tab"
        id="tab-terminals"
        aria-selected=\${currentTab.value === 'terminals'}
        aria-controls="terminals-panel"
        tabindex=\${currentTab.value === 'terminals' ? '0' : '-1'}
        class=\${'tab-btn' + (currentTab.value === 'terminals' ? ' active' : '')}
        onClick=\${function() { currentTab.value = 'terminals'; activeChatId.value = null; }}
      >Terminals</button>
      <button
        role="tab"
        id="tab-chats"
        aria-selected=\${currentTab.value === 'chats'}
        aria-controls="chats-panel"
        tabindex=\${currentTab.value === 'chats' ? '0' : '-1'}
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
    ? html\`<input ref=\${inputRef} class="session-rename-input" aria-label="Rename session" onBlur=\${finishRename} onKeyDown=\${onRenameKeyDown} onClick=\${function(e) { e.stopPropagation(); }} />\`
    : html\`<span class="session-name-text" onDblClick=\${function(e) { e.stopPropagation(); startRename(e); }}>\${s.name || s.command}</span>\`;

  var menuEl = menuOpen ? html\`<div class="session-menu" role="menu" aria-label="Session options" onClick=\${function(e) { e.stopPropagation(); }}>
    <button class="session-menu-item" role="menuitem" onClick=\${startRename}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M11.5 1.5l3 3L5 14H2v-3z"/><path d="M9.5 3.5l3 3"/></svg>
      Rename
    </button>
  </div>\` : null;

  var isDragOver = preactHooks.useState(false);
  var isDragOverItem = isDragOver[0];
  var setDragOverItem = isDragOver[1];
  var dragOverPos = preactHooks.useState(null);
  var dragPos = dragOverPos[0];
  var setDragPos = dragOverPos[1];

  function onDragStart(e) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'session', id: s.id }));
    dragState.value = { type: 'session', id: s.id };
    e.currentTarget.classList.add('dragging');
  }

  function onDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    dragState.value = null;
    setDragOverItem(false);
    setDragPos(null);
  }

  function onDragOver(e) {
    if (!dragState.value || dragState.value.type !== 'session' || dragState.value.id === s.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var rect = e.currentTarget.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    setDragPos(e.clientY < midY ? 'before' : 'after');
    setDragOverItem(true);
  }

  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverItem(false);
      setDragPos(null);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOverItem(false);
    setDragPos(null);
    if (!dragState.value || dragState.value.type !== 'session') return;
    var dragId = dragState.value.id;
    if (dragId === s.id) return;

    // Reorder: compute current order from sessions list, then move dragId next to s.id
    var currentSessions = sessions.value;
    var ids = currentSessions.map(function(sess) { return sess.id; });
    var fromIdx = ids.indexOf(dragId);
    var toIdx = ids.indexOf(s.id);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    var insertIdx = ids.indexOf(s.id);
    if (dragPos === 'after') insertIdx += 1;
    ids.splice(insertIdx, 0, dragId);
    sessionOrder.value = ids;
    dragState.value = null;
  }

  var dropClass = isDragOverItem && dragPos ? ' drop-' + dragPos : '';

  function onSessionKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isRenaming) selectSession(s.id, { manual: true });
    }
  }

  return html\`
    <div
      class=\${'session-item' + (s.id === activeSessionId.value ? ' active' : '') + dropClass}
      role="option"
      aria-selected=\${s.id === activeSessionId.value}
      tabindex="0"
      aria-label=\${(s.name || s.command || s.id) + ', ' + s.status + (s.claudeState === 'blocked' ? ', needs attention' : '')}
      onClick=\${function() { if (!isRenaming) selectSession(s.id, { manual: true }); }}
      onKeyDown=\${onSessionKeyDown}
      draggable=\${!isRenaming}
      onDragStart=\${onDragStart}
      onDragEnd=\${onDragEnd}
      onDragOver=\${onDragOver}
      onDragLeave=\${onDragLeave}
      onDrop=\${onDrop}
    >
      <span class="drag-handle" aria-hidden="true" onMouseDown=\${function(e) { e.stopPropagation(); }}>
        <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/><circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/></svg>
      </span>
      <span class=\${'status-dot ' + s.status} role="img" aria-label=\${s.status}></span>
      <div class="session-info">
        <div class="session-cmd">
          \${nameDisplay}
          \${isDelegate && isOneshot ? html\`<span class="delegate-badge oneshot">oneshot</span>\` : null}
          \${isDelegate && isInteractive ? html\`<span class="delegate-badge interactive">interactive</span>\` : null}
          \${ramText ? html\`<span class="ram" aria-label=\${'Memory: ' + ramText}>\${ramText}</span>\` : null}
        </div>
        <div class="session-meta">\${metaText}</div>
      </div>
      \${s.completionStatus === 'done' ? html\`<span class="done-icon" role="img" aria-label="Task complete" title="Task complete"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#9ece6a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4 4 6-7"/></svg></span>\` : null}
      \${s.claudeState === 'blocked' && s.status === 'running' ? html\`<span class="blocked-icon" role="img" aria-label="Needs attention" title="Needs attention">!</span>\` : null}
      <div class="session-actions">
        <button class="session-dots-btn" aria-label="Session options" aria-haspopup="true" aria-expanded=\${menuOpen} title="Options" onClick=\${toggleMenu}>\u22ee</button>
        \${menuEl}
      </div>
      <button
        class="close-btn"
        aria-label=\${'Close session ' + (s.name || s.id)}
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
  var copyTimerRef = preactHooks.useRef(null);

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

  function onNewGemini(e) {
    e.stopPropagation();
    activeGroupPopover.value = null;
    createGeminiSession(cwd);
  }

  function onNewCursor(e) {
    e.stopPropagation();
    activeGroupPopover.value = null;
    createCursorSession(cwd);
  }

  function onNewWindsurf(e) {
    e.stopPropagation();
    activeGroupPopover.value = null;
    createWindsurfSession(cwd);
  }

  function onNewCopilot(e) {
    e.stopPropagation();
    activeGroupPopover.value = null;
    createCopilotSession(cwd);
  }

  function onNewDeepAgents(e) {
    e.stopPropagation();
    activeGroupPopover.value = null;
    createDeepAgentsSession(cwd);
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

  var groupDragOver = preactHooks.useState(false);
  var isGroupDragOver = groupDragOver[0];
  var setGroupDragOver = groupDragOver[1];
  var groupDragPos = preactHooks.useState(null);
  var gDragPos = groupDragPos[0];
  var setGDragPos = groupDragPos[1];

  function onGroupDragStart(e) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'group', id: label }));
    dragState.value = { type: 'group', id: label };
    e.currentTarget.parentElement.classList.add('dragging');
  }

  function onGroupDragEnd(e) {
    e.currentTarget.parentElement.classList.remove('dragging');
    dragState.value = null;
    setGroupDragOver(false);
    setGDragPos(null);
  }

  function onGroupDragOver(e) {
    if (!dragState.value || dragState.value.type !== 'group' || dragState.value.id === label) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var rect = e.currentTarget.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    setGDragPos(e.clientY < midY ? 'before' : 'after');
    setGroupDragOver(true);
  }

  function onGroupDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setGroupDragOver(false);
      setGDragPos(null);
    }
  }

  function onGroupDrop(e) {
    e.preventDefault();
    setGroupDragOver(false);
    setGDragPos(null);
    if (!dragState.value || dragState.value.type !== 'group') return;
    var dragLabel = dragState.value.id;
    if (dragLabel === label) return;

    // Compute current group keys from sessions
    var ss = sessions.value;
    var groupKeys = [];
    ss.forEach(function(s) {
      var cwd = s.cwd || 'unknown';
      var lbl;
      try { lbl = cwd.replace(/^\\/Users\\/[^/]+/, '~').replace(/^\\/home\\/[^/]+/, '~'); }
      catch(e) { lbl = cwd; }
      var parts = lbl.split('/').filter(function(p) { return p; });
      if (parts.length > 0) lbl = parts[parts.length - 1];
      if (groupKeys.indexOf(lbl) < 0) groupKeys.push(lbl);
    });

    // Apply existing groupOrder if any
    if (groupOrder.value.length > 0) {
      groupKeys.sort(function(a, b) {
        var ai = groupOrder.value.indexOf(a);
        var bi = groupOrder.value.indexOf(b);
        if (ai < 0) ai = 9999;
        if (bi < 0) bi = 9999;
        return ai - bi;
      });
    }

    var fromIdx = groupKeys.indexOf(dragLabel);
    if (fromIdx < 0) return;
    groupKeys.splice(fromIdx, 1);
    var toIdx = groupKeys.indexOf(label);
    if (gDragPos === 'after') toIdx += 1;
    groupKeys.splice(toIdx, 0, dragLabel);
    groupOrder.value = groupKeys;
    dragState.value = null;
  }

  var groupDropClass = isGroupDragOver && gDragPos ? ' drop-' + gDragPos : '';

  return html\`
    <div class=\${'terminal-group-wrapper' + groupDropClass} role="group" aria-label=\${label + ' — ' + stats}>
      <div
        class="chat-project-group"
        title=\${cwd}
        role="button"
        tabindex="0"
        aria-expanded=\${!isCollapsed}
        draggable="true"
        onDragStart=\${onGroupDragStart}
        onDragEnd=\${onGroupDragEnd}
        onDragOver=\${onGroupDragOver}
        onDragLeave=\${onGroupDragLeave}
        onDrop=\${onGroupDrop}
        onClick=\${function() {
          var cg = Object.assign({}, collapsedTermGroups.value);
          cg[label] = !cg[label];
          collapsedTermGroups.value = cg;
        }}
        onKeyDown=\${function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            var cg = Object.assign({}, collapsedTermGroups.value);
            cg[label] = !cg[label];
            collapsedTermGroups.value = cg;
          }
        }}
      >
        <span class="drag-handle group-drag-handle" aria-hidden="true" onMouseDown=\${function(e) { e.stopPropagation(); }}>
          <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/><circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/></svg>
        </span>
        <span class=\${'chevron' + (isCollapsed ? ' collapsed' : '')} aria-hidden="true">\u25bc</span>
        <span class="group-name">\${label}</span>
        <span class="group-stats" aria-label=\${running + ' of ' + items.length + ' running'}>\${stats}</span>
        <button class=\${'group-action-btn group-copy-btn' + (isCopied ? ' copied' : '')} aria-label=\${isCopied ? 'Path copied' : 'Copy path'} title="Copy path" onClick=\${onCopy}>
          <span class="copy-icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 012 9.5v-7A1.5 1.5 0 013.5 1h7A1.5 1.5 0 0112 2.5V5"/></svg></span>
          <span class="check-icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#9ece6a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4 4 6-7"/></svg></span>
        </button>
        <div class="group-popover-anchor" style="position:relative">
          <button class="group-action-btn group-add-btn" aria-label="New session in this directory" aria-haspopup="true" aria-expanded=\${popoverOpen} title="New session in this directory" onClick=\${onPlusClick}>+</button>
          \${popoverOpen ? html\`
            <div class="group-popover" role="menu" aria-label="New session type">
              <button class="group-popover-item" role="menuitem" onClick=\${onNewTerminal}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="2" width="14" height="12" rx="2"/><path d="M4 6l3 2-3 2"/><path d="M9 10h3"/></svg>
                <span>Terminal</span>
              </button>
              <button class="group-popover-item" role="menuitem" onClick=\${onNewClaude}>
                <svg class="agent-icon claude" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12l-1.5-3.5L3 7l3.5-1.5z"/><path d="M12 2l.5 1.5L14 4l-1.5.5L12 6l-.5-1.5L10 4l1.5-.5z"/></svg>
                <span>Claude Code</span>
              </button>
              <button class="group-popover-item" role="menuitem" onClick=\${onNewCodex}>
                <svg class="agent-icon codex" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12l-1.5-3.5L3 7l3.5-1.5z"/><path d="M12 2l.5 1.5L14 4l-1.5.5L12 6l-.5-1.5L10 4l1.5-.5z"/></svg>
                <span>Codex</span>
              </button>
              <button class="group-popover-item" role="menuitem" onClick=\${onNewGemini}>
                <svg class="agent-icon gemini" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1v14"/><path d="M3 3.5Q8 8 3 12.5"/><path d="M13 3.5Q8 8 13 12.5"/></svg>
                <span>Gemini</span>
              </button>
              <div class="group-popover-divider" role="separator"></div>
              <button class="group-popover-item" role="menuitem" onClick=\${onNewCursor}>
                <svg class="agent-icon cursor" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2l2 12 3-4 4-1z"/><path d="M9 9l4 4"/></svg>
                <span>Cursor</span>
              </button>
              <button class="group-popover-item" role="menuitem" onClick=\${onNewWindsurf}>
                <svg class="agent-icon windsurf" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10Q5 6 8 8Q11 10 14 6"/><path d="M2 13Q5 9 8 11Q11 13 14 9"/></svg>
                <span>Windsurf</span>
              </button>
              <button class="group-popover-item" role="menuitem" onClick=\${onNewCopilot}>
                <svg class="agent-icon copilot" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="5.5" cy="9.5" r="1.5"/><circle cx="10.5" cy="9.5" r="1.5"/><path d="M4 12.5Q8 15 12 12.5"/></svg>
                <span>Copilot</span>
              </button>
              <button class="group-popover-item" role="menuitem" onClick=\${onNewDeepAgents}>
                <svg class="agent-icon deep-agents" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="3" r="2"/><circle cx="3" cy="11" r="2"/><circle cx="13" cy="11" r="2"/><path d="M8 5v2L3 11M8 7l5 4"/></svg>
                <span>Deep Agents</span>
              </button>
            </div>
          \` : null}
        </div>
      </div>
      \${!isCollapsed ? html\`<div role="listbox" aria-label=\${label + ' sessions'}>\${items.map(function(s) {
        return html\`<\${SessionItem} key=\${s.id} session=\${s} />\`;
      })}</div>\` : null}
    </div>
  \`;
}

function SessionList() {
  var ss = sessions.value;
  if (ss.length === 0) {
    return html\`<div style="padding:12px;color:#7c849b;font-size:12px;">No sessions</div>\`;
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

  // Apply custom group ordering
  if (groupOrder.value.length > 0) {
    keys.sort(function(a, b) {
      var ai = groupOrder.value.indexOf(a);
      var bi = groupOrder.value.indexOf(b);
      if (ai < 0) ai = 9999;
      if (bi < 0) bi = 9999;
      return ai - bi;
    });
  }

  // Apply custom session ordering within groups
  if (sessionOrder.value.length > 0) {
    keys.forEach(function(k) {
      groups[k].sort(function(a, b) {
        var ai = sessionOrder.value.indexOf(a.id);
        var bi = sessionOrder.value.indexOf(b.id);
        if (ai < 0) ai = 9999;
        if (bi < 0) bi = 9999;
        return ai - bi;
      });
    });
  }

  return html\`\${keys.map(function(label) {
    return html\`<\${TerminalGroup} key=\${label} label=\${label} items=\${groups[label]} />\`;
  })}\`;
}

function ChatItem(props) {
  var c = props.chat;
  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChat(c.sessionId, props.source); }
  }
  return html\`
    <div
      class=\${'chat-item' + (c.sessionId === activeChatId.value ? ' active' : '')}
      role="option"
      tabindex="0"
      aria-selected=\${c.sessionId === activeChatId.value}
      onClick=\${function() { openChat(c.sessionId, props.source); }}
      onKeyDown=\${onKeyDown}
    >
      <button
        class="close-btn"
        aria-label="Delete chat"
        title="Delete chat"
        onClick=\${function(e) { e.stopPropagation(); activeModal.value = { type: 'deleteChat', chatId: c.sessionId, source: props.source }; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4m2 0v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z"/></svg>
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

  function toggle() {
    var cg = Object.assign({}, collapsedGroups.value);
    cg[project] = !cg[project];
    collapsedGroups.value = cg;
  }

  return html\`
    <div role="group" aria-label=\${project}>
      <div
        class="chat-project-group"
        role="button"
        tabindex="0"
        aria-expanded=\${!isCollapsed}
        title=\${items[0] && items[0].fullPath ? items[0].fullPath : ''}
        onClick=\${toggle}
        onKeyDown=\${function(e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        }}
      >
        <span class=\${'chevron' + (isCollapsed ? ' collapsed' : '')} aria-hidden="true">\u25bc</span>
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
  var searchRef = preactHooks.useRef(null);

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
  var cs = source === 'codex' ? codexChatSessions.value : source === 'gemini' ? geminiChatSessions.value : chatSessions.value;
  var loading = chatLoading.value;
  var query = chatSearchQuery.value;
  var content;
  if (loading) {
    var loadLabel = query ? 'Searching...' : 'Loading chats...';
    content = html\`<div style="padding:12px;color:#7982a9;font-size:12px;display:flex;align-items:center;gap:8px;"><span class="chat-spinner"></span> \${loadLabel}</div>\`;
  } else if (cs.length === 0 && query) {
    content = html\`<div class="chat-search-status">No results for "\${query}"</div>\`;
  } else if (cs.length === 0) {
    content = html\`<div class="chat-search-status" style="color:#7c849b">No chats found</div>\`;
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

  var clearBtn = query ? html\`<button class="chat-search-clear" onClick=\${clearSearch} aria-label="Clear search" title="Clear search (Esc)">\\u2715</button>\` : null;

  return html\`
    <div id="chats-panel" role="tabpanel" aria-labelledby="tab-chats">
      <div class="chat-source-toggle" role="radiogroup" aria-label="Chat source">
        <button role="radio" aria-checked=\${source === 'claude'} class=\${'chat-source-btn' + (source === 'claude' ? ' active' : '')} onClick=\${function() { chatSource.value = 'claude'; }}>Claude</button>
        <button role="radio" aria-checked=\${source === 'codex'} class=\${'chat-source-btn' + (source === 'codex' ? ' active' : '')} onClick=\${function() { chatSource.value = 'codex'; }}>Codex</button>
        <button role="radio" aria-checked=\${source === 'gemini'} class=\${'chat-source-btn' + (source === 'gemini' ? ' active' : '')} onClick=\${function() { chatSource.value = 'gemini'; }}>Gemini</button>
      </div>
      <div class="chat-search-wrap">
        <svg class="chat-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#7c849b" stroke-width="1.5" aria-hidden="true"><circle cx="6.5" cy="6.5" r="5" /><line x1="10" y1="10" x2="14.5" y2="14.5" /></svg>
        <input ref=\${searchRef} type="text" id="chat-search" aria-label="Search chats" placeholder="Search by title... (Enter)" onKeyDown=\${onSearchKeyDown} />
        \${clearBtn}
      </div>
      <div id="chat-list" role="listbox" aria-label="Chat sessions">\${content}</div>
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
    <div id="connection-status" role="status" aria-live="polite">
      <span class=\${'dot ' + (connected ? 'connected' : 'disconnected')} role="img" aria-label=\${connected ? 'Connected' : 'Disconnected'}></span>
      <span>\${label}</span>
    </div>
  \`;
}

function Sidebar() {
  return html\`
    <nav id="sidebar" aria-label="Session navigation">
      <\${TabBar} />
      \${currentTab.value === 'terminals'
        ? html\`<div id="terminals-panel" role="tabpanel" aria-labelledby="tab-terminals"><div class="terminals-toolbar"><button class=\${'auto-follow-btn' + (autoFollow.value ? ' active' : '')} aria-label="Auto-follow new sessions" aria-pressed=\${autoFollow.value} title=\${autoFollow.value ? 'Auto-follow new sessions (on)' : 'Auto-follow new sessions (off)'} onClick=\${function() { autoFollow.value = !autoFollow.value; }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v10M8 13l3-3M8 13l-3-3"/></svg>
          </button></div><div id="session-list"><\${SessionList} /></div></div>\`
        : html\`<\${ChatsPanel} />\`
      }
      <\${ConnectionStatus} />
    </nav>
  \`;
}
`;
