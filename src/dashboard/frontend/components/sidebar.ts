export const SIDEBAR_JS = `
function SidebarHeader() {
  return html\`
    <div id="sidebar-header">
      <img class="logo" src="/logo.png" alt="Forge" /> Forge
      <span class="spacer"></span>
      <button
        id="new-terminal-btn"
        title="New terminal"
        class=\${currentTab.value !== 'terminals' ? 'hidden' : ''}
        onClick=\${function() { activeModal.value = { type: 'newTerminal' }; }}
      >+</button>
      <button
        id="auto-follow-btn"
        class=\${(autoFollow.value ? 'active' : '') + (currentTab.value !== 'terminals' ? ' hidden' : '')}
        title="Auto-follow new sessions"
        onClick=\${function() { autoFollow.value = !autoFollow.value; }}
      >Follow</button>
    </div>
  \`;
}

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

  return html\`
    <div
      class=\${'session-item' + (s.id === activeSessionId.value ? ' active' : '')}
      onClick=\${function() { selectSession(s.id); }}
    >
      <span class=\${'status-dot ' + s.status}></span>
      <div class="session-info">
        <div class="session-cmd">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${s.name || s.command}</span>
          \${ramText ? html\`<span class="ram">\${ramText}</span>\` : null}
        </div>
        <div class="session-meta">\${metaText}</div>
      </div>
      <button
        class="close-btn"
        title="Close session"
        onClick=\${function(e) { e.stopPropagation(); closeSession(s.id); }}
      >\u00d7</button>
    </div>
  \`;
}

function SessionList() {
  var ss = sessions.value;
  if (ss.length === 0) {
    return html\`<div style="padding:12px;color:#3b4261;font-size:12px;">No sessions</div>\`;
  }
  return html\`\${ss.map(function(s) {
    return html\`<\${SessionItem} key=\${s.id} session=\${s} />\`;
  })}\`;
}

function ChatItem(props) {
  var c = props.chat;
  return html\`
    <div
      class=\${'chat-item' + (c.sessionId === activeChatId.value ? ' active' : '')}
      onClick=\${function() { openChat(c.sessionId); }}
    >
      <button
        class="close-btn"
        title="Delete chat"
        onClick=\${function(e) { e.stopPropagation(); activeModal.value = { type: 'deleteChat', chatId: c.sessionId }; }}
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
        return html\`<\${ChatItem} key=\${c.sessionId} chat=\${c} />\`;
      }) : null}
    </div>
  \`;
}

var __chatSearchTimer = null;
function ChatsPanel() {
  function onInput(e) {
    clearTimeout(__chatSearchTimer);
    __chatSearchTimer = setTimeout(function() { loadChats(e.target.value); }, 300);
  }

  var cs = chatSessions.value;
  var loading = chatLoading.value;
  var content;
  if (loading && cs.length === 0) {
    content = html\`<div style="padding:12px;color:#565f89;font-size:12px;display:flex;align-items:center;gap:8px;"><span class="chat-spinner"></span> Loading chats...</div>\`;
  } else if (cs.length === 0) {
    content = html\`<div style="padding:12px;color:#3b4261;font-size:12px;">No chats found</div>\`;
  } else {
    var groups = {};
    cs.forEach(function(c) {
      if (!groups[c.project]) groups[c.project] = [];
      groups[c.project].push(c);
    });
    content = Object.keys(groups).map(function(project) {
      return html\`<\${ChatProjectGroup} key=\${project} project=\${project} items=\${groups[project]} />\`;
    });
  }

  return html\`
    <div id="chats-panel">
      <input type="text" id="chat-search" placeholder="Search chats..." onInput=\${onInput} />
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
      label += ' | ' + (mem >= 1024 ? (mem / 1024).toFixed(1) + ' GB' : mem + ' MB');
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
      <\${SidebarHeader} />
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
