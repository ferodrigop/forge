# Forge Roadmap

# March 2026 — V0.1 to V0.7 (Completed)

> All features in this section were completed and shipped. 21 tools, 144 tests, Preact dashboard with chat browser.

---

## Core Terminal Engine

1. [x] PTY Session Management — Spawn, list, close real PTY sessions via `node-pty`. Session IDs, names, tags, configurable buffer sizes and dimensions. `M`

2. [x] Ring Buffer — 1MB circular buffer per session with per-consumer cursors. Incremental reads return only NEW output since last read. Dropped byte tracking on wrap-around. `M`

3. [x] Headless Terminal Rendering — `@xterm/headless` renders terminal server-side. `read_screen` returns clean text (no ANSI codes). Handles cursor positioning, alternate screen, line wrapping. `M`

4. [x] Incremental Read with 30KB Cap — `read_terminal` caps output per call to prevent MCP token overflow. Full buffer available via `grep_terminal` and `wait_for`. `S`

5. [x] Session Templates — Built-in presets (shell, next-dev, vite-dev, docker-compose, npm-test, npm-test-watch) with auto `waitFor` pattern detection. `S`

6. [x] Control Keys — `send_control` supports 26 named keys (ctrl+c, arrows, tab, escape, etc.) mapped to escape sequences. Case-insensitive. `S`

7. [x] Batch Read — `read_multiple` reads up to 20 sessions in one call. Per-session error handling, partial results always returned. `S`

8. [x] Session Persistence — Metadata saved to `~/.forge/sessions.json`. Reloaded as stale entries on restart for retrospective debugging. `S`

9. [x] Idle Timeout — Auto-close sessions after 30 minutes of inactivity (configurable). Prevents resource leaks. `S`

10. [x] CLAUDECODE Stripping — Spawned terminals have `CLAUDECODE` env var removed to prevent nesting errors when Forge runs inside Claude Code. `S`

## Pattern Matching & Events

11. [x] Pattern Waiting — `wait_for` blocks until regex matches terminal output. Checks existing buffer first (instant match), then watches live output. Timeout with reason. `M`

12. [x] Wait for Exit — `waitForExit` option on `wait_for` waits for process exit instead of pattern matching. Returns exit code. Instant return if already exited. `S`

13. [x] Grep Terminal — Regex search across full session buffer with configurable context lines. Returns line numbers, matched text, and surrounding context. `S`

14. [x] Event Subscriptions — Subscribe to session exit or pattern_match events. Notifications delivered as MCP logging messages. Pattern subscriptions auto-unsubscribe after first match. `M`

## Agent Orchestration

15. [x] Spawn Claude — Launch Claude Code sub-agents in dedicated PTY sessions. Auto-tag with `claude-agent`. Configurable model, budget, allowed tools. `M`

16. [x] Git Worktree Isolation — `worktree: true` on `spawn_claude` creates isolated git worktree for each agent. File changes don't conflict between parallel agents. `M`

17. [x] One-Shot Mode — `oneShot: true` runs Claude in `--print` mode (process prompt and exit) vs. interactive. `S`

18. [x] Run Command — `run_command` tool runs a command to completion, returns output + exit code + duration, auto-cleans up. 100KB output cap. Session preserved on timeout for inspection. `M`

19. [x] Session Groups — Tag-based grouping with `close_group` for batch cleanup. `list_terminals` with tag filter. `S`

## Dashboard

20. [x] Web Dashboard — Preact + htm + Preact Signals UI served on configurable port. Zero build step — loaded from CDN, bundled as string constants. Tokyo Night theme. `L`

21. [x] Live Terminal Output — xterm.js rendering with WebSocket streaming. Interactive input from browser. Auto-follow mode for new sessions. `M`

22. [x] Activity Log — Real-time tool call timeline for Claude agent sessions. Icons per tool type, error indicators, timestamps. `M`

23. [x] Chat History Browser — Scan, search, browse, and continue past Claude Code conversations. Grouped by project. Delete with confirmation. `L`

24. [x] Session Management UI — Create terminals via modal, close sessions, switch between terminals. Session grouping by tags and working directory. Memory monitoring per session. `M`

## History & Diagnostics

25. [x] Command History — JSONL persistence of tool calls per session at `~/.forge/history/`. Event types: session_init, tool_call, tool_result. `M`

26. [x] Stream JSON Parser — Extracts Claude's internal JSON-RPC events from terminal output. Converts to HistoryEvents for activity log and persistence. `M`

27. [x] Get Session History Tool — `get_session_history` retrieves timestamped tool call history for Claude agent sessions. `S`

28. [x] Health Check — Server version, uptime, active session count, memory usage (RSS, heap). `S`

29. [x] Revive Terminal — One-click revival of exited sessions (idle timeout, lid close, etc.) with same command, cwd, name, tags, and dimensions. MCP tool + dashboard button. `S`

---

# Next — Publishing & Polish

> Preparing Forge for public release on npm.

---

## Publishing Prerequisites

30. [ ] npm Publish — Package `forge-terminal-mcp` to npm registry. Verify `npx forge-terminal-mcp` works out of the box. `S`

31. [ ] Dynamic npm Badges — Replace static version/test badges in README with shields.io dynamic badges linked to npm and CI. `S`

32. [ ] GitHub Actions CI — Typecheck + build + test on PR. Branch protection requiring CI pass. `M`

33. [ ] GitHub Release v0.7.0 — Tag, release notes summarizing all features since inception. `S`

34. [ ] CHANGELOG.md — Retroactive changelog covering v0.1.0 through v0.7.0. `S`

## Documentation

35. [ ] CONTRIBUTING.md — PR guidelines, code style, test requirements, architecture overview link. `S`

