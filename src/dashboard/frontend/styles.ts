export const CSS_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
    background: #1a1b26;
    color: #a9b1d6;
    height: 100vh;
    display: flex;
    overflow: hidden;
  }

  #app { display: contents; }

  #sidebar {
    width: 260px;
    min-width: 260px;
    background: #16161e;
    border-right: 1px solid #292e42;
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  #sidebar-header {
    padding: 12px 16px;
    border-bottom: 1px solid #292e42;
    font-size: 14px;
    font-weight: 600;
    color: #7aa2f7;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  #sidebar-header .logo { width: 22px; height: 22px; border-radius: 4px; }
  #sidebar-header .spacer { flex: 1; }

  #auto-follow-btn {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid #292e42;
    background: transparent;
    color: #565f89;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  #auto-follow-btn.active { background: #1a3a2a; border-color: #9ece6a; color: #9ece6a; }

  .tab-bar {
    display: flex;
    border-bottom: 1px solid #292e42;
    background: #16161e;
  }
  .tab-btn {
    flex: 1;
    padding: 8px 0;
    text-align: center;
    font-size: 12px;
    font-weight: 500;
    color: #565f89;
    cursor: pointer;
    border: none;
    background: transparent;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }
  .tab-btn:hover { color: #a9b1d6; }
  .tab-btn.active { color: #7aa2f7; border-bottom-color: #7aa2f7; }

  #terminals-panel, #chats-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  #session-list, #chat-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  #chat-search {
    margin: 8px;
    padding: 6px 10px;
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 4px;
    color: #c0caf5;
    font-size: 12px;
    outline: none;
    width: calc(100% - 16px);
  }
  #chat-search:focus { border-color: #7aa2f7; }
  #chat-search::placeholder { color: #3b4261; }

  .chat-source-toggle {
    display: flex;
    margin: 8px 8px 0;
    gap: 0;
    border: 1px solid #292e42;
    border-radius: 4px;
    overflow: hidden;
  }
  .chat-source-btn {
    flex: 1;
    padding: 4px 0;
    background: #1a1b26;
    border: none;
    color: #565f89;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .chat-source-btn:hover { background: #292e42; color: #c0caf5; }
  .chat-source-btn.active { background: #292e42; color: #7aa2f7; font-weight: 600; }

  .session-item {
    padding: 10px 12px;
    border-radius: 6px;
    cursor: pointer;
    margin-bottom: 4px;
    transition: background 0.15s;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .session-item:hover { background: #1a1b26; }
  .session-item.active { background: #292e42; }

  .session-item .status-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  }
  .session-item .status-dot.running { background: #9ece6a; box-shadow: 0 0 4px #9ece6a88; }
  .session-item .status-dot.exited { background: #565f89; }

  .session-item .blocked-icon {
    width: 18px; height: 18px; border-radius: 50%;
    background: #7aa2f7; color: #1a1b26;
    font-size: 12px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; cursor: default;
    animation: dot-pulse 2s ease-in-out infinite;
  }

  @keyframes dot-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .session-item .session-info { flex: 1; min-width: 0; }
  .session-item .session-cmd {
    font-size: 13px; font-weight: 500; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; color: #c0caf5;
    display: flex; align-items: center; gap: 6px;
  }
  .session-item .session-cmd .ram { font-size: 11px; color: #7dcfff; font-weight: 400; flex-shrink: 0; }
  .session-item .session-meta {
    font-size: 11px; color: #565f89; font-family: monospace;
    display: flex; align-items: center; gap: 6px;
  }

  .session-item .revive-btn {
    flex-shrink: 0; width: 20px; height: 20px; border-radius: 4px;
    border: none; background: transparent; color: #565f89;
    font-size: 14px; cursor: pointer; display: flex;
    align-items: center; justify-content: center; opacity: 0; transition: all 0.15s;
  }
  .session-item:hover .revive-btn { opacity: 1; }
  .session-item .revive-btn:hover { background: #9ece6a22; color: #9ece6a; }

  .session-item .close-btn {
    flex-shrink: 0; width: 20px; height: 20px; border-radius: 4px;
    border: none; background: transparent; color: #565f89;
    font-size: 14px; cursor: pointer; display: flex;
    align-items: center; justify-content: center; opacity: 0; transition: all 0.15s;
  }
  .session-item:hover .close-btn { opacity: 1; }
  .session-item .close-btn:hover { background: #f7768e22; color: #f7768e; }

  .chat-item {
    padding: 8px 12px; border-radius: 6px; cursor: pointer;
    margin-bottom: 4px; transition: background 0.15s;
  }
  .chat-item:hover { background: #1a1b26; }
  .chat-item.active { background: #292e42; }
  .chat-item .chat-msg {
    font-size: 12px; color: #c0caf5; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  .chat-item .chat-meta {
    font-size: 11px; color: #565f89; display: flex;
    align-items: center; gap: 6px; margin-top: 2px;
  }
  .chat-item .close-btn {
    float: right; width: 18px; height: 18px; border-radius: 4px;
    border: none; background: transparent; color: #565f89;
    font-size: 13px; cursor: pointer; opacity: 0; transition: all 0.15s;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .chat-item:hover .close-btn { opacity: 1; }
  .chat-item .close-btn:hover { background: #f7768e22; color: #f7768e; }

  .chat-project-group {
    font-size: 11px; font-weight: 600; color: #a9b1d6;
    padding: 8px 12px 6px; letter-spacing: 0.3px;
    display: flex; align-items: center; gap: 6px;
    cursor: pointer; user-select: none;
    border-bottom: 1px solid #292e42; margin-bottom: 4px;
    background: #1a1b26; border-radius: 4px;
  }
  .chat-project-group:hover { background: #1e2030; }
  .chat-project-group .chevron {
    font-size: 9px; color: #565f89; transition: transform 0.15s;
    flex-shrink: 0; width: 12px; text-align: center;
  }
  .chat-project-group .chevron.collapsed { transform: rotate(-90deg); }
  .chat-project-group .group-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chat-project-group .group-stats {
    font-weight: 400; color: #565f89; font-size: 10px; flex-shrink: 0;
  }

  .chat-project-group .group-action-btn {
    flex-shrink: 0; width: 20px; height: 20px; border-radius: 4px;
    border: none; background: transparent; color: #565f89;
    font-size: 14px; cursor: pointer; display: flex;
    align-items: center; justify-content: center; opacity: 0; transition: all 0.15s;
    padding: 0; line-height: 1;
  }
  .chat-project-group:hover .group-action-btn { opacity: 1; }
  .chat-project-group .group-action-btn:hover { background: #292e42; color: #7aa2f7; }

  .group-copy-btn .check-icon { display: none; color: #9ece6a; font-size: 10px; white-space: nowrap; }
  .group-copy-btn .copy-icon { display: inline; }
  .group-copy-btn.copied .check-icon { display: inline; }
  .group-copy-btn.copied .copy-icon { display: none; }
  .group-copy-btn.copied { color: #9ece6a; opacity: 1; }

  .group-popover-anchor { display: flex; align-items: center; }

  .group-popover {
    position: absolute; top: 100%; right: 0; margin-top: 4px; z-index: 100;
    background: #1e2030; border: 1px solid #292e42; border-radius: 6px;
    padding: 4px; min-width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  .group-popover-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 6px 10px; border: none; background: transparent;
    color: #a9b1d6; font-size: 12px; cursor: pointer; border-radius: 4px;
    text-align: left; white-space: nowrap;
  }
  .group-popover-item:hover { background: #292e42; color: #c0caf5; }
  .group-popover-item .agent-icon { color: #e0af68; flex-shrink: 0; }

  #main {
    flex: 1; display: flex; flex-direction: column; height: 100%; min-width: 0; overflow: hidden;
  }

  #terminal-header {
    padding: 10px 16px; border-bottom: 1px solid #292e42;
    font-size: 13px; color: #565f89;
    display: flex; align-items: center; justify-content: space-between;
  }
  #terminal-header .session-label { color: #7aa2f7; font-weight: 500; }
  #terminal-header .header-time { font-size: 11px; color: #565f89; }

  .claude-badge {
    font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 4px;
    margin-left: 8px; display: inline-flex; align-items: center; gap: 4px;
  }
  .claude-badge.waiting { background: #1a3a5c; color: #7aa2f7; }
  .claude-badge.working { background: #1a3a2a; color: #9ece6a; }
  .claude-badge.permission { background: #3a2a1a; color: #e0af68; }

  .pulse-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #9ece6a;
    animation: pulse 1.5s ease-in-out infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

  #terminal-container { flex: 1; padding: 8px; min-height: 0; overflow: hidden; }

  #terminal-status-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 12px; border-top: 1px solid #292e42; background: #16161e;
    font-size: 11px; color: #565f89; font-family: monospace;
  }
  #terminal-status-bar .status-bar-item { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #terminal-status-bar .status-bar-spacer { flex: 1; }
  #terminal-status-bar .status-badge {
    padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 500;
  }
  #terminal-status-bar .status-badge.running { background: #1a3a2a; color: #9ece6a; }
  #terminal-status-bar .status-badge.exited { background: #292e42; color: #565f89; }
  #terminal-status-bar .activity-active { color: #9ece6a; font-size: 11px; }
  #terminal-status-bar .activity-idle { color: #565f89; font-size: 11px; }

  #activity-log {
    max-height: 200px; overflow-y: auto; border-top: 1px solid #292e42;
    background: #16161e; font-size: 12px;
  }
  #activity-log-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 12px; cursor: pointer; user-select: none;
    color: #565f89; font-size: 11px; font-weight: 600;
    border-top: 1px solid #292e42; background: #16161e;
  }
  #activity-log-header:hover { color: #a9b1d6; }
  .activity-event {
    padding: 4px 12px; display: flex; align-items: center; gap: 8px;
    color: #a9b1d6;
  }
  .activity-event .activity-icon { width: 16px; text-align: center; flex-shrink: 0; }
  .activity-event .activity-name { font-weight: 500; color: #c0caf5; }
  .activity-event .activity-detail { color: #565f89; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .activity-event .activity-time { color: #3b4261; font-size: 10px; flex-shrink: 0; }
  .activity-event.error { color: #f7768e; }

  #chat-viewer {
    flex: 1; overflow-y: auto; padding: 16px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .chat-bubble {
    max-width: 85%; padding: 10px 14px; border-radius: 10px;
    font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
  }
  .chat-bubble.human { align-self: flex-end; background: #292e42; color: #c0caf5; border-bottom-right-radius: 4px; }
  .chat-bubble.assistant { align-self: flex-start; background: #1e2030; color: #a9b1d6; border-bottom-left-radius: 4px; }
  .chat-bubble.system {
    align-self: center; background: transparent; color: #3b4261;
    border: 1px dashed #292e42; font-size: 11px; max-width: 95%;
    padding: 6px 12px; font-family: monospace; opacity: 0.7; cursor: pointer;
  }
  .chat-bubble.system:hover { opacity: 1; border-color: #3b4261; }
  .chat-bubble.system .system-summary { display: flex; align-items: center; gap: 6px; }
  .chat-bubble.system .system-chevron { font-size: 8px; transition: transform 0.15s; }
  .chat-bubble.system .system-chevron.open { transform: rotate(90deg); }
  .chat-bubble.system .system-full {
    display: none; margin-top: 6px; padding-top: 6px;
    border-top: 1px dashed #292e42; white-space: pre-wrap; word-break: break-word;
    max-height: 200px; overflow-y: auto; font-size: 10px; color: #565f89;
  }
  .chat-bubble.system .system-full.visible { display: block; }
  .chat-bubble .tool-block {
    background: #1a1b26; border: 1px solid #292e42; border-radius: 4px;
    padding: 6px 8px; margin: 4px 0; font-family: monospace; font-size: 12px;
    color: #7aa2f7;
  }
  .chat-header-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-bottom: 1px solid #292e42;
  }
  .chat-header-bar .continue-btn {
    background: #7aa2f7; border: none; border-radius: 4px;
    color: #1a1b26; padding: 5px 12px; font-size: 12px; font-weight: 600;
    cursor: pointer;
  }
  .chat-header-bar .continue-btn:hover { background: #89b4fa; }

  #empty-state {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: #565f89; font-size: 14px; flex-direction: column; gap: 8px;
  }
  #empty-state .hint { font-size: 12px; color: #3b4261; }

  #connection-status {
    padding: 8px 16px; border-top: 1px solid #292e42;
    font-size: 11px; display: flex; align-items: center; gap: 6px;
  }
  #connection-status .dot { width: 6px; height: 6px; border-radius: 50%; }
  #connection-status .dot.connected { background: #9ece6a; }
  #connection-status .dot.disconnected { background: #f7768e; }

  #session-list::-webkit-scrollbar, #chat-list::-webkit-scrollbar, #activity-log::-webkit-scrollbar, #chat-viewer::-webkit-scrollbar { width: 4px; }
  #session-list::-webkit-scrollbar-track, #chat-list::-webkit-scrollbar-track, #activity-log::-webkit-scrollbar-track, #chat-viewer::-webkit-scrollbar-track { background: transparent; }
  #session-list::-webkit-scrollbar-thumb, #chat-list::-webkit-scrollbar-thumb, #activity-log::-webkit-scrollbar-thumb, #chat-viewer::-webkit-scrollbar-thumb { background: #292e42; border-radius: 2px; }

  .modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.6); display: flex;
    align-items: center; justify-content: center; z-index: 1000;
  }
  .modal-box {
    background: #1e2030; border: 1px solid #292e42; border-radius: 8px;
    padding: 20px 24px; min-width: 320px; max-width: 400px;
  }
  .modal-box h3 { font-size: 14px; color: #c0caf5; margin-bottom: 8px; font-weight: 600; }
  .modal-box p { font-size: 12px; color: #565f89; margin-bottom: 16px; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .modal-actions button {
    padding: 6px 14px; border-radius: 4px; font-size: 12px;
    cursor: pointer; border: 1px solid #292e42; font-weight: 500;
  }
  .modal-actions .modal-cancel {
    background: transparent; color: #a9b1d6; border-color: #3b4261;
  }
  .modal-actions .modal-cancel:hover { background: #292e42; }
  .modal-actions .modal-delete {
    background: #f7768e22; color: #f7768e; border-color: #f7768e44;
  }
  .modal-actions .modal-delete:hover { background: #f7768e33; }
  .modal-actions .modal-create {
    background: #7aa2f722; color: #7aa2f7; border-color: #7aa2f744;
  }
  .modal-actions .modal-create:hover { background: #7aa2f733; }
  .modal-field { margin-bottom: 12px; }
  .modal-field label { display: block; font-size: 11px; color: #565f89; margin-bottom: 4px; font-weight: 500; }
  .modal-field input {
    width: 100%; background: #1a1b26; border: 1px solid #292e42;
    border-radius: 4px; padding: 6px 10px; color: #c0caf5;
    font-size: 12px; outline: none; font-family: monospace;
  }
  .modal-field input:focus { border-color: #7aa2f7; }
  .modal-field input::placeholder { color: #3b4261; }

  #new-terminal-btn {
    font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 4px;
    border: 1px solid #292e42; background: transparent; color: #565f89;
    cursor: pointer; transition: all 0.15s;
  }
  #new-terminal-btn:hover { background: #292e42; color: #7aa2f7; border-color: #7aa2f7; }

  .hidden { display: none !important; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .chat-spinner {
    display: inline-block; width: 12px; height: 12px;
    border: 2px solid #292e42; border-top-color: #7aa2f7;
    border-radius: 50%; animation: spin 0.6s linear infinite;
  }
`;
