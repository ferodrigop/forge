# Running Shell Commands via Forge

## When to use
When you need to run shell commands (builds, tests, installs, scripts) through Forge terminals. Applies whenever you call `run_command`, `create_terminal`, or need to execute and capture command output.

## Instructions

### Quick path: `run_command` (preferred for commands that exit)
For commands that run to completion (builds, tests, installs, linters), use `run_command` — it creates a terminal, waits for exit, returns output, and auto-cleans up in one call.

- Set `command` to the executable (e.g., `"npm"`, `"bun"`, `"git"`)
- Set `args` to the argument list (e.g., `["run", "build"]`)
- Set `cwd` to the working directory
- Default timeout is 60s; set `timeout` up to 300000ms for slow builds
- Chain commands with `&&` in the command string: `command: "sh", args: ["-c", "npm install && npm run build"]`

### Manual path: `create_terminal` + `run_command`/`wait_for`
Use this when you need more control (e.g., inspect output mid-run, keep session alive).

1. **Create the terminal**: `create_terminal` with optional `command`, `cwd`, `name`, `tags`
2. **Run commands**: Use `write_terminal` to send commands, or start with a command directly in `create_terminal`
3. **Wait for completion**: Use `wait_for` with `waitForExit: true` for commands that terminate
4. **Read output**: Use `read_terminal` for incremental output (only new data since last read) or `read_screen` for the current viewport snapshot
5. **Clean up**: Use `close_terminal` when done

### For long-running processes (servers, watchers)
- Start with `create_terminal` (not `run_command`, which expects exit)
- Use `wait_for` with a `pattern` to detect readiness (e.g., `"ready on port"`, `"listening"`, `"compiled successfully"`)
- Use `read_screen` to see the current state of the terminal at any point
- Keep the session alive — don't expect it to exit

### Key rules
- Always use `waitForExit: true` in `wait_for` for commands that terminate (builds, tests, installs)
- Always use `pattern` in `wait_for` for servers/watchers that don't exit
- After `wait_for` completes, use `read_terminal` to get the full output
- Set appropriate timeouts — builds may need more than the 30s default on `wait_for`

## Examples

### Run tests with `run_command`
```
run_command({
  command: "bun",
  args: ["run", "test"],
  cwd: "/path/to/project",
  timeout: 120000
})
```
Returns `{ exitCode, output, duration }` — no cleanup needed.

### Start a dev server and wait for it to be ready
```
// 1. Create terminal
create_terminal({
  command: "npm",
  args: ["run", "dev"],
  cwd: "/path/to/project",
  name: "dev-server",
  tags: ["server", "frontend"]
})
// Returns { id: "abc123", ... }

// 2. Wait for ready signal
wait_for({
  id: "abc123",
  pattern: "ready on|localhost:\\d+",
  timeout: 30000
})

// 3. Check current screen
read_screen({ id: "abc123" })
```
