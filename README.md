# Forge

Terminal MCP server for Claude Code. Spawn, manage, and monitor real PTY sessions as MCP tools.

## Why

Claude Code's built-in Bash tool runs one command at a time and waits for it to finish. Forge gives Claude persistent terminal sessions — start a dev server in one, run tests in another, tail logs in a third, all concurrently.

**Key differentiators:**
- **Real PTY** via `node-pty` (same lib as VS Code terminal) — interactive programs, colors, TUI apps all work
- **Incremental reads** — ring buffer with per-consumer cursors means each `read_terminal` only returns NEW output, saving context window tokens
- **Clean screen reads** — `@xterm/headless` renders the terminal server-side, so `read_screen` returns exactly what a human would see (no ANSI escape codes)
- **Multi-agent orchestration** — session groups, output multiplexing, event subscriptions, and templates for managing multiple concurrent sessions
- **Web dashboard** — real-time browser UI to watch what Claude is doing across all terminals
- **Zero config** — single `npx` command in your Claude Code settings

## Quick Start

### 1. Add to Claude Code

In your Claude Code MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "forge": {
      "command": "npx",
      "args": ["forge-terminal-mcp"]
    }
  }
}
```

### 2. Use It

Claude now has access to 19 tools across 5 categories:

**Session Lifecycle**
```
create_terminal      → Spawn a PTY session with optional name, tags, buffer size
create_from_template → Spawn from a built-in template (shell, next-dev, vite-dev, etc.)
spawn_claude         → Launch a Claude Code sub-agent in a dedicated session
close_terminal       → Kill a session and free resources
close_group          → Close all sessions matching a tag
list_terminals       → List sessions, optionally filtered by tag
list_templates       → Show available session templates
```

**I/O**
```
write_terminal       → Send input (appends newline by default)
read_terminal        → Read NEW output since last read (incremental)
read_screen          → Get rendered viewport as clean text (no ANSI)
read_multiple        → Batch read from up to 20 sessions at once
send_control         → Send Ctrl+C, arrow keys, Tab, Enter, etc.
resize_terminal      → Change terminal dimensions
```

**Search & Wait**
```
grep_terminal        → Regex search across a session's output buffer
wait_for             → Block until output matches a pattern (e.g., "Server ready")
```

**Events**
```
subscribe_events     → Get notified when a session exits or matches a pattern
unsubscribe_events   → Cancel an event subscription
```

**Ops**
```
health_check         → Server version, uptime, session count, memory usage
clear_history        → Clear persisted stale session entries
```

### Example Conversations

> **You:** Start a Next.js dev server and run the test suite in parallel
>
> **Claude:** *(uses `create_from_template` with "next-dev", `wait_for` "Ready", then creates a second session for `npm test`, uses `read_multiple` to poll both)*

> **You:** Spin up 3 Claude agents to research different parts of the codebase
>
> **Claude:** *(uses `spawn_claude` three times with tag "research", monitors with `list_terminals` filtered by tag, cleans up with `close_group`)*

## Tools Reference

### `create_terminal`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `command` | string | User's `$SHELL` | Command to run |
| `args` | string[] | `[]` | Command arguments |
| `cwd` | string | Process cwd | Working directory |
| `env` | object | `{}` | Additional env vars (merged with process env) |
| `cols` | number | 120 | Terminal width |
| `rows` | number | 24 | Terminal height |
| `name` | string | — | Human-readable session name |
| `tags` | string[] | — | Tags for filtering/grouping (max 10) |
| `bufferSize` | number | Server default | Ring buffer size in bytes (1 KB – 10 MB) |

Returns session info including the `id` used by all other tools.

### `create_from_template`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `template` | string | *required* | Template name (see `list_templates`) |
| `cwd` | string | — | Working directory override |
| `env` | object | — | Additional env vars |
| `name` | string | Template name | Session name override |

Built-in templates:

| Template | Command | Tags | Wait For |
|----------|---------|------|----------|
| `shell` | `$SHELL` | shell | — |
| `next-dev` | `npx next dev` | dev-server, next | "Ready" |
| `vite-dev` | `npx vite` | dev-server, vite | "Local:" |
| `docker-compose` | `docker compose up` | docker | — |
| `npm-test` | `npm test` | test | — |
| `npm-test-watch` | `npm run test:watch` | test, watch | — |

Templates with `waitFor` automatically block until the pattern appears (30s timeout).

### `spawn_claude`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | *required* | Prompt to send to Claude |
| `cwd` | string | — | Working directory |
| `model` | string | — | Model (e.g., "sonnet", "opus") |
| `allowedTools` | string[] | — | Tools Claude can use |
| `name` | string | Auto from prompt | Session name |
| `tags` | string[] | `["claude-agent"]` | Tags (claude-agent always included) |
| `maxBudget` | number | — | Max budget in USD |
| `bufferSize` | number | Server default | Ring buffer size |

### `write_terminal`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | *required* | Session ID |
| `input` | string | *required* | Text to send |
| `newline` | boolean | `true` | Append `\n` after input |

### `read_terminal`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | *required* | Session ID |

Returns `{ status, data, bytes, droppedBytes? }`. Only returns output produced since the last read. If `droppedBytes > 0`, some output was lost because the ring buffer wrapped.

### `read_screen`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | *required* | Session ID |

Returns the current terminal viewport as plain text — rendered through a headless xterm instance. No ANSI codes. Useful for TUI apps like `htop`, `vim`, or interactive prompts.

### `read_multiple`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ids` | string[] | *required* | Session IDs (1–20) |
| `mode` | string | `"incremental"` | `"incremental"` or `"screen"` |