36. [ ] Issue Templates — Bug report (OS, Node version, Claude Code version, repro steps) and feature request templates. `S`

37. [ ] Document `fromSession` Param — `spawn_claude` has undocumented `fromSession` parameter (inherit cwd from existing session). Add to README tools reference. `S`

38. [ ] Best Practices Guide — Document patterns discovered during benchmarking: use `run_command` for short-lived commands, `waitForExit` over pattern guessing, `&&` chaining, when to use `create_terminal` vs `run_command`. `M`

---

# Future — Dashboard & UX Improvements

> Enhancements driven by benchmarking and real-world usage feedback.

---

## Dashboard Gaps

39. [ ] Stream `spawn_claude` Activity — Dashboard is blank during `spawn_claude` sessions until final summary prints. Stream Claude's tool calls in real-time so users can watch agents work. Biggest UX gap from benchmarking. `L`

40. [ ] Dashboard Screenshots for README — Record demo GIFs or screenshots showing: terminal sessions, activity log, chat browser. Essential for npm/GitHub discoverability. `M`

41. [ ] Dashboard Auth — Optional password protection for the web dashboard. Currently anyone on localhost can access. `S`

## Developer Experience

42. [ ] Custom User Templates — Allow users to define templates via config file (e.g., `~/.forge/templates.json`). Current templates are hardcoded. `M`

43. [ ] Session Recording / Replay — Asciinema-style timestamped capture of terminal sessions. Replay in dashboard or export for sharing. `L`

44. [ ] Notification Sounds — Optional audio alert in dashboard when a session exits or matches a pattern. `S`

---

# Future — Platform Expansion

> Extend Forge beyond local development.

---

## Desktop App

50. [ ] Electron Desktop App MVP — BrowserWindow with in-process daemon, hidden title bar inset, window state persistence, system tray with session count. `L`

51. [ ] Tray + Menu + Notifications — Menu bar icon, macOS app menu, close-to-tray, native notifications on session created/exited. `M`

52. [ ] Auto-Launch + Auto-Update — Login item registration, electron-updater with GitHub Releases. `S`

53. [ ] Offline Frontend Assets — Bundle Preact/xterm.js/htm locally instead of CDN for offline use. `M`

54. [ ] Code Signing + Notarization — Apple Developer cert, hardened runtime, electron-builder afterSign hook. Required for DMG distribution. `M`

## Distribution

55. [ ] GitHub Releases — Build DMG + ZIP on tag push, upload to GitHub Releases. Universal binary (arm64 + x64). `M`

56. [ ] Homebrew Cask — `brew install --cask forge` formula pointing to GitHub Release DMG. Submit PR to homebrew-cask. `S`

## MCP Registry & Protocols

57. [ ] Publish to MCP Registry — `server.json` prepared. Run `mcp-publisher publish` to list Forge on `registry.modelcontextprotocol.io` for discoverability. Supports both stdio (npm) and HTTP transports. `S`

58. [ ] `delegate_task` MCP Tool — Allow one agent to delegate a subtask to another (e.g., Claude asks Codex to review code). Forge spawns the target agent, waits for completion, returns structured results. Practical agent-to-agent collaboration without full A2A protocol. `L`

59. [ ] MCP Tasks Primitive — Adopt the experimental Tasks spec (SDK v1.24+) for long-running tools (`spawn_claude`, `spawn_codex`, `run_command`). Return task IDs instead of blocking. Wait for spec to stabilize and clients to adopt. `L`

60. [ ] A2A Protocol Support — Expose spawned agents as A2A-compatible endpoints with Agent Cards. Enable external agents to discover and delegate tasks through Forge. Wait for Claude Code/Codex to support A2A natively. `XL`

## Cross-Platform

45. [ ] Windows ConPTY Testing — `node-pty` supports ConPTY but spawn-helper and shell defaults are Unix-only. Test and fix for Windows users. `M`

46. [ ] Docker Support — Run Forge inside containers. PTY in Docker requires specific configuration. Document and test. `M`

## Multi-Client

47. [ ] Remote Sessions / SSH — Spawn sessions on remote hosts via SSH. Manage remote terminals from local Claude Code. `L`

48. [ ] Multiple MCP Clients — Allow multiple Claude Code instances to share the same Forge server. Ring buffer already supports multi-consumer cursors — needs session discovery and auth. `L`

49. [ ] VS Code Extension — Expose Forge sessions as VS Code terminal tabs. Bridge between Claude Code agent output and VS Code's terminal panel. `L`

---

> Notes
> - Items 1–29 (v0.1–v0.7) were all completed in March 2026
> - Publishing prerequisites (30–34) are the immediate priority — blocks all external adoption
> - Dashboard streaming (#39) is the highest-impact UX improvement from benchmarking
> - `run_command` (#18) and `waitForExit` (#12) were added specifically to address benchmark findings
> - Desktop app (50–54) scaffolding done on `feature/desktop-app` branch — Phases 1-3 implemented
> - Distribution: GitHub Releases (#55) first, then Homebrew Cask (#56) for maximum Mac developer reach
> - MCP Registry (#57) is a quick win — `server.json` ready, just needs `mcp-publisher publish`
> - `delegate_task` (#58) is the practical path to agent-to-agent — no protocol dependency
> - MCP Tasks (#59) and A2A (#60) are watch-and-wait — specs still evolving, no client support yet
> - ACP (IBM) was archived Aug 2025 and merged into A2A — not worth separate investment
> - Cross-platform and multi-client features are community-driven — implement based on demand
> - Size estimates: S (~1 day), M (~2-3 days), L (~1 week), XL (~2+ weeks)
