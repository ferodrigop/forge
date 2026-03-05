import { CSS_STYLES } from "./frontend/styles.js";
import { APP_JS } from "./frontend/app.js";

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Forge Dashboard</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
<style>${CSS_STYLES}</style>
</head>
<body>
  <div id="app"></div>
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/preact@10.25.4/dist/preact.umd.js"></script>
<script src="https://cdn.jsdelivr.net/npm/preact@10.25.4/hooks/dist/hooks.umd.js"></script>
<script src="https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@preact/signals-core@1.8.0/dist/signals-core.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@preact/signals@1.3.1/dist/signals.min.js"></script>
<script>
// Bind htm to preact.h and expose as htmPreact
var htmPreact = { html: htm.bind(preact.h) };
</script>
<script>${APP_JS}</script>
</body>
</html>`;
