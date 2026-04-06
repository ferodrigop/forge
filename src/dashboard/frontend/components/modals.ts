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

  function onRowKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); handleRowDblClick(e); }
    if (e.key === ' ') { e.preventDefault(); onSelect(path); }
    if (e.key === 'ArrowRight' && !expanded[0]) { e.preventDefault(); toggleExpand(e); }
    if (e.key === 'ArrowLeft' && expanded[0]) { e.preventDefault(); expanded[1](false); }
  }

  return html\`
    <div class="ft-node" role="treeitem" aria-expanded=\${expanded[0]} aria-selected=\${isSelected} aria-label=\${name}>
      <div class=\${'ft-row' + (isSelected ? ' ft-selected' : '')}
           style=\${'padding-left: ' + (8 + depth * 18) + 'px'}
           tabindex="0"
           onClick=\${handleRowClick}
           onKeyDown=\${onRowKeyDown}>
        <span class="ft-chevron-wrap" onClick=\${toggleExpand} onDblClick=\${handleChevronDblClick} aria-hidden="true">\${expanded[0] ? chevronDown : chevronRight}</span>
        <span class="ft-row-body" onDblClick=\${handleRowDblClick}>
          <svg class="ft-folder-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A.5.5 0 0 0 8.914 4H13.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/></svg>
          <span class="ft-name">\${name}</span>
        </span>
      </div>
      \${expanded[0] ? html\`
        <div class="ft-children" role="group">
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
  var nameRef = preactHooks.useRef(null);
  var commandRef = preactHooks.useRef(null);
  var cwdRef = preactHooks.useRef(null);
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

  var nameId = 'nt-name-' + Date.now();
  var cmdId = 'nt-cmd-' + Date.now();
  var cwdId = 'nt-cwd-' + Date.now();

  return html\`
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-new-terminal-title" onKeyDown=\${onKeyDown}>
      <h3 id="modal-new-terminal-title">New Terminal</h3>
      <div class="modal-field"><label for=\${nameId}>Name</label><input id=\${nameId} type="text" ref=\${nameRef} placeholder="my-session" /></div>
      <div class="modal-field"><label for=\${cmdId}>Command</label><input id=\${cmdId} type="text" ref=\${commandRef} placeholder="default shell" /></div>
      <div class="modal-field">
        <label for=\${cwdId}>Working Directory</label>
        <div class="cwd-input-row">
          <input id=\${cwdId} type="text" ref=\${cwdRef} placeholder="current directory" onInput=\${function() { cwdError[1](''); }} />
          <button class=\${'cwd-browse-btn' + (showBrowser[0] ? ' active' : '')} onClick=\${openBrowser} aria-label="Browse folders" aria-expanded=\${showBrowser[0]} title="Browse folders">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A.5.5 0 0 0 8.914 4H13.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/></svg>
          </button>
        </div>
        \${cwdError[0] ? html\`<div class="cwd-error">\${cwdError[0]}</div>\` : null}
      </div>
      \${showBrowser[0] ? html\`
        <div class="folder-tree" role="region" aria-label="Folder browser">
          <div class="ft-header">
            <button class="ft-back-btn" onClick=\${navigateUp} disabled=\${rootPath[0] === '/'} aria-label="Go up one directory" title="Go up">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M6.5 1.5L3 5L6.5 8.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <span class="ft-header-icon">\${homeIcon}</span>
            <span class="ft-header-name">\${rootName[0]}</span>
            <span class="ft-header-count">\${rootDirs[0] ? rootDirs[0].length + ' folders' : ''}</span>
          </div>
          <div class="ft-scroll" role="tree" aria-label="Folders">
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
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-delete-title" onKeyDown=\${onKeyDown}>
      <h3 id="modal-delete-title">Delete this chat session?</h3>
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

  if (loading[0]) return html\`<div class="modal-box settings-modal" role="dialog" aria-modal="true" aria-label="Settings" onKeyDown=\${onKeyDown}><h3>Settings</h3><div style="padding:16px 0;color:#7982a9">Loading…</div></div>\`;

  return html\`
    <div class="modal-box settings-modal" role="dialog" aria-modal="true" aria-labelledby="modal-settings-title" onKeyDown=\${onKeyDown}>
      <h3 id="modal-settings-title">Settings</h3>
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
        <div class="settings-hint" style="margin-bottom:8px">Voice input works out of the box using built-in transcription. Set whisper.cpp paths below for faster local inference.</div>
        <div class="modal-field">
          <label>Whisper Path \${sourceTag('whisperPath')}</label>
          <input type="text" value=\${whisperPath[0]} disabled=\${isOverridden('whisperPath')}
            onInput=\${function(e) { whisperPath[1](e.target.value); }}
            placeholder="/path/to/whisper-cli" />
          <div class="settings-hint">Leave empty for built-in transcription (auto-downloads model on first use).</div>
        </div>
        <div class="modal-field">
          <label>Whisper Model Path \${sourceTag('whisperModelPath')}</label>
          <input type="text" value=\${whisperModelPath[0]} disabled=\${isOverridden('whisperModelPath')}
            onInput=\${function(e) { whisperModelPath[1](e.target.value); }}
            placeholder="/path/to/ggml-base.bin" />
          <div class="settings-hint">Path to whisper.cpp model file (ggml format). Only needed when Whisper Path is set.</div>
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

var _broadcastCloseTimer = null;

function BroadcastModal() {
  var textRef = preactHooks.useRef(null);
  var selectMode = preactHooks.useState('all'); // 'all' | 'tag' | 'pick'
  var tagFilter = preactHooks.useState('');
  var selectedIds = preactHooks.useState({});
  var appendNewline = preactHooks.useState(true);
  var sent = preactHooks.useState(false);

  // Clear auto-close timer when modal unmounts
  preactHooks.useEffect(function() {
    return function() {
      if (_broadcastCloseTimer) { clearTimeout(_broadcastCloseTimer); _broadcastCloseTimer = null; }
    };
  }, []);

  var runningSessions = sessions.value.filter(function(s) { return s.status === 'running'; });

  // Collect unique tags from running sessions
  var allTags = {};
  runningSessions.forEach(function(s) {
    if (s.tags) s.tags.forEach(function(t) { allTags[t] = true; });
  });
  var tagList = Object.keys(allTags).sort();

  // Compute target sessions based on mode
  var targets = [];
  if (selectMode[0] === 'all') {
    targets = runningSessions;
  } else if (selectMode[0] === 'tag' && tagFilter[0]) {
    targets = runningSessions.filter(function(s) {
      return s.tags && s.tags.indexOf(tagFilter[0]) >= 0;
    });
  } else if (selectMode[0] === 'pick') {
    targets = runningSessions.filter(function(s) { return selectedIds[0][s.id]; });
  }

  function toggleSession(id) {
    var next = Object.assign({}, selectedIds[0]);
    if (next[id]) delete next[id];
    else next[id] = true;
    selectedIds[1](next);
  }

  function sendBroadcast() {
    if (targets.length === 0) return;
    var ta = textRef.current;
    if (!ta || !ta.value.trim()) return;
    if (_broadcastCloseTimer) { clearTimeout(_broadcastCloseTimer); _broadcastCloseTimer = null; }
    var msg = { type: 'broadcast', input: ta.value, newline: appendNewline[0] };
    if (selectMode[0] === 'tag' && tagFilter[0]) {
      msg.tag = tagFilter[0];
    } else {
      msg.ids = targets.map(function(s) { return s.id; });
    }
    wsSend(msg);
    sent[1](true);
    _broadcastCloseTimer = setTimeout(function() {
      _broadcastCloseTimer = null;
      activeModal.value = null;
      sent[1](false);
      broadcastResult.value = null;
    }, 2500);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') activeModal.value = null;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); sendBroadcast(); }
  }

  preactHooks.useEffect(function() {
    if (textRef.current) textRef.current.focus();
  }, []);

  if (sent[0]) {
    var br = broadcastResult.value;
    var sentCount = br ? br.sent : targets.length;
    var failedCount = br ? br.failed : 0;
    return html\`
      <div class="modal-box broadcast-modal" role="dialog" aria-modal="true" aria-label="Broadcast sent">
        <div class="broadcast-sent">
          <span class="broadcast-sent-icon">\u2713</span>
          <span>Sent to \${sentCount} terminal\${sentCount !== 1 ? 's' : ''}\${failedCount > 0 ? ', ' + failedCount + ' failed' : ''}</span>
        </div>
      </div>
    \`;
  }

  return html\`
    <div class="modal-box broadcast-modal" role="dialog" aria-modal="true" aria-labelledby="modal-broadcast-title" onKeyDown=\${onKeyDown}>
      <h3 id="modal-broadcast-title">Broadcast Input</h3>
      <p>Send the same input to multiple terminals at once.</p>

      <div class="modal-field">
        <label>Message</label>
        <textarea
          ref=\${textRef}
          class="broadcast-textarea"
          aria-label="Broadcast message"
          placeholder="Type command or text to broadcast..."
          rows="3"
        />
      </div>

      <div class="modal-field">
        <label>Append newline</label>
        <label class="broadcast-checkbox-label">
          <input type="checkbox" checked=\${appendNewline[0]} onChange=\${function(e) { appendNewline[1](e.target.checked); }} />
          Send Enter after message
        </label>
      </div>

      <div class="modal-field">
        <label>Target selection</label>
        <div class="broadcast-mode-tabs">
          <button class=\${'broadcast-mode-btn' + (selectMode[0] === 'all' ? ' active' : '')} onClick=\${function() { selectMode[1]('all'); }}>All running (\${runningSessions.length})</button>
          <button class=\${'broadcast-mode-btn' + (selectMode[0] === 'tag' ? ' active' : '')} onClick=\${function() { selectMode[1]('tag'); }}>By tag</button>
          <button class=\${'broadcast-mode-btn' + (selectMode[0] === 'pick' ? ' active' : '')} onClick=\${function() { selectMode[1]('pick'); }}>Pick</button>
        </div>
      </div>

      \${selectMode[0] === 'tag' ? html\`
        <div class="modal-field">
          <label>Tag</label>
          \${tagList.length > 0 ? html\`
            <div class="broadcast-tag-list">
              \${tagList.map(function(t) {
                var isActive = tagFilter[0] === t;
                return html\`<button class=\${'broadcast-tag' + (isActive ? ' active' : '')} onClick=\${function() { tagFilter[1](isActive ? '' : t); }}>\${t}</button>\`;
              })}
            </div>
          \` : html\`<div class="broadcast-hint">No tags found on running sessions</div>\`}
        </div>
      \` : null}

      \${selectMode[0] === 'pick' ? html\`
        <div class="modal-field">
          <label>Sessions</label>
          <div class="broadcast-session-list">
            \${runningSessions.length === 0 ? html\`<div class="broadcast-hint">No running sessions</div>\` : null}
            \${runningSessions.map(function(s) {
              var checked = !!selectedIds[0][s.id];
              return html\`
                <label class="broadcast-session-row" key=\${s.id}>
                  <input type="checkbox" checked=\${checked} onChange=\${function() { toggleSession(s.id); }} />
                  <span class=\${'status-dot ' + s.status}></span>
                  <span class="broadcast-session-name">\${s.name || s.command}</span>
                  <span class="broadcast-session-id">\${s.id}</span>
                </label>
              \`;
            })}
          </div>
        </div>
      \` : null}

      <div class="broadcast-target-summary" role="status" aria-live="polite">
        \${targets.length} terminal\${targets.length !== 1 ? 's' : ''} will receive this message
      </div>

      <div class="modal-actions">
        <button class="modal-cancel" onClick=\${function() { activeModal.value = null; }}>Cancel</button>
        <button class="modal-create" disabled=\${targets.length === 0} onClick=\${sendBroadcast}>
          Send to \${targets.length} terminal\${targets.length !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  \`;
}

function VoiceDownloadModal() {
  var progress = voiceDownloadProgress.value;
  return html\`
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="voice-dl-title">
      <h3 id="voice-dl-title">Setting up voice</h3>
      <p>Downloading speech recognition model (~250 MB).<br/>Runs entirely on your machine \u2014 no cloud needed.</p>
      <div class="voice-progress-track">
        <div class="voice-progress-bar" style=\${'width:' + Math.max(progress, 2) + '%'}></div>
      </div>
      <div class="voice-progress-label">\${progress}%</div>
    </div>
  \`;
}

function ModalOverlay() {
  var modal = activeModal.value;
  if (!modal) return null;

  var overlayRef = preactHooks.useRef(null);
  var previousFocusRef = preactHooks.useRef(null);

  // Store the element that had focus before modal opened
  preactHooks.useEffect(function() {
    previousFocusRef.current = document.activeElement;

    // Focus the modal dialog on open
    setTimeout(function() {
      var dialog = overlayRef.current && overlayRef.current.querySelector('[role="dialog"]');
      if (dialog) {
        var firstFocusable = dialog.querySelector('input, button, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) firstFocusable.focus();
      }
    }, 0);

    return function() {
      // Return focus to trigger element on close
      if (previousFocusRef.current && previousFocusRef.current.focus) {
        previousFocusRef.current.focus();
      }
    };
  }, [modal.type]);

  function onOverlayClick(e) {
    if (e.target === e.currentTarget) activeModal.value = null;
  }

  // Focus trap: keep Tab within the modal
  function onKeyDown(e) {
    if (e.key !== 'Tab') return;
    var dialog = overlayRef.current && overlayRef.current.querySelector('[role="dialog"]');
    if (!dialog) return;
    var focusable = dialog.querySelectorAll('input:not([disabled]), button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  var content;
  if (modal.type === 'newTerminal') content = html\`<\${NewTerminalModal} />\`;
  else if (modal.type === 'deleteChat') content = html\`<\${DeleteChatModal} chatId=\${modal.chatId} source=\${modal.source} />\`;
  else if (modal.type === 'settings') content = html\`<\${SettingsModal} />\`;
  else if (modal.type === 'broadcast') content = html\`<\${BroadcastModal} />\`;
  else if (modal.type === 'voiceDownload') content = html\`<\${VoiceDownloadModal} />\`;
  else return null;

  return html\`<div class="modal-overlay" ref=\${overlayRef} onClick=\${onOverlayClick} onKeyDown=\${onKeyDown}>\${content}</div>\`;
}
`;
