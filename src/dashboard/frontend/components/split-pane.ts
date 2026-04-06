export const SPLIT_PANE_JS = `
function PaneTerminal(props) {
  var paneId = props.paneId;
  var sessionId = props.sessionId;
  var containerRef = preactHooks.useRef(null);
  var termRef = preactHooks.useRef(null);
  var fitRef = preactHooks.useRef(null);
  var roRef = preactHooks.useRef(null);
  var subRef = preactHooks.useRef(null);

  function cleanupTerm() {
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }
    fitRef.current = null;
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    unregisterPaneTerminal(paneId);
    if (subRef.current) {
      wsSend({ type: 'unsubscribe', sessionId: subRef.current });
      subRef.current = null;
    }
  }

  preactHooks.useEffect(function() {
    var container = containerRef.current;
    if (!container || !sessionId) {
      cleanupTerm();
      return cleanupTerm;
    }

    cleanupTerm();

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
      scrollback: 10000,
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

    termRef.current = term;
    fitRef.current = fa;
    roRef.current = ro;
    registerPaneTerminal(paneId, term, fa, sessionId);

    if (focusedPaneId.value === paneId) {
      termInstance.value = term;
      fitAddonInstance.value = fa;
      term.focus();
      fa.fit();
    }

    // macOS keybindings
    term.attachCustomKeyEventHandler(function(ev) {
      if (ev.type !== 'keydown') return true;
      if (ev.metaKey) {
        if (ev.key === 'ArrowLeft') { wsSend({ type: 'input', sessionId: sessionId, data: '\\x01' }); return false; }
        if (ev.key === 'ArrowRight') { wsSend({ type: 'input', sessionId: sessionId, data: '\\x05' }); return false; }
        if (ev.key === 'Backspace') { wsSend({ type: 'input', sessionId: sessionId, data: '\\x15' }); return false; }
        if (ev.key === 'ArrowUp') { wsSend({ type: 'input', sessionId: sessionId, data: '\\x1b[1;5A' }); return false; }
        if (ev.key === 'ArrowDown') { wsSend({ type: 'input', sessionId: sessionId, data: '\\x1b[1;5B' }); return false; }
      }
      return true;
    });

    term.onData(function(data) { wsSend({ type: 'input', sessionId: sessionId, data: data }); });
    term.onResize(function(size) { wsSend({ type: 'resize', sessionId: sessionId, cols: size.cols, rows: size.rows }); });
    term.onTitleChange(function(title) {
      if (focusedPaneId.value === paneId) termTitle.value = title || '';
    });

    setTimeout(function() {
      if (fa) { try { fa.fit(); } catch(e) {} }
      wsSend({ type: 'subscribe', sessionId: sessionId });
      subRef.current = sessionId;
      var s = sessions.value.find(function(ss) { return ss.id === sessionId; });
      if (s && s.tags && (s.tags.indexOf('claude-agent') >= 0 || s.tags.indexOf('codex-agent') >= 0 || s.tags.indexOf('gemini-agent') >= 0)) {
        wsSend({ type: 'get_history', sessionId: sessionId });
      }
    }, 0);

    return cleanupTerm;
  }, [sessionId]);

  function handleClick() {
    if (focusedPaneId.value !== paneId) focusPane(paneId);
  }

  var dropZoneState = preactHooks.useState(null); // 'left'|'right'|'top'|'bottom'|null
  var dropZone = dropZoneState[0];
  var setDropZone = dropZoneState[1];

  function getDropZone(e, el) {
    var rect = el.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width;
    var y = (e.clientY - rect.top) / rect.height;
    var dLeft = x, dRight = 1 - x, dTop = y, dBottom = 1 - y;
    var min = Math.min(dLeft, dRight, dTop, dBottom);
    if (min === dLeft) return 'left';
    if (min === dRight) return 'right';
    if (min === dTop) return 'top';
    return 'bottom';
  }

  function onPaneDragOver(e) {
    if (!dragState.value || dragState.value.type !== 'session') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropZone(getDropZone(e, e.currentTarget));
  }

  function onPaneDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDropZone(null);
  }

  function onPaneDrop(e) {
    e.preventDefault();
    var zone = dropZone;
    setDropZone(null);
    if (!zone) return;
    if (!dragState.value || dragState.value.type !== 'session') return;
    var draggedId = dragState.value.id;
    dragState.value = null;
    if (draggedId === sessionId) return;
    var dir = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical';
    var pos = (zone === 'left' || zone === 'top') ? 'before' : 'after';
    var newPaneId = splitPane(dir, paneId, pos);
    if (newPaneId) {
      setPaneSession(newPaneId, draggedId);
      focusPane(newPaneId);
    }
  }

  var overlayStyle = '';
  if (dropZone) {
    var styles = { left: 'right:50%;bottom:0', right: 'left:50%;bottom:0', top: 'bottom:50%;right:0', bottom: 'top:50%;right:0' };
    overlayStyle = 'position:absolute;top:0;left:0;' + styles[dropZone] + ';pointer-events:none;z-index:20;';
  }

  preactHooks.useEffect(function() {
    function onGlobalDragEnd() { setDropZone(null); }
    document.addEventListener('dragend', onGlobalDragEnd);
    return function() { document.removeEventListener('dragend', onGlobalDragEnd); };
  }, []);

  return html\`<div class="pane-terminal-wrap" onClick=\${handleClick} onDragOver=\${onPaneDragOver} onDragLeave=\${onPaneDragLeave} onDrop=\${onPaneDrop} style="position:relative">
    <div class="pane-terminal-xterm" ref=\${containerRef}></div>
    \${dropZone ? html\`<div class="pane-drop-overlay pane-drop-\${dropZone}" style=\${overlayStyle}></div>\` : null}
  </div>\`;
}

function PaneEmptyState(props) {
  var paneId = props.paneId;
  var isDragOver = preactHooks.useState(false);
  var dragOver = isDragOver[0];
  var setDragOver = isDragOver[1];

  function onEmptyDragOver(e) {
    if (!dragState.value || dragState.value.type !== 'session') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  }
  function onEmptyDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
  }
  function onEmptyDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (!dragState.value || dragState.value.type !== 'session') return;
    var draggedId = dragState.value.id;
    dragState.value = null;
    setPaneSession(paneId, draggedId);
    focusPane(paneId);
  }

  return html\`<div class=\${'pane-empty' + (dragOver ? ' pane-empty-dragover' : '')} role="region" aria-label="Empty pane" onDragOver=\${onEmptyDragOver} onDragLeave=\${onEmptyDragLeave} onDrop=\${onEmptyDrop}>
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#292e42" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
      <line x1="9" y1="3" x2="9" y2="21"/>
    </svg>
    <div class="pane-empty-text">\${dragOver ? 'Drop to open here' : 'Select a session'}</div>
    <div class="pane-empty-hint">\${dragOver ? '' : 'Click a terminal in the sidebar'}</div>
  </div>\`;
}

function PaneTabBar(props) {
  var paneId = props.paneId;
  var sessionId = props.sessionId;
  var isFocused = focusedPaneId.value === paneId;

  var label = '';
  if (sessionId) {
    var s = sessions.value.find(function(ss) { return ss.id === sessionId; });
    label = s ? (s.name || s.id) : sessionId;
  }

  return html\`<div class=\${'pane-tab-bar' + (isFocused ? ' pane-tab-focused' : '')} role="toolbar" aria-label=\${'Pane: ' + (label || 'Empty')} onClick=\${function() { focusPane(paneId); }}>
    <span class="pane-tab-label" title=\${label || 'Empty'}>\${label || 'Empty'}</span>
    <div class="pane-tab-actions">
      <button class="pane-tab-btn" aria-label="Split right" title="Split right" onClick=\${function(e) { e.stopPropagation(); focusPane(paneId); splitPane('horizontal'); }}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="1.5"/><line x1="6" y1="1" x2="6" y2="11"/></svg>
      </button>
      <button class="pane-tab-btn" aria-label="Split down" title="Split down" onClick=\${function(e) { e.stopPropagation(); focusPane(paneId); splitPane('vertical'); }}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="1.5"/><line x1="1" y1="6" x2="11" y2="6"/></svg>
      </button>
      <button class="pane-tab-btn pane-tab-close" aria-label="Close pane" title="Close pane" onClick=\${function(e) { e.stopPropagation(); closePane(paneId); }}>\u00d7</button>
    </div>
  </div>\`;
}

function SplitDivider(props) {
  var dir = props.direction;
  var splitId = props.splitId;
  var idx = props.index;
  var isH = dir === 'horizontal';

  function onMouseDown(e) {
    e.preventDefault();
    var divider = e.currentTarget;
    var parent = divider.parentElement;
    var startPos = isH ? e.clientX : e.clientY;

    var paneEls = [];
    for (var i = 0; i < parent.children.length; i++) {
      if (!parent.children[i].classList.contains('split-divider')) paneEls.push(parent.children[i]);
    }
    var prevEl = paneEls[idx - 1];
    var nextEl = paneEls[idx];
    if (!prevEl || !nextEl) return;

    var prevStart = isH ? prevEl.offsetWidth : prevEl.offsetHeight;
    var nextStart = isH ? nextEl.offsetWidth : nextEl.offsetHeight;

    divider.classList.add('dragging');
    document.body.style.cursor = isH ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev) {
      var delta = (isH ? ev.clientX : ev.clientY) - startPos;
      var newPrev = Math.max(80, prevStart + delta);
      var newNext = Math.max(80, nextStart - delta);
      prevEl.style.flex = newPrev + ' 0 0';
      nextEl.style.flex = newNext + ' 0 0';
      var keys = Object.keys(paneTerminals);
      for (var k = 0; k < keys.length; k++) {
        var pt = paneTerminals[keys[k]];
        if (pt && pt.fitAddon) try { pt.fitAddon.fit(); } catch(ex) {}
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onUp);
      divider.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      var pEls = [];
      for (var i = 0; i < parent.children.length; i++) {
        if (!parent.children[i].classList.contains('split-divider')) pEls.push(parent.children[i]);
      }
      var total = 0;
      var szs = [];
      for (var j = 0; j < pEls.length; j++) {
        var sz = isH ? pEls[j].offsetWidth : pEls[j].offsetHeight;
        szs.push(sz);
        total += sz;
      }
      updateSplitSizes(splitId, szs.map(function(s) { return (s / total) * 100; }));
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onUp);
  }

  function onKeyDown(e) {
    var step = e.shiftKey ? 50 : 10;
    var delta = 0;
    if (isH && e.key === 'ArrowRight') delta = step;
    else if (isH && e.key === 'ArrowLeft') delta = -step;
    else if (!isH && e.key === 'ArrowDown') delta = step;
    else if (!isH && e.key === 'ArrowUp') delta = -step;
    else return;
    e.preventDefault();

    var divider = e.currentTarget;
    var parent = divider.parentElement;
    var paneEls = [];
    for (var i = 0; i < parent.children.length; i++) {
      if (!parent.children[i].classList.contains('split-divider')) paneEls.push(parent.children[i]);
    }
    var prevEl = paneEls[idx - 1];
    var nextEl = paneEls[idx];
    if (!prevEl || !nextEl) return;
    var prevSize = isH ? prevEl.offsetWidth : prevEl.offsetHeight;
    var nextSize = isH ? nextEl.offsetWidth : nextEl.offsetHeight;
    var newPrev = Math.max(80, prevSize + delta);
    var newNext = Math.max(80, nextSize - delta);
    prevEl.style.flex = newPrev + ' 0 0';
    nextEl.style.flex = newNext + ' 0 0';

    var total = 0;
    var szs = [];
    for (var j = 0; j < paneEls.length; j++) {
      var sz = isH ? paneEls[j].offsetWidth : paneEls[j].offsetHeight;
      szs.push(sz);
      total += sz;
    }
    updateSplitSizes(splitId, szs.map(function(s) { return (s / total) * 100; }));
    var keys = Object.keys(paneTerminals);
    for (var k = 0; k < keys.length; k++) {
      var pt = paneTerminals[keys[k]];
      if (pt && pt.fitAddon) try { pt.fitAddon.fit(); } catch(ex) {}
    }
  }

  return html\`<div class=\${'split-divider' + (isH ? ' split-divider-h' : ' split-divider-v')} role="separator" aria-orientation=\${isH ? 'vertical' : 'horizontal'} aria-label=\${isH ? 'Resize panes horizontally' : 'Resize panes vertically'} tabindex="0" onMouseDown=\${onMouseDown} onKeyDown=\${onKeyDown}></div>\`;
}

function renderSplitNode(node) {
  if (node.type === 'leaf') {
    var isFocused = focusedPaneId.value === node.id;
    var showTab = _leafCount(splitRoot.value) > 1;
    return html\`<div class=\${'split-pane' + (isFocused ? ' split-pane-focused' : '')} style="flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden">
      \${showTab ? html\`<\${PaneTabBar} paneId=\${node.id} sessionId=\${node.sessionId} />\` : null}
      \${node.sessionId
        ? html\`<\${PaneTerminal} paneId=\${node.id} sessionId=\${node.sessionId} key=\${node.id + '-' + splitGeneration.value} />\`
        : html\`<\${PaneEmptyState} paneId=\${node.id} />\`}
    </div>\`;
  }

  var isH = node.direction === 'horizontal';
  var items = [];
  for (var i = 0; i < node.children.length; i++) {
    if (i > 0) {
      items.push(html\`<\${SplitDivider} direction=\${node.direction} splitId=\${node.id} index=\${i} key=\${'d-' + node.id + '-' + i} />\`);
    }
    items.push(html\`<div style=\${'flex:' + node.sizes[i] + ' 0 0;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden'} key=\${'c-' + i}>\${renderSplitNode(node.children[i])}</div>\`);
  }

  return html\`<div class="split-container" style=\${'display:flex;flex:1;min-height:0;min-width:0;overflow:hidden;' + (isH ? 'flex-direction:row' : 'flex-direction:column')}>\${items}</div>\`;
}

function SplitPaneLayout() {
  return html\`<div class="split-pane-layout">\${renderSplitNode(splitRoot.value)}</div>\`;
}
`;
