# Monitoring Running Processes and Agents

## When to use
When you need to monitor, search, or react to terminal output in real time. Applies when using `subscribe_events`, `grep_terminal`, `wait_for` for pattern matching, or any workflow where you need to watch for specific output.

## Instructions

### Searching output: `grep_terminal`
Search a terminal's full output buffer with regex — much more efficient than reading the entire buffer when looking for specific content.

```
grep_terminal({
  id: "abc123",
  pattern: "ERROR|WARN",
  context: 2
})
```
Returns `{ matches: [{ lineNumber, text, context }], totalMatches }`.

- Use regex patterns: `"error|fail|exception"` for errors, `"\\d+\\.\\d+s"` for timings
- Set `context` (0-10) for surrounding lines around each match
- The regex is applied per-line with the global and multiline flags

### Waiting for patterns: `wait_for`
Block until a pattern appears in terminal output. Checks existing buffer first, then watches live output.

```
wait_for({
  id: "abc123",
  pattern: "Server listening on port \\d+",
  timeout: 30000
})
```

Use cases:
- Wait for a server to be ready: `pattern: "listening|ready|started"`
- Wait for compilation: `pattern: "compiled|built|done"`
- Wait for a specific error: `pattern: "FATAL|panic"`
- Wait for process exit: `waitForExit: true` (no pattern needed)

Returns `{ matched: true/false, data, elapsed }`. If `matched: false`, check `reason` — either `"timeout"` or `"session_exited"`.

### Real-time event subscriptions: `subscribe_events`
Subscribe to session events and receive MCP logging notifications. Two event types:

**`exit`** — fires when the process exits:
```
subscribe_events({
  id: "abc123",
  events: ["exit"]
})
```

**`pattern_match`** — fires when output matches a regex (auto-unsubscribes after first match):
```
subscribe_events({
  id: "abc123",
  events: ["pattern_match"],
  pattern: "error|crash|panic"
})
```

Returns `{ subscriptionId }`. Use `unsubscribe_events({ subscriptionId: "sub-id-here" })` to cancel.

### Combining patterns for automation
Chain `wait_for` calls to orchestrate multi-step workflows:

1. Start a process
2. `wait_for` readiness pattern
3. Run dependent command
4. `wait_for` that command's completion

## Examples

### Watch a build for errors
```
// 1. Start build
create_terminal({
  command: "npm", args: ["run", "build"],
  name: "build", tags: ["build"]
})
// → { id: "build-123" }

// 2. Wait for completion
wait_for({ id: "build-123", waitForExit: true, timeout: 120000 })

// 3. Search for errors in output
grep_terminal({ id: "build-123", pattern: "error TS\\d+|ERROR", context: 3 })
```

### Monitor a server and react to crashes
```
// 1. Subscribe to exit events
subscribe_events({
  id: "server-456",
  events: ["exit"]
})

// 2. Subscribe to error patterns
subscribe_events({
  id: "server-456",
  events: ["pattern_match"],
  pattern: "FATAL|unhandled rejection|segfault"
})
// Notifications arrive as MCP logging messages when matched
```

### Orchestrate dependent services
```
// 1. Start database
create_terminal({ command: "docker", args: ["compose", "up", "db"], name: "db", tags: ["infra"] })
wait_for({ id: "db-id", pattern: "ready for connections", timeout: 30000 })

// 2. Run migrations (only after DB is ready)
run_command({ command: "npm", args: ["run", "migrate"], cwd: "/project" })

// 3. Start API server
create_terminal({ command: "npm", args: ["run", "start"], name: "api", tags: ["server"] })
wait_for({ id: "api-id", pattern: "listening on port", timeout: 15000 })
```
