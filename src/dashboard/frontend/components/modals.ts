export const MODALS_JS = `
function NewTerminalModal() {
  var nameRef = preact.createRef();
  var commandRef = preact.createRef();
  var cwdRef = preact.createRef();

  function onSubmit() {
    var body = {};
    var name = nameRef.current.value.trim();
    var command = commandRef.current.value.trim();
    var cwd = cwdRef.current.value.trim();
    if (name) body.name = name;
    if (command) body.command = command;
    if (cwd) body.cwd = cwd;
    createTerminal(body);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') onSubmit();
    if (e.key === 'Escape') activeModal.value = null;
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
      <div class="modal-field"><label>Working Directory</label><input type="text" ref=\${cwdRef} placeholder="current directory" /></div>
      <div class="modal-actions">
        <button class="modal-cancel" onClick=\${function() { activeModal.value = null; }}>Cancel</button>
        <button class="modal-create" onClick=\${onSubmit}>Create</button>
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
          deleteChat(props.chatId);
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
  else if (modal.type === 'deleteChat') content = html\`<\${DeleteChatModal} chatId=\${modal.chatId} />\`;
  else return null;

  return html\`<div class="modal-overlay" onClick=\${onOverlayClick}>\${content}</div>\`;
}
`;
