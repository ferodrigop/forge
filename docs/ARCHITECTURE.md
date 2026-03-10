# Forge Architecture

Living document. Updated as the codebase evolves.

**Current version:** 0.7.0 | **Tests:** 161 | **Tools:** 22

---

## What Forge Is

A Node.js MCP server that gives AI coding agents (Claude Code, Codex, or any MCP client) persistent PTY terminal sessions. Communicates over stdio (JSON-RPC) or HTTP, manages real terminal processes via `node-pty`, and optionally serves a web dashboard for live monitoring. Also available as a native macOS desktop app via Electron.

## System Overview

```
                     ┌─────────────────────────────────────────┐
                     │         MCP Client (any agent)            │
                     └──────────────┬──────────────────────────┘
                                    │ stdio (JSON-RPC) or HTTP
                     ┌──────────────▼──────────────────────────┐
                     │          MCP Server (server.ts)          │
                     │  22 tools + 1 resource template          │
                     │                                          │
                     │  ┌──────────────────────────────────┐   │
                     │  │       SessionManager              │   │
                     │  │  create / close / list / groups   │   │
                     │  │  persistence to ~/.forge/          │   │
                     │  └──────────┬───────────────────────┘   │
                     │             │                            │
                     │   ┌─────────▼─────────┐                 │
                     │   │ TerminalSession(s) │                 │
                     │   │  node-pty (PTY)    │                 │
                     │   │  RingBuffer (1MB)  │                 │
                     │   │  @xterm/headless   │                 │
                     │   │  CommandHistory     │                 │
                     │   └─────────┬─────────┘                 │
                     └─────────────┼───────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              MCP Client    Dashboard WS    Event Subs
              (read_*)      (live stream)   (notifications)
```

## Core Components

### 1. MCP Server (`src/server.ts`)

Single file, ~1400 lines. Registers all 22 tools and 1 resource template with the MCP SDK. Each tool follows the pattern:

```typescript
server.tool("name", "description", { /* zod schema */ }, async (params) => {
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});
```

Error handling: try-catch per tool, returns `{ isError: true }` on failure. Never throws.

### 2. Session Manager (`src/core/session-manager.ts`)

CRUD for terminal sessions. Enforces max session limit. Tracks stale entries from previous server runs. Emits events on session create/close for dashboard updates.

Key methods:
- `create(opts)` — spawns TerminalSession, generates 8-char UUID, wires exit callback
- `close(id)` — kills PTY, removes from map, persists state
- `listByTag(tag)` — filter active sessions
- `closeByTag(tag)` — batch close (used by `close_group` tool)

### 3. Terminal Session (`src/core/terminal-session.ts`)

Wraps a single PTY process. Each session has:
- **node-pty process** — real PTY with signals, colors, TUI support
- **RingBuffer** — 1MB circular buffer, per-consumer cursors for incremental reads
- **@xterm/headless** — server-side terminal emulator for `read_screen`
- **Idle timer** — auto-closes after 30min inactivity (configurable)

Listener pattern:
- `onData(fn)` — called on every chunk of PTY output, returns unsubscribe fn
- `onExit(fn)` — called when process exits, returns unsubscribe fn

Used by `wait_for`, `subscribe_events`, and `create_from_template` to react to output/exit.

### 4. Ring Buffer (`src/core/ring-buffer.ts`)

Circular byte buffer. The core differentiator over simple string concatenation.

- Fixed size (default 1MB), old data silently overwritten
- Per-consumer cursors: each `read()` call returns only NEW data since that consumer's last read
- `droppedBytes` tells the consumer how much was lost to wrapping
- `readFullBuffer()` returns everything currently in the buffer (used by `grep_terminal`, `wait_for` backlog check)

### 5. Command History (`src/core/command-history.ts`)

Persists tool call events as JSONL to `~/.forge/history/{sessionId}.jsonl`.

Event types: `session_init`, `tool_call`, `tool_result`

For agent sessions (Claude, Codex), terminal output streams through `StreamJsonParser` which extracts internal JSON-RPC events (tool use, results, errors) and converts them to HistoryEvents.

### 6. Claude Chats (`src/core/claude-chats.ts`)

Scans `~/.claude/projects/` for past Claude Code conversation files. Features:
- Decodes encoded project paths (hyphens → `/` segments)
- Merges resumed sessions into single entries
- 30-second cache with invalidation
- Search/filter/paginate API
- Exposed via dashboard REST endpoints and chat browser UI

## Tool Categories

### Session Lifecycle (8 tools)

| Tool | Purpose |
|------|---------|
| `create_terminal` | Spawn PTY with name, tags, buffer size, dimensions |
| `create_from_template` | Spawn from preset (shell, next-dev, vite-dev, etc.) with auto `waitFor` |
| `spawn_claude` | Launch Claude Code sub-agent. Supports worktree isolation, oneShot mode |
| `spawn_codex` | Launch Codex sub-agent. Supports worktree isolation |
| `close_terminal` | Kill session, free resources |
| `close_group` | Batch close by tag |
| `list_terminals` | List sessions, optional tag filter |
| `list_templates` | Show available presets |