Returns a JSON array with per-session results. Sessions that error (e.g., not found) include an inline `error` field — the tool never fails as a whole, so partial results are always returned.

### `grep_terminal`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | *required* | Session ID |
| `pattern` | string | *required* | Regex pattern |
| `context` | number | 0 | Lines of context around each match (0–10) |

Returns `{ matches: [{ lineNumber, text, context? }], totalMatches }`.

### `wait_for`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | *required* | Session ID |
| `pattern` | string | *required* | Regex pattern to wait for |
| `timeout` | number | 30000 | Timeout in ms (100–300000) |

Checks the existing buffer first (instant match if pattern already appeared), then watches new output. Returns `{ matched, data?, reason?, elapsed }`.

### `subscribe_events`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | *required* | Session ID |
| `events` | string[] | *required* | `["exit"]` and/or `["pattern_match"]` |
| `pattern` | string | — | Regex (required if `pattern_match` in events) |

Notifications are delivered as MCP logging messages with JSON payloads. Pattern match subscriptions auto-unsubscribe after the first match.

### `unsubscribe_events`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `subscriptionId` | string | *required* | Subscription ID from `subscribe_events` |

### `list_terminals`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tag` | string | — | Filter sessions by tag |

Returns all sessions with `id`, `pid`, `command`, `cwd`, `status`, `cols`, `rows`, `createdAt`, `lastActivityAt`, `name`, `tags`.

### `close_terminal`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | *required* | Session ID |

### `close_group`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tag` | string | *required* | Tag to match |

Closes all active sessions with the matching tag. Returns the count closed.

### `send_control`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | *required* | Session ID |
| `key` | string | *required* | Control key name |

Available keys: `ctrl+c`, `ctrl+d`, `ctrl+z`, `ctrl+\`, `ctrl+l`, `ctrl+a`, `ctrl+e`, `ctrl+k`, `ctrl+u`, `ctrl+w`, `ctrl+r`, `ctrl+p`, `ctrl+n`, `up`, `down`, `right`, `left`, `home`, `end`, `tab`, `enter`, `escape`, `backspace`, `delete`, `pageup`, `pagedown`

### `resize_terminal`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | *required* | Session ID |
| `cols` | number | *required* | New width (1–500) |
| `rows` | number | *required* | New height (1–200) |

### `health_check`

No parameters. Returns `{ version, uptime, sessions: { active, max }, memory: { rss, heapUsed, heapTotal } }`.

### `clear_history`

No parameters. Clears persisted stale session entries from previous server runs.

## MCP Resources

Sessions are also exposed as MCP resources at `terminal://sessions/{sessionId}`, returning session metadata and rendered screen content. The resource list updates automatically when sessions are created or closed.

## Web Dashboard

Enable the real-time web dashboard to monitor all terminals from your browser:

```json
{
  "mcpServers": {
    "forge": {
      "command": "npx",
      "args": ["forge-terminal-mcp", "--dashboard", "--port", "3141"]
    }
  }
}
```

Open `http://localhost:3141` to see:
- Live session list with status indicators
- Real-time terminal output via WebSocket
- Interactive input (type directly into sessions)
- Session switching sidebar

## Configuration

All settings follow the precedence: **CLI flag > environment variable > default**.

