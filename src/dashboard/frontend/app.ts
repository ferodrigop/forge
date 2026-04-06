import { UTILS_JS } from "./utils.js";
import { STATE_JS } from "./state.js";
import { SIDEBAR_JS } from "./components/sidebar.js";
import { TERMINAL_VIEW_JS } from "./components/terminal-view.js";
import { CHAT_VIEW_JS } from "./components/chat-view.js";
import { MODALS_JS } from "./components/modals.js";
import { CODE_REVIEW_JS } from "./components/code-review.js";
import { SPLIT_PANE_JS } from "./components/split-pane.js";

const APP_COMPONENT_JS = `
function EmptyState() {
  return html\`
    <div id="main">
      <div id="empty-state">
        <div>No session selected</div>
        <div class="hint">Create a terminal via MCP to get started</div>
      </div>
    </div>
  \`;
}

function MainArea() {
  if (activeChatId.value) return html\`<\${ChatView} />\`;
  if (activeSessionId.value || _leafCount(splitRoot.value) > 1) return html\`<\${TerminalView} />\`;
  return html\`<\${EmptyState} />\`;
}

var isDesktop = !!(window.forgeDesktop && window.forgeDesktop.isDesktop);

function MainContent() {
  return html\`
    <main id="main-content" style="display:flex;flex-direction:column;flex:1;min-width:0">
      \${isDesktop ? html\`<div id="main-titlebar"></div>\` : null}
      <\${MainArea} />
    </main>
  \`;
}

function TopBar() {
  return html\`
    <header id="topbar" role="banner">
      <button
        class="topbar-toggle"
        aria-label=\${sidebarCollapsed.value ? 'Show sidebar' : 'Hide sidebar'}
        title=\${sidebarCollapsed.value ? 'Show sidebar (⌘B)' : 'Hide sidebar (⌘B)'}
        aria-expanded=\${!sidebarCollapsed.value}
        aria-controls="sidebar"
        onClick=\${function() { sidebarCollapsed.value = !sidebarCollapsed.value; }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
          <rect x="1" y="2" width="14" height="12" rx="2" />
          <line x1="5.5" y1="2" x2="5.5" y2="14" />
        </svg>
      </button>
      <img class="topbar-logo" src="/logo.png" alt="" />
      <span class="topbar-title">Forge</span>
      <button
        id="new-terminal-btn"
        aria-label="New terminal"
        title="New terminal"
        class=\${currentTab.value !== 'terminals' ? 'hidden' : ''}
        onClick=\${function() { activeModal.value = { type: 'newTerminal' }; }}
      >+</button>
      <button
        id="auto-follow-btn"
        class=\${(autoFollow.value ? 'active' : '') + (currentTab.value !== 'terminals' ? ' hidden' : '')}
        title="Auto-follow new sessions"
        aria-label="Auto-follow new sessions"
        aria-pressed=\${autoFollow.value}
        onClick=\${function() { autoFollow.value = !autoFollow.value; }}
      >Follow</button>
      <button
        class=\${'topbar-toggle' + (currentTab.value !== 'terminals' ? ' hidden' : '')}
        aria-label="Broadcast input to multiple terminals"
        title="Broadcast input"
        onClick=\${function() { activeModal.value = { type: 'broadcast' }; }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="2" />
          <path d="M4.5 4.5a5 5 0 0 0 0 7" />
          <path d="M11.5 4.5a5 5 0 0 1 0 7" />
          <path d="M2.5 2.5a8 8 0 0 0 0 11" />
          <path d="M13.5 2.5a8 8 0 0 1 0 11" />
        </svg>
      </button>
      <span class="spacer"></span>
      <button
        class="topbar-toggle"
        aria-label="Settings"
        title="Settings"
        onClick=\${function() { activeModal.value = { type: 'settings' }; }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1.5v1.2M8 13.3v1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M1.5 8h1.2M13.3 8h1.2M3.4 12.6l.85-.85M11.75 4.25l.85-.85" />
        </svg>
      </button>
      \${activeSessionId.value ? html\`
        <button
          class=\${'topbar-toggle topbar-toggle-right' + (codeReviewOpen.value ? ' active' : '')}
          aria-label=\${codeReviewOpen.value ? 'Hide changes panel' : 'Show changes panel'}
          title=\${codeReviewOpen.value ? 'Hide changes (⌘⇧B)' : 'Show changes (⌘⇧B)'}
          aria-expanded=\${codeReviewOpen.value}
          onClick=\${function() { codeReviewOpen.value = !codeReviewOpen.value; }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <rect x="1" y="2" width="14" height="12" rx="2" />
            <line x1="10.5" y1="2" x2="10.5" y2="14" />
          </svg>
        </button>
      \` : null}
    </header>
  \`;
}

function FloatingAttentionIndicator() {
  var blockedSessions = sessions.value.filter(function(s) {
    return s.claudeState === 'blocked' && s.status === 'running' && s.id !== activeSessionId.value;
  });
  if (blockedSessions.length === 0) return null;

  var first = blockedSessions[0];
  var label = first.name || first.command || first.id;
  if (label.length > 24) label = label.slice(0, 22) + '...';

  function onClick() {
    currentTab.value = 'terminals';
    selectSession(first.id);
  }

  return html\`
    <button class="floating-attention" onClick=\${onClick} title=\${'Go to: ' + (first.name || first.command || first.id)} aria-label=\${blockedSessions.length + ' session' + (blockedSessions.length !== 1 ? 's' : '') + ' need attention. Go to ' + label}>
      <span class="floating-attention-icon" aria-hidden="true">!</span>
      <span>\${label}</span>
      \${blockedSessions.length > 1
        ? html\`<span class="floating-attention-count" aria-hidden="true">\${blockedSessions.length}</span>\`
        : null}
    </button>
  \`;
}

function App() {
  return html\`
    <div id="app-layout">
      <a class="skip-link" href="#main-content">Skip to main content</a>
      <\${TopBar} />
      <div id="app-body">
        \${!sidebarCollapsed.value ? html\`<\${Sidebar} />\` : null}
        <\${MainContent} />
      </div>
    </div>
    <\${ModalOverlay} />
    <\${FloatingAttentionIndicator} />
    <div id="aria-live" class="aria-live-region" aria-live="polite" aria-atomic="true"></div>
  \`;
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && activeModal.value) activeModal.value = null;
  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
    e.preventDefault();
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'b') {
    e.preventDefault();
    codeReviewOpen.value = !codeReviewOpen.value;
  }
  // Split pane shortcuts
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'Backslash') {
    e.preventDefault();
    splitPane('horizontal');
  }
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Backslash') {
    e.preventDefault();
    splitPane('vertical');
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
    if (_leafCount(splitRoot.value) > 1) {
      e.preventDefault();
      closePane(focusedPaneId.value);
    }
  }
  if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'ArrowRight') {
    e.preventDefault();
    cycleFocus('next');
  }
  if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    cycleFocus('prev');
  }
});

// Detect desktop app and set traffic light clearance
if (window.forgeDesktop && window.forgeDesktop.isDesktop) {
  document.body.classList.add('forge-desktop');
  if (window.forgeDesktop.trafficLightClearance) {
    document.documentElement.style.setProperty(
      '--traffic-light-clearance',
      window.forgeDesktop.trafficLightClearance + 'px'
    );
  }
}

// Mount
preact.render(html\`<\${App} />\`, document.getElementById('app'));

// Connect WebSocket
connect();
`;

export const APP_JS = `
(function() {
// --- Preact/htm/signals from UMD globals ---
var html = htmPreact.html;
var signal = preactSignals.signal;
var computed = preactSignals.computed;
var effect = preactSignals.effect;
var batch = preactSignals.batch;

// --- Utils ---
${UTILS_JS}

// --- State ---
${STATE_JS}

// --- Components ---
${SIDEBAR_JS}
${SPLIT_PANE_JS}
${TERMINAL_VIEW_JS}
${CHAT_VIEW_JS}
${MODALS_JS}
${CODE_REVIEW_JS}

// --- App ---
${APP_COMPONENT_JS}
})();
`;