### I/O (6 tools)

| Tool | Purpose |
|------|---------|
| `write_terminal` | Send input (appends newline by default) |
| `read_terminal` | Incremental read — only NEW output since last read (30KB cap) |
| `read_screen` | Rendered viewport via headless xterm (no ANSI codes) |
| `read_multiple` | Batch read up to 20 sessions, partial failure resilient |
| `send_control` | Ctrl+C, arrows, Tab, Enter, Escape, etc. (26 keys) |
| `resize_terminal` | Change terminal dimensions |

### Search & Wait (2 tools)

| Tool | Purpose |
|------|---------|
| `grep_terminal` | Regex search across full buffer with context lines |
| `wait_for` | Block until pattern matches OR process exits (`waitForExit` mode) |

### Execution (1 tool)

| Tool | Purpose |
|------|---------|
| `run_command` | Run command to completion, return output + exit code, auto-cleanup. Ideal for build/test commands. 100KB output cap. |

### Events (2 tools)

| Tool | Purpose |
|------|---------|
| `subscribe_events` | Watch for exit or pattern_match, delivered as MCP logging messages |
| `unsubscribe_events` | Cancel subscription |

### Ops (3 tools)

| Tool | Purpose |
|------|---------|
| `health_check` | Version, uptime, session count, memory |
| `get_session_history` | Tool call timeline for agent sessions |
| `clear_history` | Remove stale session entries from disk |

## Dashboard

Preact + htm + Preact Signals UI. Zero build step — loaded from CDN, code bundled as string constants inside the server binary.

### Frontend Architecture

```
src/dashboard/frontend/
  app.ts              — Root component, keyboard handlers, WebSocket init, desktop detection
  state.ts            — 17+ Preact Signals for global state, configurable API/WS host
  styles.ts           — Tokyo Night theme CSS
  utils.ts            — timeAgo, formatBytes, formatToolBlock helpers
  assets.ts           — Base64-embedded UMD bundles (Preact, htm, xterm)
  components/
    sidebar.ts        — Tabs (Terminals/Chats), session list, chat browser
    terminal-view.ts  — xterm.js wrapper, activity log, status bar, input
    chat-view.ts      — Chat message viewer with bubbles, continue/delete
    modals.ts         — New terminal + delete confirmation
```

### Dashboard Features

- **Live terminal output** via WebSocket (xterm.js rendering)
- **Activity log** — real-time tool call timeline for agent sessions (Claude, Codex)
- **Chat history browser** — search/browse/continue past Claude Code and Codex sessions
- **Session grouping** by tags and working directory
- **Auto-follow mode** — auto-switch to newly created sessions
- **Memory monitoring** — per-session and total RAM
- **Interactive input** — type directly into sessions from browser

### Server-side

- `dashboard-server.ts` — HTTP server (serves HTML + REST API) + WebSocket
- `ws-handler.ts` — Handles subscribe/select/input/resize messages
- REST endpoints: `/api/sessions`, `/api/chats`, `/api/chats/{id}`, `/api/chats/{id}/continue`, `/api/codex-chats`, `/api/codex-chats/{id}`

## Desktop App (Electron)

Native macOS desktop app. The Electron main process runs the Forge server in-process — no separate daemon needed.

### Architecture

```
Electron Main Process (Node.js / CJS)
  ├── daemon.ts  → Detects existing daemon OR starts server in-process
  │   ├── In-process: createServer() + DashboardServer on 127.0.0.1:3141
  │   └── External:  DesktopHtmlServer (random port) + DaemonBridge (WS relay to 3141)
  ├── window.ts  → BrowserWindow (hiddenInset title bar, sandbox, CSP)
  ├── preload.ts → contextBridge exposes { isDesktop, platform, trafficLightClearance }
  ├── tray.ts    → Menu bar icon with session count + actions
  ├── menu.ts    → Standard macOS app menu
  └── notifications.ts → Native alerts on session create/exit
```

### Split-Port Architecture

When an existing CLI daemon is running on port 3141, the desktop app uses a split-port approach:
1. `DesktopHtmlServer` serves the dashboard HTML (with desktop CSS/preload) on an OS-assigned port
2. `DaemonBridge` connects via WebSocket to the existing daemon for session data
3. Frontend uses `daemonPort` query parameter to direct API/WS calls to the daemon port
4. `webSecurity: false` allows cross-port localhost requests

When no daemon is running, the app starts the full server in-process on 3141 (same as CLI mode).

### Key Files

| File | Purpose |
|------|---------|
| `desktop/main/index.ts` | App entry, single instance lock, lifecycle |
| `desktop/main/daemon.ts` | Server lifecycle, detect/start/bridge |
| `desktop/main/window.ts` | BrowserWindow creation, security, state persistence |
| `desktop/main/preload.ts` | Context bridge (minimal surface) |
| `desktop/main/html-server.ts` | Serves dashboard HTML for split-port mode |
| `desktop/main/daemon-bridge.ts` | WebSocket relay to existing daemon |
| `desktop/main/tray.ts` | System tray with session count |
| `desktop/main/notifications.ts` | Native notifications via SessionManager or DaemonBridge events |

