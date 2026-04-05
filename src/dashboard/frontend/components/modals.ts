export const MODALS_JS = `
// Tree node: single click = expand/collapse, double click = open (navigate into)
function FolderTreeNode(props) {
  var path = props.path;
  var name = props.name;
  var depth = props.depth;
  var selected = props.selected;
  var onSelect = props.onSelect;
  var onOpen = props.onOpen;

  var expanded = preactHooks.useState(false);
  var children = preactHooks.useState(null);
  var loading = preactHooks.useState(false);

  function loadChildren() {
    if (children[0] !== null) return;
    loading[1](true);
    fetch('/api/browse?path=' + encodeURIComponent(path))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        children[1]((data.dirs || []).map(function(d) {
          return { name: d, path: data.path + '/' + d };
        }));
        loading[1](false);
      })
      .catch(function() { loading[1](false); children[1]([]); });
  }

  function toggleExpand(e) {
    e.stopPropagation();
    if (expanded[0]) {
      expanded[1](false);
    } else {
      expanded[1](true);
      loadChildren();
    }
  }

  function handleRowClick(e) {
    e.stopPropagation();
    onSelect(path);
  }

  function handleRowDblClick(e) {
    e.stopPropagation();
    onOpen(path, name);
  }

  function handleChevronDblClick(e) {
    e.stopPropagation();
    // double-click on chevron just toggles expand, does NOT open
    toggleExpand(e);
  }

  var isSelected = selected === path;
  var chevronDown = html\`<svg class="ft-chevron open" width="8" height="8" viewBox="0 0 8 8"><path d="M1.5 2.5L4 5.5L6.5 2.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>\`;
  var chevronRight = html\`<svg class="ft-chevron" width="8" height="8" viewBox="0 0 8 8"><path d="M2.5 1.5L5.5 4L2.5 6.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>\`;

  return html\`
    <div class="ft-node">
      <div class=\${'ft-row' + (isSelected ? ' ft-selected' : '')}
           style=\${'padding-left: ' + (8 + depth * 18) + 'px'}
           onClick=\${handleRowClick}>
        <span class="ft-chevron-wrap" onClick=\${toggleExpand} onDblClick=\${handleChevronDblClick}>\${expanded[0] ? chevronDown : chevronRight}</span>
        <span class="ft-row-body" onDblClick=\${handleRowDblClick}>
          <svg class="ft-folder-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A.5.5 0 0 0 8.914 4H13.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/></svg>
          <span class="ft-name">\${name}</span>
        </span>
      </div>
      \${expanded[0] ? html\`
        <div class="ft-children">
          \${loading[0] ? html\`<div class="ft-loading" style=\${'padding-left: ' + (8 + (depth+1) * 18) + 'px'}>Loading…</div>\` : null}
          \${!loading[0] && children[0] && children[0].length === 0 ? html\`<div class="ft-empty" style=\${'padding-left: ' + (8 + (depth+1) * 18) + 'px'}>No subfolders</div>\` : null}
          \${!loading[0] && children[0] ? children[0].map(function(c) {
            return html\`<\${FolderTreeNode} key=\${c.path} path=\${c.path} name=\${c.name} depth=\${depth + 1} selected=\${selected} onSelect=\${onSelect} onOpen=\${onOpen} />\`;
          }) : null}
        </div>
      \` : null}
    </div>
  \`;
}

function NewTerminalModal() {
  var nameRef = preact.createRef();
  var commandRef = preact.createRef();
  var cwdRef = preact.createRef();
  var showBrowser = preactHooks.useState(false);
  var selectedPath = preactHooks.useState('');
  var cwdError = preactHooks.useState('');

  // Current root of the tree
  var rootPath = preactHooks.useState('');
  var rootName = preactHooks.useState('');
  var rootDirs = preactHooks.useState(null);

  function fetchDir(path) {
    return fetch('/api/browse?path=' + encodeURIComponent(path))
      .then(function(r) { return r.json(); });
  }

  function loadRoot(path) {
    rootDirs[1](null); // show loading
    fetchDir(path).then(function(data) {
      var rp = data.path;
      rootPath[1](rp);
      rootName[1](rp.split('/').pop() || '/');
      selectedPath[1](rp);
      if (cwdRef.current) cwdRef.current.value = rp;
      cwdError[1]('');
      rootDirs[1]((data.dirs || []).map(function(d) {
        return { name: d, path: rp + '/' + d };
      }));
    }).catch(function() { rootDirs[1]([]); });
  }

  function openBrowser() {
    var next = !showBrowser[0];
    showBrowser[1](next);
    if (next && rootDirs[0] === null) {
      var startPath = cwdRef.current.value.trim() || '~';
      loadRoot(startPath);
    }
  }

  function onSelectFolder(path) {
    selectedPath[1](path);
    cwdRef.current.value = path;
    cwdError[1]('');
  }

  // Double-click: navigate into folder (becomes new root)
  function onOpenFolder(path, name) {
    loadRoot(path);
  }

  function navigateUp() {
    var parts = rootPath[0].split('/');
    parts.pop();
    var parent = parts.join('/') || '/';
    loadRoot(parent);
  }

  function validateAndSubmit() {
    var body = {};
    var name = nameRef.current.value.trim();
    var command = commandRef.current.value.trim();
    var cwd = cwdRef.current.value.trim();
    if (name) body.name = name;
    if (command) body.command = command;
    if (cwd) {
      fetch('/api/validate-path?path=' + encodeURIComponent(cwd))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (!data.exists) { cwdError[1]('Path does not exist'); return; }
          if (!data.isDirectory) { cwdError[1]('Path is not a directory'); return; }
          cwdError[1]('');
          body.cwd = data.path;
          createTerminal(body);
        })
        .catch(function() { cwdError[1]('Could not validate path'); });
    } else {
      createTerminal(body);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') validateAndSubmit();
    if (e.key === 'Escape') activeModal.value = null;
  }

  preactHooks.useEffect(function() {
    if (nameRef.current) nameRef.current.focus();
  }, []);

  var homeIcon = html\`<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink:0"><path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5h.793l.853 5.117A1 1 0 0 0 4.133 13.5h7.734a1 1 0 0 0 .986-.883L13.707 7.5h.793a.5.5 0 0 0 .354-.854l-6-6z"/></svg>\`;

  return html\`
    <div class="modal-box" onKeyDown=\${onKeyDown}>
      <h3>New Terminal</h3>
      <div class="modal-field"><label>Name</label><input type="text" ref=\${nameRef} placeholder="my-session" /></div>
      <div class="modal-field"><label>Command</label><input type="text" ref=\${commandRef} placeholder="default shell" /></div>
      <div class="modal-field">
        <label>Working Directory</label>
        <div class="cwd-input-row">
          <input type="text" ref=\${cwdRef} placeholder="current directory" onInput=\${function() { cwdError[1](''); }} />
          <button class=\${'cwd-browse-btn' + (showBrowser[0] ? ' active' : '')} onClick=\${openBrowser} title="Browse folders">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A.5.5 0 0 0 8.914 4H13.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/></svg>
          </button>
        </div>
        \${cwdError[0] ? html\`<div class="cwd-error">\${cwdError[0]}</div>\` : null}
      </div>
      \${showBrowser[0] ? html\`
        <div class="folder-tree">
          <div class="ft-header">
            <button class="ft-back-btn" onClick=\${navigateUp} disabled=\${rootPath[0] === '/'} title="Go up">
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M6.5 1.5L3 5L6.5 8.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <span class="ft-header-icon">\${homeIcon}</span>
            <span class="ft-header-name">\${rootName[0]}</span>
            <span class="ft-header-count">\${rootDirs[0] ? rootDirs[0].length + ' folders' : ''}</span>
          </div>
          <div class="ft-scroll">
            \${rootDirs[0] === null ? html\`<div class="ft-loading" style="padding-left: 8px">Loading…</div>\` : null}
            \${rootDirs[0] && rootDirs[0].length === 0 ? html\`<div class="ft-empty" style="padding-left: 8px">No subfolders</div>\` : null}
            \${rootDirs[0] ? rootDirs[0].map(function(d) {
              return html\`<\${FolderTreeNode} key=\${d.path} path=\${d.path} name=\${d.name} depth=\${0} selected=\${selectedPath[0]} onSelect=\${onSelectFolder} onOpen=\${onOpenFolder} />\`;
            }) : null}
          </div>
        </div>
      \` : null}
      <div class="modal-actions">
        <button class="modal-cancel" onClick=\${function() { activeModal.value = null; }}>Cancel</button>
        <button class="modal-create" onClick=\${validateAndSubmit}>Create</button>
      </div>
    </div>
  \`;
}

function DeleteChatModal(props) {
  function onKeyDown(e) {
    if (e.key === 'Escape') activeModal.value = null;
  }

  return html\`
    <div class="modal-box" onKeyDown=\${onKeyDown}>
      <h3>Delete this chat session?</h3>
      <p>This action cannot be undone. The session file will be permanently removed.</p>
      <div class="modal-actions">
        <button class="modal-cancel" onClick=\${function() { activeModal.value = null; }}>Cancel</button>
        <button class="modal-delete" onClick=\${function() {
          deleteChat(props.chatId, props.source);
          activeModal.value = null;
        }}>Delete</button>
      </div>
    </div>
  \`;
}

function SettingsModal() {
  var loading = preactHooks.useState(true);
  var settings = preactHooks.useState(null);
  var saving = preactHooks.useState(false);
  var saveMsg = preactHooks.useState('');

  // Editable field values
  var maxSessions = preactHooks.useState('');
  var idleTimeout = preactHooks.useState('');
  var bufferSize = preactHooks.useState('');
  var exitedTtl = preactHooks.useState('');
  var shell = preactHooks.useState('');
  var claudePath = preactHooks.useState('');
  var codexPath = preactHooks.useState('');
  var geminiPath = preactHooks.useState('');
  var cursorPath = preactHooks.useState('');
  var windsurfPath = preactHooks.useState('');
  var copilotPath = preactHooks.useState('');
  var deepAgentsPath = preactHooks.useState('');
  var whisperPath = preactHooks.useState('');
  var whisperModelPath = preactHooks.useState('');

  function loadSettings() {
    loading[1](true);
    fetch(apiBase + '/api/settings', { headers: authHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        settings[1](data);
        var c = data.config || {};
        maxSessions[1](String(c.maxSessions || ''));
        idleTimeout[1](String(c.idleTimeout || ''));
        bufferSize[1](String(c.bufferSize || ''));
        exitedTtl[1](String(c.exitedTtl || ''));
        shell[1](c.shell || '');
        claudePath[1](c.claudePath || '');
        codexPath[1](c.codexPath || '');
        geminiPath[1](c.geminiPath || '');
        cursorPath[1](c.cursorPath || '');
        windsurfPath[1](c.windsurfPath || '');
        copilotPath[1](c.copilotPath || '');
        deepAgentsPath[1](c.deepAgentsPath || '');
        whisperPath[1](c.whisperPath || '');
        whisperModelPath[1](c.whisperModelPath || '');
        loading[1](false);
      })
      .catch(function() { loading[1](false); });
  }

  preactHooks.useEffect(function() { loadSettings(); }, []);

  function formatDuration(ms) {
    var num = parseInt(ms, 10);
    if (isNaN(num) || num <= 0) return '';
    if (num >= 86400000) return (num / 86400000).toFixed(1).replace(/\\.0$/, '') + 'd';
    if (num >= 3600000) return (num / 3600000).toFixed(1).replace(/\\.0$/, '') + 'h';
    if (num >= 60000) return (num / 60000).toFixed(1).replace(/\\.0$/, '') + 'm';
    return (num / 1000).toFixed(0) + 's';
  }

  function formatBytes(bytes) {
    var num = parseInt(bytes, 10);
    if (isNaN(num) || num <= 0) return '';
    if (num >= 1048576) return (num / 1048576).toFixed(1).replace(/\\.0$/, '') + ' MB';
    if (num >= 1024) return (num / 1024).toFixed(0) + ' KB';
    return num + ' B';
  }

  function sourceTag(fieldName) {
    if (!settings[0] || !settings[0].fields || !settings[0].fields[fieldName]) return null;
    var src = settings[0].fields[fieldName].source;
    if (src === 'default') return null;
    var colors = { cli: '#bb9af7', env: '#e0af68', file: '#7aa2f7' };
    return html\`<span class="settings-source" style=\${'color:' + (colors[src] || '#565f89')}>\${src}</span>\`;
  }

  function isOverridden(fieldName) {
    if (!settings[0] || !settings[0].fields || !settings[0].fields[fieldName]) return false;
    var src = settings[0].fields[fieldName].source;
    return src === 'cli' || src === 'env';
  }

  function save() {
    saving[1](true);
    saveMsg[1]('');
    var updates = {};
    var ms = parseInt(maxSessions[0], 10);
    if (!isNaN(ms) && ms > 0) updates.maxSessions = ms;
    var it = parseInt(idleTimeout[0], 10);
    if (!isNaN(it) && it >= 0) updates.idleTimeout = it;
    var bs = parseInt(bufferSize[0], 10);
    if (!isNaN(bs) && bs >= 1024) updates.bufferSize = bs;
    var et = parseInt(exitedTtl[0], 10);
    if (!isNaN(et) && et >= 0) updates.exitedTtl = et;
    if (shell[0].trim()) updates.shell = shell[0].trim();
    if (claudePath[0].trim()) updates.claudePath = claudePath[0].trim();
    if (codexPath[0].trim()) updates.codexPath = codexPath[0].trim();
    if (geminiPath[0].trim()) updates.geminiPath = geminiPath[0].trim();
    if (cursorPath[0].trim()) updates.cursorPath = cursorPath[0].trim();
    if (windsurfPath[0].trim()) updates.windsurfPath = windsurfPath[0].trim();
    if (copilotPath[0].trim()) updates.copilotPath = copilotPath[0].trim();
    if (deepAgentsPath[0].trim()) updates.deepAgentsPath = deepAgentsPath[0].trim();
    if (whisperPath[0].trim()) updates.whisperPath = whisperPath[0].trim();
    if (whisperModelPath[0].trim()) updates.whisperModelPath = whisperModelPath[0].trim();

    fetch(apiBase + '/api/settings', {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.error) { saveMsg[1](data.error); saving[1](false); return; }
      settings[1](data);
      saveMsg[1]('Saved');
      saving[1](false);
      checkVoiceAvailable();
      setTimeout(function() { saveMsg[1](''); }, 2000);
    }).catch(function(err) {
      saveMsg[1]('Save failed');
      saving[1](false);
    });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') activeModal.value = null;
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
  }

  if (loading[0]) return html\`<div class="modal-box settings-modal" onKeyDown=\${onKeyDown}><h3>Settings</h3><div style="padding:16px 0;color:#565f89">Loading…</div></div>\`;

  return html\`
    <div class="modal-box settings-modal" onKeyDown=\${onKeyDown}>
      <h3>Settings</h3>
      <p>Changes are saved to <code>~/.forge/settings.json</code> and apply immediately.</p>

      <div class="settings-section">
        <div class="settings-section-title">Sessions</div>
        <div class="modal-field">
          <label>Max Sessions \${sourceTag('maxSessions')}</label>
          <input type="number" min="1" value=\${maxSessions[0]} disabled=\${isOverridden('maxSessions')}
            onInput=\${function(e) { maxSessions[1](e.target.value); }}
            placeholder="10" />
          \${isOverridden('maxSessions') ? html\`<div class="settings-hint">Overridden by \${settings[0].fields.maxSessions.source} arg</div>\` : null}
        </div>
        <div class="modal-field">
          <label>Idle Timeout (ms) \${sourceTag('idleTimeout')}</label>
          <input type="number" min="0" value=\${idleTimeout[0]} disabled=\${isOverridden('idleTimeout')}
            onInput=\${function(e) { idleTimeout[1](e.target.value); }}
            placeholder="1800000" />
          <div class="settings-hint">\${formatDuration(idleTimeout[0]) ? 'Currently: ' + formatDuration(idleTimeout[0]) : 'New sessions will use this timeout'}</div>
          \${isOverridden('idleTimeout') ? html\`<div class="settings-hint">Overridden by \${settings[0].fields.idleTimeout.source} arg</div>\` : null}
        </div>
        <div class="modal-field">
          <label>Buffer Size (bytes) \${sourceTag('bufferSize')}</label>
          <input type="number" min="1024" value=\${bufferSize[0]} disabled=\${isOverridden('bufferSize')}
            onInput=\${function(e) { bufferSize[1](e.target.value); }}
            placeholder="1048576" />
          <div class="settings-hint">\${formatBytes(bufferSize[0]) ? 'Currently: ' + formatBytes(bufferSize[0]) : 'Ring buffer for new sessions'}</div>
        </div>
        <div class="modal-field">
          <label>Exited Session TTL (ms) \${sourceTag('exitedTtl')}</label>
          <input type="number" min="0" value=\${exitedTtl[0]} disabled=\${isOverridden('exitedTtl')}
            onInput=\${function(e) { exitedTtl[1](e.target.value); }}
            placeholder="3600000" />
          <div class="settings-hint">\${formatDuration(exitedTtl[0]) ? 'Currently: ' + formatDuration(exitedTtl[0]) : 'How long to keep exited sessions'}</div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Paths</div>
        <div class="modal-field">
          <label>Shell \${sourceTag('shell')}</label>
          <input type="text" value=\${shell[0]} disabled=\${isOverridden('shell')}
            onInput=\${function(e) { shell[1](e.target.value); }}
            placeholder="/bin/zsh" />
        </div>
        <div class="modal-field">
          <label>Claude CLI Path \${sourceTag('claudePath')}</label>
          <input type="text" value=\${claudePath[0]} disabled=\${isOverridden('claudePath')}
            onInput=\${function(e) { claudePath[1](e.target.value); }}
            placeholder="claude" />
        </div>
        <div class="modal-field">
          <label>Codex CLI Path \${sourceTag('codexPath')}</label>
          <input type="text" value=\${codexPath[0]} disabled=\${isOverridden('codexPath')}
            onInput=\${function(e) { codexPath[1](e.target.value); }}
            placeholder="codex" />
        </div>
        <div class="modal-field">
          <label>Gemini CLI Path \${sourceTag('geminiPath')}</label>
          <input type="text" value=\${geminiPath[0]} disabled=\${isOverridden('geminiPath')}
            onInput=\${function(e) { geminiPath[1](e.target.value); }}
            placeholder="gemini" />
        </div>
        <div class="modal-field">
          <label>Cursor Path \${sourceTag('cursorPath')}</label>
          <input type="text" value=\${cursorPath[0]} disabled=\${isOverridden('cursorPath')}
            onInput=\${function(e) { cursorPath[1](e.target.value); }}
            placeholder="cursor" />
        </div>
        <div class="modal-field">
          <label>Windsurf Path \${sourceTag('windsurfPath')}</label>
          <input type="text" value=\${windsurfPath[0]} disabled=\${isOverridden('windsurfPath')}
            onInput=\${function(e) { windsurfPath[1](e.target.value); }}
            placeholder="windsurf" />
        </div>
        <div class="modal-field">
          <label>Copilot Path \${sourceTag('copilotPath')}</label>
          <input type="text" value=\${copilotPath[0]} disabled=\${isOverridden('copilotPath')}
            onInput=\${function(e) { copilotPath[1](e.target.value); }}
            placeholder="copilot" />
        </div>
        <div class="modal-field">
          <label>Deep Agents Path \${sourceTag('deepAgentsPath')}</label>
          <input type="text" value=\${deepAgentsPath[0]} disabled=\${isOverridden('deepAgentsPath')}
            onInput=\${function(e) { deepAgentsPath[1](e.target.value); }}
            placeholder="deep-agents" />
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Voice Input</div>
        <div class="modal-field">
          <label>Whisper Path \${sourceTag('whisperPath')}</label>
          <input type="text" value=\${whisperPath[0]} disabled=\${isOverridden('whisperPath')}
            onInput=\${function(e) { whisperPath[1](e.target.value); }}
            placeholder="/path/to/whisper-cli" />
          <div class="settings-hint">Path to whisper.cpp main binary. Required for voice input.</div>
        </div>
        <div class="modal-field">
          <label>Whisper Model Path \${sourceTag('whisperModelPath')}</label>
          <input type="text" value=\${whisperModelPath[0]} disabled=\${isOverridden('whisperModelPath')}
            onInput=\${function(e) { whisperModelPath[1](e.target.value); }}
            placeholder="/path/to/ggml-base.bin" />
          <div class="settings-hint">Path to whisper.cpp model file (ggml format). Recommended: ggml-base.bin</div>
        </div>
      </div>

      <div class="modal-actions">
        \${saveMsg[0] ? html\`<span class="settings-save-msg">\${saveMsg[0]}</span>\` : null}
        <button class="modal-cancel" onClick=\${function() { activeModal.value = null; }}>Close</button>
        <button class="modal-create" onClick=\${save} disabled=\${saving[0]}>\${saving[0] ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  \`;
}

function ModalOverlay() {
  var modal = activeModal.value;
  if (!modal) return null;

  function onOverlayClick(e) {
    if (e.target === e.currentTarget) activeModal.value = null;
  }

  var content;
  if (modal.type === 'newTerminal') content = html\`<\${NewTerminalModal} />\`;
  else if (modal.type === 'deleteChat') content = html\`<\${DeleteChatModal} chatId=\${modal.chatId} source=\${modal.source} />\`;
  else if (modal.type === 'settings') content = html\`<\${SettingsModal} />\`;
  else return null;

  return html\`<div class="modal-overlay" onClick=\${onOverlayClick}>\${content}</div>\`;
}
`;
