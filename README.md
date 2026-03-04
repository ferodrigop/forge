# Forge

Terminal MCP server for Claude Code. Spawn, manage, and monitor real PTY sessions as MCP tools.

## Why

Claude Code's built-in Bash tool runs one command at a time and waits for it to finish. Forge gives Claude persistent terminal sessions — start a dev server in one, run tests in another, tail logs in a third, all concurrently.

**Key differentiators vs. existing tools:**
- **Real PTY** via `node-pty` (same lib as VS Code terminal) — interactive programs, colors, TUI apps all work
- **Incremental reads** — ring buffer with per-consumer cursors means each `read_terminal` only returns NEW output, saving context window tokens
- **Clean screen reads** — `@xterm/headless` renders the terminal server-side, so `read_screen` returns exactly what a human would see (no ANSI escape codes)
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

Claude now has 8 new tools:

```
create_terminal  → Spawn a session (returns session ID)
write_terminal   → Send input (appends newline by default)
read_terminal    → Read NEW output since last read (incremental)
read_screen      → Get rendered viewport as clean text
list_terminals   → Show all sessions with status and PID
close_terminal   → Kill a session and free resources
send_control     → Send Ctrl+C, arrow keys, etc.
resize_terminal  → Change terminal dimensions
```

### Example Conversation

> **You:** Start a Next.js dev server and run the test suite in parallel
>
> **Claude:** *(creates two terminals, writes `npm run dev` to one and `npm test` to the other, polls `read_terminal` on each to report progress)*

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

Returns session info including the `id` used by all other tools.

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

Returns the current terminal viewport as plain text — rendered through a headless xterm instance. No ANSI codes, no escape sequences. Useful for TUI apps like `htop`, `vim`, or interactive prompts.

### `list_terminals`

No parameters. Returns all sessions with `id`, `pid`, `command`, `cwd`, `status`, `cols`, `rows`, `createdAt`, `lastActivityAt`.

### `close_terminal`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | *required* | Session ID |

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
| `cols` | number | *required* | New width (1-500) |
| `rows` | number | *required* | New height (1-200) |

## Configuration

All settings follow the precedence: **CLI flag > environment variable > default**.

| Flag | Env Var | Default | Description |
|------|---------|---------|-------------|
| `--max-sessions` | `FORGE_MAX_SESSIONS` | 10 | Max concurrent PTY sessions |
| `--idle-timeout` | `FORGE_IDLE_TIMEOUT` | 1800000 | Session idle timeout in ms (30 min) |
| `--buffer-size` | `FORGE_BUFFER_SIZE` | 1048576 | Ring buffer size per session (1 MB) |
| `--shell` | `SHELL` | `/bin/bash` | Default shell for `create_terminal` |
| `--verbose` | — | off | Enable debug logging to stderr |

Example with custom config:

```json
{
  "mcpServers": {
    "forge": {
      "command": "npx",
      "args": ["forge-terminal-mcp", "--max-sessions", "20", "--idle-timeout", "3600000"]
    }
  }
}
```

## Architecture

```
Claude Code  <--stdio-->  MCP Server  <-->  SessionManager  <-->  PTY Sessions
                          (8 tools)         (lifecycle)           (node-pty)
                                                                       |
                                                                  RingBuffer
                                                                  (incremental reads)
                                                                       |
                                                                  @xterm/headless
                                                                  (screen rendering)
```

- **Single Node.js process** — MCP server communicates over stdio (stdin/stdout for JSON-RPC)
- **All logging to stderr** — stdout is reserved for the MCP protocol
- **Ring buffer per session** — 1 MB circular buffer with cursor-based reads. When the buffer fills, old data is overwritten and `droppedBytes` tells the consumer how much was lost
- **Headless xterm per session** — full terminal emulation server-side. `read_screen` returns the rendered viewport, correctly handling cursor positioning, alternate screen, line wrapping, etc.
- **Idle timeout** — sessions auto-close after 30 minutes of inactivity (configurable)

## Development

```bash
git clone <repo>
cd forge
npm install
npm run build     # Compile with tsup
npm test          # 48 tests (unit + integration)
npm run typecheck # TypeScript strict mode
```

### Project Structure

```
src/
  cli.ts                     # Entry point, arg parsing, stdio transport
  server.ts                  # McpServer + 8 tool registrations
  core/
    types.ts                 # ForgeConfig, SessionInfo, defaults
    ring-buffer.ts           # Circular buffer with multi-consumer cursors
    terminal-session.ts      # PTY + headless xterm + ring buffer
    session-manager.ts       # CRUD + max sessions + lifecycle
  utils/
    logger.ts                # stderr-only JSON logger
    config.ts                # CLI flags > env vars > defaults
    control-chars.ts         # Named key -> escape sequence map
test/
  unit/                      # ring-buffer, config, control-chars
  integration/               # PTY sessions, session manager, MCP tools E2E
```

## Requirements

- Node.js >= 18
- macOS, Linux, or Windows (anywhere `node-pty` builds)

## License

MIT
