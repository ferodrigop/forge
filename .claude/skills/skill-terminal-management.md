# Terminal Lifecycle Management

## When to use
When you need to manage Forge terminal sessions — creating, listing, reading, organizing, or cleaning up terminals. Applies when working with `list_terminals`, `close_terminal`, `close_group`, `read_terminal`, `read_screen`, or `create_terminal`.

## Instructions

### Before creating terminals
Always check for existing sessions first with `list_terminals`. Reuse sessions when possible instead of creating new ones. Filter by tag to find relevant sessions:

```
list_terminals({ tag: "build" })
```

### Creating terminals
- Use `name` for human-readable identification (e.g., `"frontend dev server"`)
- Use `tags` for organizing and grouping (e.g., `["server", "frontend"]`, `["build", "backend"]`)
- Tags enable bulk operations via `close_group` and filtered listing via `list_terminals`

### Reading terminal output

**`read_terminal`** — Incremental reads (only new output since last read). Token-efficient. Use for:
- Checking progress after `wait_for` completes
- Polling for output changes
- Reading command results

**`read_screen`** — Current viewport snapshot (what a human would see on screen). Use for:
- TUI / interactive applications (vim, top, htop, less)
- Seeing the current state of a terminal with cursor-based UI
- When incremental reads don't make sense (screen redraws)

**`read_multiple`** — Read output from multiple sessions in one call. Use for:
- Monitoring several processes at once
- Dashboard-style status checks

**`grep_terminal`** — Search terminal output with regex. Use for:
- Finding errors or warnings in large output buffers
- Extracting specific values (ports, URLs, counts) without reading the entire buffer

### Organizing with tags
Tags are the primary mechanism for organizing sessions:
- Use descriptive tags: `["build", "frontend"]`, `["test", "integration"]`, `["server", "api"]`
- Agent sessions get auto-tagged: `"claude-agent"`, `"codex-agent"`, `"gemini-agent"`
- Worktree sessions get: `"worktree"`, `"branch:<name>"`
- `run_command` sessions get: `"run-command"`

### Cleaning up
- `close_terminal({ id: "abc123" })` — kill a specific session
- `close_group({ tag: "build" })` — kill all sessions with a matching tag
- Always clean up sessions you no longer need to free resources
- For `run_command`, cleanup is automatic — no action needed

### Templates
Use `list_templates` to see pre-configured session templates, then `create_from_template` to create sessions from them:

```
create_from_template({ template: "npm-test", cwd: "/project" })
```

## Examples

### Monitor multiple services
```
// 1. Check what's already running
list_terminals()

// 2. Create tagged sessions
create_terminal({
  command: "npm", args: ["run", "dev"],
  cwd: "/project/frontend",
  name: "frontend", tags: ["server", "frontend"]
})
create_terminal({
  command: "npm", args: ["run", "start"],
  cwd: "/project/api",
  name: "api-server", tags: ["server", "api"]
})

// 3. Read all server outputs at once
read_multiple({ ids: ["frontend-id", "api-id"] })

// 4. Clean up all servers when done
close_group({ tag: "server" })
```

### Debug a failing process
```
// 1. Search for errors without reading the full buffer
grep_terminal({ id: "abc123", pattern: "error|Error|ERROR", context: 3 })

// 2. Check the current screen state
read_screen({ id: "abc123" })
```