### Security

- `sandbox: true` + `contextIsolation: true` in renderer
- Navigation locked to localhost origins
- External links open in default browser
- All permissions (camera, mic, geolocation, etc.) denied
- CSP restricts scripts to self + jsdelivr CDN
- DevTools disabled in packaged builds

## Data Flow

### Read (incremental)
```
Claude calls read_terminal(id)
  → SessionManager.get(id)
  → TerminalSession.read()
  → RingBuffer.read(consumerId)  // returns only bytes since last read
  → response { status, data, bytes }
```

### Write
```
Claude calls write_terminal(id, input)
  → SessionManager.get(id)
  → TerminalSession.write(input + "\n")
  → node-pty.write()
  → PTY process receives input
```

### wait_for (pattern mode)
```
1. Check backlog: session.readFullBuffer().match(regex) → instant return if found
2. Subscribe: session.onData(chunk => accumulated.match(regex))
3. Subscribe: session.onExit() → resolve as "session_exited"
4. setTimeout → resolve as "timeout"
5. First to fire wins, cleanup unsubscribes all others
```

### wait_for (waitForExit mode)
```
1. Check: session.status === "exited" → instant return with exitCode
2. Subscribe: session.onExit(exitCode) → resolve
3. setTimeout → resolve as "timeout"
```

### spawn_claude / spawn_codex
```
1. Build args: ["--print", "-p", prompt] + model/budget/tools flags
2. If worktree: git worktree add → set cwd to worktree path
3. manager.create({ command: claudePath|codexPath, args })
4. If claude-agent/codex-agent tagged: wire StreamJsonParser for history extraction
5. Return session info + worktree path
```

## Persistence

| File | Purpose |
|------|---------|
| `~/.forge/sessions.json` | Session metadata (reloaded as stale entries on restart) |
| `~/.forge/history/{id}.jsonl` | Per-session tool call history (HistoryEvents) |

## Key Design Decisions

1. **stdout is sacred** — Only MCP JSON-RPC goes to stdout. All logging to stderr via structured JSON logger.

2. **Ring buffer, not unbounded arrays** — Bounded memory per session. Old data is silently overwritten. This is intentional — terminal output can be massive (npm install, log tailing).

3. **Per-consumer cursors** — Each `read_terminal` caller gets their own read position. Two consumers reading the same session see different data depending on when they last read.

4. **Fire-and-forget history** — CommandHistory appends are non-blocking. A failed disk write doesn't break the terminal session.

5. **Agent env stripping** — Spawned terminals have agent-specific env vars (e.g., `CLAUDECODE`) removed to prevent nesting errors.

6. **Session preservation after exit** — Exited sessions remain readable (buffer intact) until explicitly closed or server restarts. This allows post-mortem inspection.

7. **30KB read cap** — `read_terminal` caps output at 30KB per call to prevent MCP token overflow. Full buffer available via `readFullBuffer()` in `grep_terminal` and `wait_for`.

8. **Shared daemon utilities** — PID file management, port detection, and process lifecycle are in `src/utils/daemon.ts`, shared between CLI (`src/cli.ts`) and desktop app (`desktop/main/daemon.ts`).

9. **Desktop split-port** — When an existing daemon occupies port 3141, the desktop app serves its own HTML on a random port and bridges to the daemon via WebSocket, rather than conflicting or replacing it.

## Configuration Precedence

CLI flag > Environment variable > Default value

| Setting | CLI | Env | Default |
|---------|-----|-----|---------|
| Max sessions | `--max-sessions` | `FORGE_MAX_SESSIONS` | 10 |
| Idle timeout | `--idle-timeout` | `FORGE_IDLE_TIMEOUT` | 1800000 (30min) |
| Buffer size | `--buffer-size` | `FORGE_BUFFER_SIZE` | 1048576 (1MB) |
| Shell | `--shell` | `SHELL` | /bin/bash |
| Claude path | `--claude-path` | `FORGE_CLAUDE_PATH` | claude |
| Codex path | `--codex-path` | `FORGE_CODEX_PATH` | codex |
| Dashboard | `--dashboard` | `FORGE_DASHBOARD` | off |
| Port | `--port` | `FORGE_DASHBOARD_PORT` | 3141 |

## Test Structure

161 tests across 12 suites:

| Suite | Tests | Type |
|-------|-------|------|
| Ring Buffer | 13 | Unit |
| Config | 10 | Unit |
| Control Chars | 6 | Unit |
| State Store | 4 | Unit |
| Templates | 3 | Unit |
| Stream JSON Parser | 11 | Unit |
| Command History | 6 | Unit/Integration |
| Claude Chats | 14 | Unit |
| Terminal Session | 8 | Integration |
| Session Manager | 7 | Integration |
| MCP Tools E2E | 51 | Integration |
| Forge 0.7 Features | 28 | Integration |

Test pattern: `InMemoryTransport.createLinkedPair()` for MCP E2E tests, real PTY processes for terminal/session tests.
