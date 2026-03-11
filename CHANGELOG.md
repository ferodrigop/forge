# Changelog

All notable changes to Forge are documented in this file.

## [0.8.0] — 2026-03-11

### Added
- **Code Review Panel** — right-side panel with git diff viewer, stage/unstage, discard, commit, stash push/pop/list, branch info with ahead/behind counts. Toggle via top bar button or `Cmd+Shift+B`.
- **Folder Picker Tree** — ForkLift-style expandable tree in New Terminal modal. Chevron expands/collapses, click selects, double-click opens as new root.
- **Collapsible Sidebar** — persistent top bar with toggle button. Sidebar fully hides at 0px width. Toggle via button or `Cmd+B`.
- **Keyboard Shortcuts** — `Cmd+B` sidebar, `Cmd+Shift+B` code review, `Escape` close modals.
- **Chat Search** — Enter-to-search with search icon, clear button, results count, folder grouping.
- **Delegate Session Badges** — sidebar badges showing oneshot/interactive mode for delegate_task sessions.
- **File Status Badges** — "New" (green), "Deleted" (red), "Renamed" (cyan) badges in code review.
- **Offline Desktop Assets** — Preact, xterm.js, htm, signals bundled locally for offline desktop app use.
- **Universal Binary** — desktop app builds as universal (arm64 + x64) macOS binary.
- **`delegate_task` MCP Tool** — delegate subtasks from one agent to another (Claude or Codex) with oneshot/interactive modes.

### Fixed
- Chat search broken due to stale event reference in debounced handler.
- Traffic light button alignment in desktop app.
- Desktop app ESM module loading in packaged builds.

## [0.7.0] — 2026-03

### Added
- **Desktop App MVP** — Electron shell with in-process daemon, hidden title bar, window state persistence, system tray with session count.
- **Tray + Menu** — menu bar icon, macOS app menu, close-to-tray behavior, native notifications on session events.
- **Auto-Launch** — login item registration for starting Forge at system boot.
- **Codex Agent Support** — `spawn_codex` tool for launching OpenAI Codex sub-agents alongside Claude.
- **Chat History Browser** — scan, search, browse, and continue past Claude Code and Codex conversations grouped by project.
- **Stream JSON Parser** — real-time extraction of Claude's internal tool calls from terminal output for activity log.
- **Revive Terminal** — one-click revival of exited sessions with same command, cwd, name, tags, and dimensions.

## [0.6.0] — 2026-03

### Added
- **Web Dashboard** — Preact + htm + Preact Signals UI with Tokyo Night theme, served on configurable port.
- **Live Terminal Output** — xterm.js rendering with WebSocket streaming and interactive input from browser.
- **Activity Log** — real-time tool call timeline for Claude agent sessions with icons per tool type.
- **Session Management UI** — create terminals via modal, close sessions, switch between terminals with tag-based grouping.

## [0.5.0] — 2026-03

### Added
- **Spawn Claude** — launch Claude Code sub-agents in dedicated PTY sessions with configurable model, budget, and allowed tools.
- **Git Worktree Isolation** — `worktree: true` creates isolated git worktrees for parallel agents.
- **One-Shot Mode** — `oneShot: true` runs Claude in `--print` mode.
- **Run Command** — `run_command` tool runs a command to completion, returns output + exit code + duration.
- **Session Groups** — tag-based grouping with `close_group` for batch cleanup.

## [0.4.0] — 2026-03

### Added
- **Event Subscriptions** — subscribe to session exit or pattern match events with MCP logging notifications.
- **Command History** — JSONL persistence of tool calls per session.
- **Health Check** — server version, uptime, active session count, memory usage.

## [0.3.0] — 2026-03

### Added
- **Pattern Waiting** — `wait_for` blocks until regex matches terminal output with timeout.
- **Wait for Exit** — `waitForExit` option on `wait_for` for process completion.
- **Grep Terminal** — regex search across full session buffer with context lines.

## [0.2.0] — 2026-03

### Added
- **Session Templates** — built-in presets (shell, next-dev, vite-dev, docker-compose, npm-test).
- **Control Keys** — `send_control` supports 26 named keys mapped to escape sequences.
- **Batch Read** — `read_multiple` reads up to 20 sessions in one call.
- **Session Persistence** — metadata saved to `~/.forge/sessions.json`.
- **Idle Timeout** — auto-close sessions after 30 minutes of inactivity.

## [0.1.0] — 2026-03

### Added
- **PTY Session Management** — spawn, list, close real PTY sessions via `node-pty`.
- **Ring Buffer** — 1MB circular buffer per session with per-consumer cursors and incremental reads.
- **Headless Terminal Rendering** — `@xterm/headless` for clean text reads without ANSI codes.
- **Incremental Read** — 30KB cap per call to prevent MCP token overflow.
