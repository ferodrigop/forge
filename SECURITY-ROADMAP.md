# Forge Security Roadmap

Comprehensive security audit conducted March 2026 against OWASP Top 10, Node.js security guide, WebSocket cheat sheet, and PTY-specific considerations.

## Status legend

- **DONE** — Already shipped
- **FIX NOW** — Fixing before open-source launch
- **LATER** — Worth doing post-launch
- **WONT FIX** — Not applicable or wrong tradeoff for Forge

---

## DONE — Already shipped

### D1. Optional token auth on control plane
- **Files:** `dashboard-server.ts`, `config.ts`, `types.ts`, `state.ts`
- **What:** Bearer token auth on `/mcp`, `/api/*`, `/ws` via `--auth-token`
- **Status:** Shipped in `36ad791`

### D2. Request body size cap (1MB)
- **Files:** `dashboard-server.ts`
- **What:** `readBody()` rejects payloads >1MB with 413
- **Status:** Shipped in `36ad791`

### D3. Shell invocation hardening (`execFileSync`)
- **Files:** `cli.ts` (lsof), `terminal-session.ts` (ps)
- **What:** Replaced `execSync` string interpolation with `execFileSync` + args array
- **Status:** Shipped in `36ad791`

### D4. Timing-safe token comparison
- **Files:** `dashboard-server.ts`
- **What:** `crypto.timingSafeEqual` with constant-time length-mismatch handling
- **Status:** Applied, pending commit

### D5. Resource limits
- **Files:** `server.ts`, `session-manager.ts`, `ring-buffer.ts`
- **What:** `--max-sessions` (10), `--idle-timeout` (30min), buffer cap (1MB/session), output read cap (30KB)
- **Status:** Shipped in earlier releases

### D6. Process isolation
- **What:** Each PTY is a subprocess via `node-pty` running as current OS user. No root, no privilege escalation. `CLAUDECODE` env var stripped to prevent nesting loops.
- **Status:** By design

### D7. Frontend token propagation
- **Files:** `state.ts`
- **What:** `authHeaders()` on all fetch calls, `?token=` on WebSocket, token persisted to `sessionStorage`
- **Status:** Shipped in `36ad791`

### D8. Localhost-only binding
- **Files:** `dashboard-server.ts`
- **What:** HTTP server binds to `127.0.0.1`, not `0.0.0.0`
- **Status:** By design

---

## FIX NOW — Before open-source launch

### F1. DNS rebinding / cross-origin attack (CRITICAL)
- **Risk:** A malicious webpage can connect to `ws://127.0.0.1:3141/ws` from the browser and control terminal sessions. Localhost is not a trust boundary against browser-based attacks.
- **Files:** `dashboard-server.ts`
- **Fix:** Validate `Origin` header on WebSocket upgrade. Validate `Host` header on HTTP API requests. Reject any origin that isn't `127.0.0.1` or `localhost`.

### F2. Command injection in git worktree (CRITICAL)
- **Risk:** `params.branch` interpolated into `execSync` shell string. A branch name like `"; rm -rf / #` escapes quotes.
- **Files:** `server.ts:281, 295, 305`
- **Fix:** Replace all `execSync` calls with `execFileSync` + args array.

### F3. ReDoS via user-supplied regex (CRITICAL)
- **Risk:** `new RegExp(params.pattern)` with no complexity limit. Catastrophic backtracking (e.g., `(a+)+$`) freezes the event loop, blocking all sessions.
- **Files:** `server.ts:158, 518, 631, 725`
- **Fix:** Cap pattern length (500 chars). Optionally adopt `re2` for linear-time execution.

### F4. WebSocket message size limit (HIGH)
- **Risk:** HTTP has 1MB body cap but WebSocket has none. Attacker can send arbitrarily large messages.
- **Files:** `dashboard-server.ts`
- **Fix:** Set `maxPayload` on `WebSocketServer` constructor (1MB to match HTTP).

### F5. Strip token from URL bar (HIGH)
- **Risk:** `?token=secret` persists in browser history and autocomplete.
- **Files:** `state.ts`
- **Fix:** `history.replaceState()` to remove `?token=` after reading it.

---

## LATER — Post-launch improvements

### L1. Content-Security-Policy header
- **Risk:** Dashboard serves inline HTML with no CSP. If XSS were possible, scripts could run freely.
- **Files:** `dashboard-server.ts`
- **Fix:** Add CSP header restricting `script-src`, `connect-src` to self + CDN origins.
- **Priority:** Low — dashboard HTML is static and bundled, not user-generated.

### L2. HTTP server timeouts
- **Risk:** Slowloris-style connection exhaustion.
- **Files:** `dashboard-server.ts`
- **Fix:** Set `server.headersTimeout`, `server.requestTimeout`, `server.keepAliveTimeout`.
- **Priority:** Low — localhost only, limited concurrent users.

### L3. WebSocket rate limiting
- **Risk:** Rapid message spam from malicious local process.
- **Files:** `ws-handler.ts`
- **Fix:** Per-client message rate limit (e.g., 100 msgs/sec), max concurrent connections.
- **Priority:** Medium — mitigated by Origin check (F1) and auth token.

### L4. Zod validation on WebSocket messages
- **Risk:** Prototype pollution via `JSON.parse` + property access on untrusted input.
- **Files:** `ws-handler.ts`
- **Fix:** Define Zod schemas for each WS message type, validate before processing.
- **Priority:** Medium — current code uses `String(msg.sessionId)` which is safe against prototype pollution, but Zod would be cleaner.

