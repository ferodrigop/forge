# Implement Claude/Codex Launcher Support in `forge`

> Merge target: this feature is intended to be implemented and merged in `/Users/rodrigopineda/Progra/work/ravn/ravn_labs/forge`.

## Summary
- This feature enables users to choose between `Terminal`, `Claude Code`, and `Codex` when launching sessions in Forge.
- Codex support will be first-class in both MCP and dashboard flows.
- Codex launch will support both `interactive` and `oneShot` modes, with dashboard exposing interactive only.

## Implementation Changes
- Add Codex runtime configuration:
  - Add `codexPath` to config/types/defaults.
  - Add CLI/env support: `--codex-path`, `FORGE_CODEX_PATH`.
  - Update CLI help text and README config table.
- Add MCP tool `spawn_codex` with both modes:
  - Parameters: `mode` (`interactive` default | `oneShot`), `prompt`, `cwd`, `fromSession`, `model`, `name`, `tags`, `bufferSize`.
  - `interactive`: launch configured Codex binary as persistent PTY session.
  - `oneShot`: launch `codex exec`; require `prompt`.
  - Auto-add `codex-agent` tag and merge custom tags without duplicates.
  - Preserve exited session data for inspection, consistent with agent sessions.
- Extend dashboard launch behavior:
  - Extend `POST /api/sessions` payload with optional `agent` (`claude` | `codex`) so backend resolves command from configured paths.
  - Keep generic command-based creation unchanged.
  - Add `Codex` option to the per-directory launcher popover in the sidebar.
  - Keep one-shot Codex exposure MCP-only in this phase (no one-shot dashboard form).
- Preserve existing Claude-specific behavior:
  - Keep chat browser/continue and Claude stream-json history parsing scoped to `claude-agent`.
  - Do not add Codex chat/history parsing in this phase.

## Public Interface Changes
- New MCP tool: `spawn_codex`.
- Extended dashboard API request shape: optional `agent` on `POST /api/sessions`.
- New configuration surface: `codexPath`, `--codex-path`, `FORGE_CODEX_PATH`.

## Test Plan
- Unit tests:
  - Config parsing for `codexPath` via defaults, env vars, and CLI precedence.
- Integration tests:
  - `spawn_codex` interactive creation, tag defaults/merge behavior, and naming behavior.
  - `spawn_codex` one-shot mode with required prompt validation.
  - `fromSession` cwd inheritance and invalid-session error handling.
  - `POST /api/sessions` with `agent: "codex"` and `agent: "claude"` command/tag resolution.
- Regression tests:
  - Existing `spawn_claude`, `create_terminal`, terminal listing/filtering, and dashboard session creation remain unchanged.

## Assumptions
- Codex binary is installed and available via PATH unless overridden with `--codex-path`/`FORGE_CODEX_PATH`.
- One-shot mode is implemented using `codex exec`.
- Codex-specific chat-history browsing/status parsing is out of scope for this iteration.

## Follow-up Roadmap (scoped out of this iteration)

### Codex chat/history parsing
- Add a Codex-specific stream parser (equivalent to `StreamJsonParser` for Claude).
- Wire it into `session-manager.ts` for sessions tagged `codex-agent`.
- Enable the activity log and `get_session_history` MCP tool for Codex sessions.
- Requires understanding Codex's output format (may differ from Claude's `--output-format stream-json`).

### Codex chat browser in dashboard
- Scan Codex chat session files on disk (equivalent to `ClaudeChats` for Claude).
- Add `/api/codex-chats` REST endpoints for listing, reading, and deleting Codex sessions.
- Add a "Codex Chats" tab or filter in the dashboard Chats panel.
- Support `/api/codex-chats/:id/continue` for resuming Codex sessions.

### Codex status detection (blocked state)
- Detect when a Codex session is waiting for user input (equivalent to `claudeState: "blocked"`).
- Surface the blocked indicator (!) in the sidebar for Codex sessions.

### Worktree support for `spawn_codex`
- Port the `worktree` + `branch` parameters from `spawn_claude` to `spawn_codex`.
- Allows Codex agents to run in isolated git worktrees.

### One-shot dashboard form
- Add a one-shot prompt input form in the dashboard for Codex (and optionally Claude).
- Currently one-shot mode is MCP-only; a dashboard form would let users trigger `codex exec` from the UI.

### Dashboard `POST /api/sessions` integration tests
- Add integration tests for `POST /api/sessions` with `agent: "codex"` and `agent: "claude"` verifying command/tag resolution against configured paths.
