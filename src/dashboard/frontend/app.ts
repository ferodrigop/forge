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

function App() {
  return html\`
    <\${Sidebar} />
    <\${MainArea} />
    <\${ModalOverlay} />
  \`;
}

// Keyboard shortcut: Escape closes modals globally
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && activeModal.value) activeModal.value = null;
});

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
