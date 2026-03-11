import { UTILS_JS } from "./utils.js";
import { STATE_JS } from "./state.js";
import { SIDEBAR_JS } from "./components/sidebar.js";
import { TERMINAL_VIEW_JS } from "./components/terminal-view.js";
import { CHAT_VIEW_JS } from "./components/chat-view.js";
import { MODALS_JS } from "./components/modals.js";

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
  if (activeSessionId.value) return html\`<\${TerminalView} />\`;
  return html\`<\${EmptyState} />\`;
}

var isDesktop = !!(window.forgeDesktop && window.forgeDesktop.isDesktop);

function MainContent() {
  return html\`
    <div style="display:flex;flex-direction:column;flex:1;min-width:0">
      \${isDesktop ? html\`<div id="main-titlebar"></div>\` : null}
      <\${MainArea} />
    </div>
  \`;
}

function TopBar() {
  return html\`
    <div id="topbar">
      <button
        class="topbar-toggle"
        title=\${sidebarCollapsed.value ? 'Show sidebar (⌘B)' : 'Hide sidebar (⌘B)'}
        onClick=\${function() { sidebarCollapsed.value = !sidebarCollapsed.value; }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="1" y="2" width="14" height="12" rx="2" />
          <line x1="5.5" y1="2" x2="5.5" y2="14" />
        </svg>
      </button>
      <img class="topbar-logo" src="/logo.png" alt="Forge" />
      <span class="topbar-title">Forge</span>
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

function App() {
  return html\`
    <div id="app-layout">
      <\${TopBar} />
      <div id="app-body">
        \${!sidebarCollapsed.value ? html\`<\${Sidebar} />\` : null}
        <\${MainContent} />
      </div>
    </div>
    <\${ModalOverlay} />
  \`;
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && activeModal.value) activeModal.value = null;
  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
    e.preventDefault();
    sidebarCollapsed.value = !sidebarCollapsed.value;
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
${TERMINAL_VIEW_JS}
${CHAT_VIEW_JS}
${MODALS_JS}

// --- App ---
${APP_COMPONENT_JS}
})();
`;