| Flag | Env Var | Default | Description |
|------|---------|---------|-------------|
| `--max-sessions` | `FORGE_MAX_SESSIONS` | 10 | Max concurrent PTY sessions |
| `--idle-timeout` | `FORGE_IDLE_TIMEOUT` | 1800000 | Session idle timeout in ms (30 min) |
| `--buffer-size` | `FORGE_BUFFER_SIZE` | 1048576 | Ring buffer size per session (1 MB) |
| `--shell` | `SHELL` | `/bin/bash` | Default shell for `create_terminal` |
| `--claude-path` | `FORGE_CLAUDE_PATH` | `claude` | Path to Claude CLI binary |
| `--dashboard` | `FORGE_DASHBOARD` | off | Enable web dashboard |
| `--port` | `FORGE_DASHBOARD_PORT` | 3141 | Dashboard port |
| `--verbose` | — | off | Enable debug logging to stderr |

Example with custom config:

```json
{
  "mcpServers": {
    "forge": {
      "command": "npx",
      "args": ["forge-terminal-mcp", "--max-sessions", "20", "--idle-timeout", "3600000", "--dashboard"]
    }
  }
}
```

## Architecture

```
Claude Code  ←─stdio─→  MCP Server (19 tools + 1 resource)
                              │
                         SessionManager
                         (lifecycle, groups, persistence)
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
               TerminalSession    TerminalSession    ...
               ┌─────────────┐
               │   node-pty   │  ← real PTY (colors, signals, TUI)
               │  RingBuffer  │  ← 1 MB circular, per-consumer cursors
               │ @xterm/headless │ ← server-side rendering
               └─────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         MCP Client      Dashboard WS    Event Subs
         (incremental)   (live stream)   (notifications)
```

- **Single Node.js process** — MCP server communicates over stdio (stdin/stdout for JSON-RPC)
- **All logging to stderr** — stdout is reserved for the MCP protocol
- **Ring buffer per session** — 1 MB circular buffer with cursor-based reads. When the buffer fills, old data is overwritten and `droppedBytes` tells the consumer how much was lost
- **Headless xterm per session** — full terminal emulation server-side. `read_screen` returns the rendered viewport, correctly handling cursor positioning, alternate screen, line wrapping
- **Idle timeout** — sessions auto-close after 30 minutes of inactivity (configurable)
- **Session persistence** — session metadata saved to `~/.forge/sessions.json`, reloaded as stale entries on restart
- **Event system** — subscribe to session exit or pattern match events, delivered as MCP logging messages

## Development

```bash
git clone https://github.com/ferodrigop/forge-terminal-mcp.git
cd forge-terminal-mcp
npm install
npm run build       # Compile with tsup
npm test            # 81 tests (unit + integration)
npm run typecheck   # TypeScript strict mode
npm run lint        # ESLint
npm run dev         # Watch mode
```

### Project Structure

```
src/
  cli.ts                        # Entry point, arg parsing, stdio transport
  server.ts                     # McpServer + 19 tool registrations + resources
  core/
    types.ts                    # ForgeConfig, SessionInfo, defaults
    ring-buffer.ts              # Circular buffer with multi-consumer cursors
    terminal-session.ts         # PTY + headless xterm + ring buffer
    session-manager.ts          # CRUD, max sessions, groups, persistence
    state-store.ts              # ~/.forge/sessions.json persistence
    templates.ts                # Built-in session templates
  dashboard/
    dashboard-server.ts         # HTTP + WebSocket server
    dashboard-html.ts           # Single-page web UI
    ws-handler.ts               # WebSocket message handling
  utils/
    logger.ts                   # stderr-only JSON logger
    config.ts                   # CLI flags > env vars > defaults
    control-chars.ts            # Named key → escape sequence map
test/
  unit/                         # ring-buffer, config, control-chars, state-store, templates
  integration/                  # terminal-session, session-manager, mcp-tools E2E
```

### Test Coverage

| Suite | Tests | Covers |
|-------|-------|--------|
| Ring Buffer | 13 | Circular writes, multi-consumer, wrap-around, dropped bytes |
| Config | 5 | CLI parsing, env vars, defaults, precedence |
| Control Chars | 6 | Key resolution, case insensitivity, unknown keys |
| State Store | 4 | Load/save round-trip, corruption handling |
| Templates | 3 | Lookup, unknown template, list all |
| Terminal Session | 8 | PTY spawn, read/write, screen render, resize, exit |
| Session Manager | 7 | CRUD, max limit, close all, stale entries |
| MCP Tools E2E | 35 | All 19 tools end-to-end via MCP client |
| **Total** | **81** | |

## Requirements

- Node.js >= 18
- macOS, Linux, or Windows (anywhere `node-pty` builds)

## License

MIT
