export const CODE_REVIEW_JS = `
function CodeReviewPanel() {
  var activeSession = sessions.value.find(function(s) { return s.id === activeSessionId.value; });
  var cwd = activeSession ? activeSession.cwd : '';
  if (!cwd) return html\`<div class="cr-panel"><div class="cr-empty">No working directory</div></div>\`;

  var status = preactHooks.useState(null);
  var loading = preactHooks.useState(false);
  var error = preactHooks.useState('');
  var filter = preactHooks.useState('all'); // 'all', 'staged', 'unstaged'
  var expandedFiles = preactHooks.useState({});
  var fileDiffs = preactHooks.useState({});
  var commitMsg = preactHooks.useState('');
  var committing = preactHooks.useState(false);
  var commitResult = preactHooks.useState(null);
  var stashLoading = preactHooks.useState(false);
  var refreshing = preactHooks.useState(false);

  function fetchStatus() {
    loading[1](true);
    refreshing[1](true);
    error[1]('');
    fetch(apiBase + '/api/git-status?cwd=' + encodeURIComponent(cwd), { headers: authHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) { error[1](data.error); status[1](null); }
        else { status[1](data); }
        loading[1](false);
        setTimeout(function() { refreshing[1](false); }, 500);
      })
      .catch(function(e) { error[1](e.message || 'Failed to load'); loading[1](false); refreshing[1](false); });
  }

  function fetchDiff(filePath, staged, isUntracked) {
    var key = filePath + (staged ? ':staged' : ':unstaged');
    var url = apiBase + '/api/git-diff?cwd=' + encodeURIComponent(cwd) + '&file=' + encodeURIComponent(filePath) + '&staged=' + (staged ? 'true' : 'false');
    if (isUntracked) url += '&untracked=true';
    fetch(url, { headers: authHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var d = Object.assign({}, fileDiffs[0]);
        d[key] = data.diff || '(no changes)';
        fileDiffs[1](d);
      });
  }

  function toggleFile(filePath, staged, isUntracked) {
    var key = filePath + (staged ? ':staged' : ':unstaged');
    var exp = Object.assign({}, expandedFiles[0]);
    if (exp[key]) {
      delete exp[key];
    } else {
      exp[key] = true;
      if (!fileDiffs[0][key]) fetchDiff(filePath, staged, isUntracked);
    }
    expandedFiles[1](exp);
  }

  function stageFile(filePath) {
    fetch(apiBase + '/api/git-stage', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ cwd: cwd, files: [filePath], action: 'stage' })
    }).then(function() { fetchStatus(); });
  }

  function unstageFile(filePath) {
    fetch(apiBase + '/api/git-stage', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ cwd: cwd, files: [filePath], action: 'unstage' })
    }).then(function() { fetchStatus(); fileDiffs[1]({}); expandedFiles[1]({}); });
  }

  function discardFile(filePath) {
    if (!confirm('Discard all changes to ' + filePath + '? This cannot be undone.')) return;
    fetch(apiBase + '/api/git-discard', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ cwd: cwd, files: [filePath] })
    }).then(function() { fetchStatus(); fileDiffs[1]({}); expandedFiles[1]({}); });
  }

  function doCommit() {
    var msg = commitMsg[0].trim();
    if (!msg) return;
    committing[1](true);
    commitResult[1](null);
    fetch(apiBase + '/api/git-commit', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ cwd: cwd, message: msg })
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        committing[1](false);
        if (data.error) { commitResult[1]({ error: data.error }); }
        else { commitResult[1]({ ok: true, hash: data.hash }); commitMsg[1](''); fetchStatus(); fileDiffs[1]({}); expandedFiles[1]({}); }
      })
      .catch(function(e) { committing[1](false); commitResult[1]({ error: e.message }); });
  }

  function doStash(action) {
    stashLoading[1](true);
    fetch(apiBase + '/api/git-stash', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ cwd: cwd, action: action })
    })
      .then(function(r) { return r.json(); })
      .then(function() { stashLoading[1](false); fetchStatus(); fileDiffs[1]({}); expandedFiles[1]({}); })
      .catch(function() { stashLoading[1](false); });
  }

  function stageAll() {
    var files = (status[0].files || []).filter(function(f) { return !f.staged; }).map(function(f) { return f.path; });
    if (files.length === 0) return;
    fetch(apiBase + '/api/git-stage', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ cwd: cwd, files: files, action: 'stage' })
    }).then(function() { fetchStatus(); });
  }

  function unstageAll() {
    var files = (status[0].files || []).filter(function(f) { return f.staged; }).map(function(f) { return f.path; });
    if (files.length === 0) return;
    fetch(apiBase + '/api/git-stage', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ cwd: cwd, files: files, action: 'unstage' })
    }).then(function() { fetchStatus(); fileDiffs[1]({}); expandedFiles[1]({}); });
  }

  // Load on mount and when session changes
  preactHooks.useEffect(function() {
    if (cwd) fetchStatus();
  }, [activeSessionId.value]);

  if (loading[0] && !status[0]) return html\`<div class="cr-panel"><div class="cr-loading">Loading git status...</div></div>\`;
  if (error[0]) return html\`<div class="cr-panel"><div class="cr-error">\${error[0]}</div><button class="cr-retry" onClick=\${fetchStatus}>Retry</button></div>\`;
  if (!status[0]) return html\`<div class="cr-panel"><div class="cr-empty">Not a git repository</div></div>\`;

  var st = status[0];
  var stagedFiles = st.files.filter(function(f) { return f.staged; });
  var unstagedFiles = st.files.filter(function(f) { return !f.staged; });

  var filteredFiles = st.files;
  if (filter[0] === 'staged') filteredFiles = stagedFiles;
  else if (filter[0] === 'unstaged') filteredFiles = unstagedFiles;

  // Status label map
  var statusLabels = { modified: 'M', added: 'A', deleted: 'D', renamed: 'R', copied: 'C', untracked: '?' };
  var statusColors = { modified: '#e0af68', added: '#9ece6a', deleted: '#f7768e', renamed: '#7dcfff', copied: '#7dcfff', untracked: '#565f89' };

  function renderFileRow(f) {
    var isStaged = f.staged;
    var isUntracked = f.status === 'untracked';
    var key = f.path + (isStaged ? ':staged' : ':unstaged');
    var isExpanded = expandedFiles[0][key];
    var diffText = fileDiffs[0][key];
    var label = statusLabels[f.status] || '?';
    var color = statusColors[f.status] || '#565f89';

    return html\`
      <div class="cr-file" key=\${key}>
        <div class="cr-file-header" onClick=\${function() { toggleFile(f.path, isStaged, isUntracked); }}>
          <span class="cr-file-chevron">\${isExpanded ? '\\u25BC' : '\\u25B6'}</span>
          <span class="cr-file-status" style=\${'color:' + color}>\${label}</span>
          <span class="cr-file-path">\${f.oldPath ? f.oldPath + ' \\u2192 ' : ''}\${f.path}</span>
          \${isUntracked ? html\`<span class="cr-new-badge">New</span>\` : null}
          \${f.status === 'deleted' ? html\`<span class="cr-del-badge">Deleted</span>\` : null}
          \${f.status === 'renamed' ? html\`<span class="cr-rename-badge">Renamed</span>\` : null}
          <span class="cr-file-spacer"></span>
          \${isStaged
            ? html\`<button class="cr-btn cr-btn-unstage" onClick=\${function(e) { e.stopPropagation(); unstageFile(f.path); }} title="Unstage">-</button>\`
            : html\`
                <button class="cr-btn cr-btn-stage" onClick=\${function(e) { e.stopPropagation(); stageFile(f.path); }} title="Stage">+</button>
                <button class="cr-btn cr-btn-discard" onClick=\${function(e) { e.stopPropagation(); discardFile(f.path); }} title="Discard">\u2717</button>
              \`
          }
        </div>
        \${isExpanded ? html\`
          <div class="cr-diff">
            \${diffText ? html\`<div class="cr-diff-inner">\${renderDiff(diffText)}</div>\` : html\`<div class="cr-diff-loading">Loading diff...</div>\`}
          </div>
        \` : null}
      </div>
    \`;
  }

  return html\`
    <div class="cr-panel">
      <div class="cr-header">
        <span class="cr-title">Code Review</span>
        <button class="cr-close" onClick=\${function() { codeReviewOpen.value = false; }} title="Close">\u2715</button>
      </div>

      <div class="cr-branch-bar">
        <svg class="cr-branch-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/></svg>
        <span class="cr-branch-name">\${st.branch || 'detached'}</span>
        \${st.ahead > 0 ? html\`<span class="cr-ahead" title=\${st.ahead + ' ahead'}>\\u2191\${st.ahead}</span>\` : null}
        \${st.behind > 0 ? html\`<span class="cr-behind" title=\${st.behind + ' behind'}>\\u2193\${st.behind}</span>\` : null}
        <span class="cr-stats">\${st.files.length} file\${st.files.length !== 1 ? 's' : ''}</span>
        <button class="cr-btn cr-btn-refresh" onClick=\${fetchStatus} title="Refresh"><span class=\${refreshing[0] ? 'cr-spin' : ''}>\\u21BB</span></button>
      </div>

      <div class="cr-filter-bar">
        <button class=\${'cr-filter-btn' + (filter[0] === 'all' ? ' active' : '')} onClick=\${function() { filter[1]('all'); }}>All (\${st.files.length})</button>
        <button class=\${'cr-filter-btn' + (filter[0] === 'staged' ? ' active' : '')} onClick=\${function() { filter[1]('staged'); }}>Staged (\${stagedFiles.length})</button>
        <button class=\${'cr-filter-btn' + (filter[0] === 'unstaged' ? ' active' : '')} onClick=\${function() { filter[1]('unstaged'); }}>Unstaged (\${unstagedFiles.length})</button>
        <span class="cr-filter-spacer"></span>
        <button class="cr-btn cr-btn-stage-all" onClick=\${stageAll} title="Stage all">+ All</button>
        <button class="cr-btn cr-btn-unstage-all" onClick=\${unstageAll} title="Unstage all">- All</button>
      </div>

      <div class="cr-file-list">
        \${filteredFiles.length === 0
          ? html\`<div class="cr-empty-files">No changes\${filter[0] !== 'all' ? ' (' + filter[0] + ')' : ''}</div>\`
          : filteredFiles.map(renderFileRow)
        }
      </div>

      <div class="cr-commit-section">
        <textarea
          class="cr-commit-input"
          placeholder="Commit message..."
          value=\${commitMsg[0]}
          onInput=\${function(e) { commitMsg[1](e.target.value); }}
          rows="3"
        ></textarea>
        <div class="cr-commit-actions">
          <span class="cr-commit-staged">\${stagedFiles.length} staged</span>
          <button class="cr-btn cr-btn-commit" disabled=\${committing[0] || !commitMsg[0].trim() || stagedFiles.length === 0} onClick=\${doCommit}>
            \${committing[0] ? 'Committing...' : 'Commit'}
          </button>
        </div>
        \${commitResult[0] ? html\`
          <div class=\${'cr-commit-result ' + (commitResult[0].error ? 'error' : 'success')}>
            \${commitResult[0].error ? commitResult[0].error : 'Committed ' + commitResult[0].hash}
          </div>
        \` : null}
      </div>

      <div class="cr-stash-bar">
        <button class="cr-btn cr-btn-stash" disabled=\${stashLoading[0]} onClick=\${function() { doStash('push'); }}>Stash</button>
        <button class="cr-btn cr-btn-stash" disabled=\${stashLoading[0]} onClick=\${function() { doStash('pop'); }}>Pop</button>
      </div>
    </div>
  \`;
}

function renderDiff(text) {
  var lines = text.split('\\n');
  var result = [];
  var lineNumOld = 0;
  var lineNumNew = 0;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var cls = 'cr-diff-line';
    var numOld = '';
    var numNew = '';

    if (line.indexOf('@@') === 0) {
      // Parse hunk header
      var match = line.match(/@@ -(\\d+)/);
      if (match) lineNumOld = parseInt(match[1], 10);
      var match2 = line.match(/\\+(\\d+)/);
      if (match2) lineNumNew = parseInt(match2[1], 10);
      cls += ' cr-diff-hunk';
      result.push(html\`<div class=\${cls} key=\${i}><span class="cr-diff-num"></span><span class="cr-diff-num"></span><span class="cr-diff-content">\${line}</span></div>\`);
      continue;
    }

    if (line.indexOf('diff ') === 0 || line.indexOf('index ') === 0 || line.indexOf('---') === 0 || line.indexOf('+++') === 0) {
      continue; // skip meta lines
    }

    if (line.indexOf('+') === 0) {
      cls += ' cr-diff-added';
      numNew = lineNumNew++;
      result.push(html\`<div class=\${cls} key=\${i}><span class="cr-diff-num"></span><span class="cr-diff-num">\${numNew}</span><span class="cr-diff-content">\${line}</span></div>\`);
      continue;
    }

    if (line.indexOf('-') === 0) {
      cls += ' cr-diff-removed';
      numOld = lineNumOld++;
      result.push(html\`<div class=\${cls} key=\${i}><span class="cr-diff-num">\${numOld}</span><span class="cr-diff-num"></span><span class="cr-diff-content">\${line}</span></div>\`);
      continue;
    }

    // Context line
    if (line.length > 0) {
      numOld = lineNumOld++;
      numNew = lineNumNew++;
    }
    result.push(html\`<div class=\${cls} key=\${i}><span class="cr-diff-num">\${numOld}</span><span class="cr-diff-num">\${numNew}</span><span class="cr-diff-content">\${line.indexOf(' ') === 0 ? line.slice(1) : line}</span></div>\`);
  }

  return result;
}
`;