### L5. Zod validation on dashboard HTTP POST bodies
- **Risk:** Same as L4 but for `/api/sessions` POST body.
- **Files:** `dashboard-server.ts`
- **Fix:** Validate with Zod schema before passing to `manager.create()`.
- **Priority:** Medium — mitigated by auth token requirement.

### L6. Explicit file permissions on state files
- **Risk:** PID file and `sessions.json` use default umask (typically 0644).
- **Files:** `cli.ts`, `core/state-store.ts`
- **Fix:** `writeFile(path, data, { mode: 0o600 })` for sensitive files.
- **Priority:** Low — files contain PIDs and session metadata, not secrets.

### L7. PID file race condition (TOCTOU)
- **Risk:** Race between checking if PID file exists and writing a new one.
- **Files:** `cli.ts`
- **Fix:** Use atomic write (write-to-temp-then-rename) or `flock`.
- **Priority:** Low — daemon start is a manual, infrequent operation.

### L8. Minimal env for detached daemon child
- **Risk:** `spawn()` in `cli.ts:112` passes full `process.env` to detached child, which may contain unrelated secrets.
- **Files:** `cli.ts`
- **Fix:** Construct a minimal env with only needed variables.
- **Priority:** Low — daemon runs as same user, same trust level.

### L9. npm publish hygiene
- **What:** Verify `npm pack --dry-run` only includes `dist/`. Add `.npmignore` as safety net.
- **Priority:** Medium — `"files": ["dist"]` in package.json should handle this, but verify before first publish.

### L10. Supply chain / dependency auditing
- **What:** Run `npm audit` in CI, consider pinning exact versions, add Socket.dev or Snyk.
- **Priority:** Medium — standard open-source practice.

---

## WONT FIX — Not applicable to Forge

### W1. Input sanitization / ANSI stripping on terminal input
- **Why not:** Forge is a PTY orchestrator. Control sequences (Ctrl+C, arrows, escape codes) are legitimate terminal behavior. Stripping them would break core functionality. The MCP client (Claude Code) is the input source, not untrusted users.

### W2. Output secret redaction
- **Why not:** Forge is a transport layer — it faithfully reproduces terminal output. Regex-based secret scrubbing creates false positives (breaking output) and false negatives (false sense of security). Secret management belongs in `.env` files, `.gitignore`, and the application layer.

### W3. Path scoping / sandbox enforcement
- **Why not:** Redundant with Claude Code's own permission model and working directory restrictions. Forge sessions intentionally work across directories (worktrees, monorepos). Adding a second enforcement layer would break legitimate workflows without meaningful security gain.

### W4. Command allowlist for PTY spawn
- **Why not:** Forge's value proposition is spawning arbitrary commands (`docker-compose`, `npm test`, `python`, etc.). Restricting to shell + claude only would break core functionality. The auth token is the right access control — if you have the token, you're authorized to run commands.

### W5. Full UUID session IDs
- **Why not:** 8-char truncated UUIDs (32 bits) are sufficient for a localhost dev tool with max 10 concurrent sessions. Brute-forcing requires ~4 billion attempts against a local server. Auth token is the real access control, not session ID secrecy.

### W6. CSRF protection on dashboard
- **Why not:** Dashboard uses Bearer token auth via `Authorization` header, not cookies. CSRF attacks exploit cookie-based auth. No cookies = no CSRF risk.

### W7. Node.js `--permission` flag
- **Why not:** PTY sessions need full filesystem access by design. Restricting Forge's own permissions would prevent spawned terminals from working. Not practical as a default.

### W8. Frozen intrinsics / monkey-patching protection
- **Why not:** Forge doesn't load untrusted plugins or third-party code at runtime. All dependencies are npm packages loaded at startup. No attack vector for prototype manipulation from external sources.

### W9. Keychain integration for token storage
- **Why not:** Over-engineering for a localhost dev tool. The token is user-chosen, passed via CLI flag or env var, and only needed when the user opts into auth. Standard Unix practices (env vars, `.env` files) are sufficient.

---

## LATER — DX / Onboarding

### O1. `forge setup` CLI command
- **What:** A convenience command that registers Forge as an MCP server in Claude Code's settings.
- **Implementation:** Runs `claude mcp add --transport http forge http://127.0.0.1:3141/mcp` (or prints it if `claude` is not on PATH).
- **Files:** `src/cli.ts` (~10 lines)
- **Priority:** Low — nice for onboarding, not a feature. One-time operation.

### O2. Submit Forge to aitmpl.com marketplace
- **What:** List Forge as an MCP integration on the claude-code-templates marketplace (22.5k stars, 1000+ templates). Users could install via `npx claude-code-templates --mcp forge --yes`.
- **Implementation:** Submit to their registry — no code changes in Forge needed.
- **Priority:** Low — free distribution/marketing to their audience.

### O3. `forge doctor` diagnostic command
- **What:** Single command that checks Forge health — Node version, daemon status, session count, auth config, MCP endpoint responsiveness, memory usage, disk state.
- **Implementation:** Add `doctor` subcommand to `cli.ts`. Each check is a simple probe (process alive, HTTP fetch, fs stat, etc.).
- **Files:** `src/cli.ts` (~50-80 lines)
- **Priority:** Medium — useful for onboarding, debugging, and support requests.

---

## Audit sources

- OWASP Top 10 (2021)
- OWASP WebSocket Security Cheat Sheet
- OWASP Node.js Security Cheat Sheet
- Node.js official security guide (nodejs.org)
- PTY/terminal escape injection research
- npm publishing security best practices
