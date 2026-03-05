export const UTILS_JS = `
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  var diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

function formatToolBlock(block) {
  var name = block.name || 'unknown';
  var input = block.input || {};
  var detail = name;
  if (name === 'Bash' && input.command) detail += ': ' + input.command.slice(0, 100);
  else if ((name === 'Read' || name === 'Write' || name === 'Edit') && input.file_path) detail += ': ' + input.file_path;
  else if (name === 'Glob' && input.pattern) detail += ': ' + input.pattern;
  else if (name === 'Grep' && input.pattern) detail += ': /' + input.pattern + '/';
  else if (name === 'Agent' && input.description) detail += ': ' + input.description.slice(0, 80);
  return escapeHtml(detail);
}
`;
