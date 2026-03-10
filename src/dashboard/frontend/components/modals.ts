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

function ModalOverlay() {
  var modal = activeModal.value;
  if (!modal) return null;

  function onOverlayClick(e) {
    if (e.target === e.currentTarget) activeModal.value = null;
  }

  var content;
  if (modal.type === 'newTerminal') content = html\`<\${NewTerminalModal} />\`;
  else if (modal.type === 'deleteChat') content = html\`<\${DeleteChatModal} chatId=\${modal.chatId} source=\${modal.source} />\`;
  else return null;

  return html\`<div class="modal-overlay" onClick=\${onOverlayClick}>\${content}</div>\`;
}
`;
