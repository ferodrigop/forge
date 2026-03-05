export const CHAT_VIEW_JS = `
function SystemBubble(props) {
  var text = props.text;
  var summary = props.summary;
  var expanded = preactHooks.useState(false);

  return html\`
    <div
      class="chat-bubble system"
      onClick=\${function() { expanded[1](!expanded[0]); }}
    >
      <div class="system-summary">
        <span class=\${'system-chevron' + (expanded[0] ? ' open' : '')}>\u25b6</span>
        \${' ' + summary}
      </div>
      \${expanded[0] ? html\`<div class="system-full visible">\${text}</div>\` : null}
    </div>
  \`;
}

function ChatBubble(props) {
  var m = props.message;
  var role = m.type || m.role || 'unknown';

  if (role === 'human' || role === 'user') {
    var text = '';
    if (m.message && m.message.content) {
      if (typeof m.message.content === 'string') text = m.message.content;
      else if (Array.isArray(m.message.content)) {
        text = m.message.content.filter(function(c) { return c.type === 'text'; }).map(function(c) { return c.text; }).join('\\n');
      }
    }
    if (!text) return null;

    var isSystem = /^<(local-command|command-name|system-reminder|cl-|antml)/.test(text.trim()) ||
      /^\\[Request interrupted/.test(text.trim()) ||
      (m.userType && m.userType !== 'external');

    if (isSystem) {
      var summary = text.trim();
      if (summary.indexOf('<command-name>') >= 0) {
        var cmdMatch = summary.match(/<command-name>([^<]+)<\\/command-name>/);
        summary = cmdMatch ? '/' + cmdMatch[1] : 'slash command';
      } else if (summary.indexOf('<local-command-caveat>') >= 0) {
        summary = 'system context injection';
      } else if (summary.indexOf('<local-command-stdout>') >= 0) {
        var stdoutMatch = summary.match(/<local-command-stdout>([^<]*)<\\/local-command-stdout>/);
        summary = stdoutMatch ? stdoutMatch[1].slice(0, 80) : 'command output';
      } else if (/^\\[Request interrupted/.test(summary)) {
        summary = summary.slice(0, 60);
      } else {
        summary = summary.slice(0, 80) + (summary.length > 80 ? '...' : '');
      }
      return html\`<\${SystemBubble} text=\${text} summary=\${summary} />\`;
    }

    return html\`<div class="chat-bubble human">\${text}</div>\`;
  }

  if (role === 'assistant') {
    var parts = [];
    if (m.message && m.message.content) {
      var content = m.message.content;
      if (typeof content === 'string') {
        parts.push(content);
      } else if (Array.isArray(content)) {
        for (var j = 0; j < content.length; j++) {
          var block = content[j];
          if (block.type === 'text' && block.text) {
            parts.push(block.text);
          } else if (block.type === 'tool_use') {
            parts.push(html\`<div class="tool-block">\${formatToolBlock(block)}</div>\`);
          }
        }
      }
    }
    if (parts.length === 0) return null;
    return html\`<div class="chat-bubble assistant">\${parts}</div>\`;
  }

  return null;
}

function ChatMessages() {
  var messages = chatMessages.value;
  var viewerRef = preact.createRef();

  preactHooks.useEffect(function() {
    if (viewerRef.current) viewerRef.current.scrollTop = viewerRef.current.scrollHeight;
  }, [messages]);

  if (chatLoading.value) {
    return html\`<div id="chat-viewer" ref=\${viewerRef}><div style="color:#3b4261;text-align:center;">Loading...</div></div>\`;
  }
  if (messages.length === 0) {
    return html\`<div id="chat-viewer" ref=\${viewerRef}><div style="color:#3b4261;text-align:center;">Empty session</div></div>\`;
  }

  return html\`
    <div id="chat-viewer" ref=\${viewerRef}>
      \${messages.map(function(m, i) {
        return html\`<\${ChatBubble} key=\${i} message=\${m} />\`;
      })}
    </div>
  \`;
}

function ChatView() {
  var chatId = activeChatId.value;
  return html\`
    <div id="main">
      <div class="chat-header-bar">
        <span style="color:#565f89;font-size:13px;">Chat: <span style="color:#7aa2f7;font-weight:500;">\${chatId ? chatId.slice(0, 8) + '...' : ''}</span></span>
        <button class="continue-btn" onClick=\${function() { continueChat(chatId); }}>Continue Session</button>
      </div>
      <\${ChatMessages} />
    </div>
  \`;
}
`;
