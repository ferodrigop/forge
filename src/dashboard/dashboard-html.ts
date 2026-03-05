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
<script type="importmap">
{
  "imports": {
    "preact": "https://esm.sh/preact@10.25.4",
    "preact/hooks": "https://esm.sh/preact@10.25.4/hooks",
    "htm/preact": "https://esm.sh/htm@3.1.1/preact?external=preact",
    "@preact/signals": "https://esm.sh/@preact/signals@1.3.1?external=preact",
    "@preact/signals-core": "https://esm.sh/@preact/signals-core@1.8.0"
  }
}
</script>
</head>
<body>
  <div id="app"></div>
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
<script type="module">${APP_JS}</script>
</body>
</html>`;
