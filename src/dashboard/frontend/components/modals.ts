export const MODALS_JS = `
function NewTerminalModal() {
  var nameRef = preact.createRef();
  var commandRef = preact.createRef();
  var cwdRef = preact.createRef();
  var showBrowser = preactHooks.useState(false);
  var browserPath = preactHooks.useState('~');
  var browserDirs = preactHooks.useState([]);
  var browserLoading = preactHooks.useState(false);
  var cwdError = preactHooks.useState('');

  function browseTo(path) {
    browserLoading[1](true);
    fetch('/api/browse?path=' + encodeURIComponent(path))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        browserPath[1](data.path);
        browserDirs[1](data.dirs || []);
        browserLoading[1](false);
      })
      .catch(function() { browserLoading[1](false); });
  }

  function openBrowser() {
    var current = cwdRef.current.value.trim() || '~';
    showBrowser[1](true);
    browseTo(current);
  }

  function selectDir(dir) {
    var newPath = browserPath[0] + '/' + dir;
    browseTo(newPath);
  }

  function confirmBrowse() {
    cwdRef.current.value = browserPath[0];
    showBrowser[1](false);
    cwdError[1]('');
  }

  function validateAndSubmit() {
    var body = {};
    var name = nameRef.current.value.trim();
    var command = commandRef.current.value.trim();
    var cwd = cwdRef.current.value.trim();
    if (name) body.name = name;
    if (command) body.command = command;
    if (cwd) {
      // Validate path exists
      fetch('/api/validate-path?path=' + encodeURIComponent(cwd))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (!data.exists) {
            cwdError[1]('Path does not exist');
            return;
          }
          if (!data.isDirectory) {
            cwdError[1]('Path is not a directory');
            return;
          }
          cwdError[1]('');
          body.cwd = data.path;
          createTerminal(body);
        })
        .catch(function() {
          cwdError[1]('Could not validate path');
        });
    } else {
      createTerminal(body);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !showBrowser[0]) validateAndSubmit();
    if (e.key === 'Escape') {
      if (showBrowser[0]) { showBrowser[1](false); }
      else { activeModal.value = null; }
    }
  }

  // Auto-focus name field
  preactHooks.useEffect(function() {
    if (nameRef.current) nameRef.current.focus();
  }, []);

  return html\`
    <div class="modal-box" onKeyDown=\${onKeyDown}>
      <h3>New Terminal</h3>
      <div class="modal-field"><label>Name</label><input type="text" ref=\${nameRef} placeholder="my-session" /></div>
      <div class="modal-field"><label>Command</label><input type="text" ref=\${commandRef} placeholder="default shell" /></div>
      <div class="modal-field">
        <label>Working Directory</label>
        <div class="cwd-input-row">
          <input type="text" ref=\${cwdRef} placeholder="current directory" onInput=\${function() { cwdError[1](''); }} />
          <button class="cwd-browse-btn" onClick=\${openBrowser} title="Browse folders">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A.5.5 0 0 0 8.914 4H13.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/></svg>
          </button>
        </div>
        \${cwdError[0] ? html\`<div class="cwd-error">\${cwdError[0]}</div>\` : null}
      </div>
      \${showBrowser[0] ? html\`
        <div class="folder-browser">
          <div class="folder-browser-path">
            <span class="folder-browser-current" title=\${browserPath[0]}>\${browserPath[0]}</span>
          </div>
          <div class="folder-browser-list">
            \${browserPath[0] !== '/' ? html\`
              <div class="folder-browser-item folder-browser-parent" onClick=\${function() {
                var parts = browserPath[0].split('/');
                parts.pop();
                browseTo(parts.join('/') || '/');
              }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A.5.5 0 0 0 8.914 4H13.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/></svg>
                ..
              </div>
            \` : null}
            \${browserLoading[0] ? html\`<div class="folder-browser-loading">Loading...</div>\` : null}
            \${!browserLoading[0] && browserDirs[0].length === 0 ? html\`<div class="folder-browser-empty">No subdirectories</div>\` : null}
            \${!browserLoading[0] ? browserDirs[0].map(function(dir) {
              return html\`
                <div class="folder-browser-item" onClick=\${function() { selectDir(dir); }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A.5.5 0 0 0 8.914 4H13.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/></svg>
                  \${dir}
                </div>
              \`;
            }) : null}
          </div>
          <div class="folder-browser-actions">
            <button class="modal-cancel" onClick=\${function() { showBrowser[1](false); }}>Cancel</button>
            <button class="modal-create" onClick=\${confirmBrowse}>Select</button>
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
