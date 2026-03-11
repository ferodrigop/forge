import { CSS_STYLES } from "./frontend/styles.js";
import { APP_JS } from "./frontend/app.js";
import { FAVICON_DATA_URI } from "./frontend/assets.js";

export { LOGO_PNG_BASE64 } from "./frontend/assets.js";

const CDN_LIBS = {
  xtermCss: "https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css",
  xtermJs: "https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js",
  addonFit: "https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js",
  preact: "https://cdn.jsdelivr.net/npm/preact@10.25.4/dist/preact.umd.js",
  hooks: "https://cdn.jsdelivr.net/npm/preact@10.25.4/hooks/dist/hooks.umd.js",
  htm: "https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js",
  signalsCore: "https://cdn.jsdelivr.net/npm/@preact/signals-core@1.8.0/dist/signals-core.min.js",
  signals: "https://cdn.jsdelivr.net/npm/@preact/signals@1.3.1/dist/signals.min.js",
};

const LOCAL_LIBS = {
  xtermCss: "/vendor/xterm.min.css",
  xtermJs: "/vendor/xterm.min.js",
  addonFit: "/vendor/addon-fit.min.js",
  preact: "/vendor/preact.umd.js",
  hooks: "/vendor/hooks.umd.js",
  htm: "/vendor/htm.umd.js",
  signalsCore: "/vendor/signals-core.min.js",
  signals: "/vendor/signals.min.js",
};

function buildHtml(libs: typeof CDN_LIBS): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Forge Dashboard</title>
<link rel="icon" href="${FAVICON_DATA_URI}">
<link rel="stylesheet" href="${libs.xtermCss}">
<style>${CSS_STYLES}</style>
</head>
<body>
  <div id="app"></div>
<script src="${libs.xtermJs}"></script>
<script src="${libs.addonFit}"></script>
<script src="${libs.preact}"></script>
<script src="${libs.hooks}"></script>
<script src="${libs.htm}"></script>
<script src="${libs.signalsCore}"></script>
<script src="${libs.signals}"></script>
<script>
// Bind htm to preact.h and expose as htmPreact
var htmPreact = { html: htm.bind(preact.h) };
</script>
<script>${APP_JS}</script>
</body>
</html>`;
}

/** Dashboard HTML loading libraries from CDN (web dashboard) */
export const DASHBOARD_HTML = buildHtml(CDN_LIBS);

/** Dashboard HTML loading libraries from local /vendor/ paths (desktop app, offline) */
export const DASHBOARD_HTML_LOCAL = buildHtml(LOCAL_LIBS);
