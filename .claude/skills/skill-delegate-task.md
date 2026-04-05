# Delegating Tasks to AI Agents

## When to use
When you need to delegate work to another AI agent (Claude, Codex, or Gemini) using Forge's `delegate_task` tool. This covers both fire-and-forget tasks and multi-turn interactive sessions.

## Instructions

### Choosing a mode

**Oneshot mode** (default) — agent processes the prompt and exits. Best for:
- Autonomous, well-defined tasks (write a function, fix a bug, generate tests)
- Tasks that don't need iterative feedback
- Parallel work — spawn multiple oneshot agents simultaneously

**Interactive mode** (`mode: "interactive"`) — agent stays alive between turns. Best for:
- Iterative work requiring review and course correction
- Complex tasks where you need to inspect progress and redirect
- Pair programming or code review workflows

### Oneshot delegation

```
delegate_task({
  agent: "claude",
  prompt: "Add input validation to the signup form in src/components/SignupForm.tsx",
  cwd: "/path/to/project",
  timeout: 300000
})
```

Returns `{ status, output, exitCode, duration }`. Status is `"completed"` (exit 0) or `"failed"` (non-zero exit).

### Interactive delegation

**First call — spawn the agent:**
```
delegate_task({
  agent: "claude",
  prompt: "Review the auth middleware in src/middleware/auth.ts and suggest improvements",
  mode: "interactive",
  cwd: "/path/to/project"
})
```
Returns `{ status: "awaiting_followup", sessionId: "abc123", output, ... }`.

**Follow-up calls — continue the conversation:**
```
delegate_task({
  sessionId: "abc123",
  prompt: "Good suggestions. Now implement the rate limiting change you proposed.",
  from: "orchestrator"
})
```
Use the `sessionId` from the first call. The `from` field labels who is speaking.

### Response status values
- `"completed"` — agent finished successfully (exit code 0)
- `"failed"` — agent exited with non-zero exit code
- `"timeout"` — agent didn't finish within the timeout; session still alive
- `"awaiting_followup"` — interactive agent finished its turn, waiting for next message

### Using worktrees for isolated changes
When the delegate needs to modify files without affecting your working tree:

```
delegate_task({
  agent: "claude",
  prompt: "Refactor the database layer to use connection pooling",
  cwd: "/path/to/project",
  worktree: true,
  branch: "feature/connection-pooling"
})
```

This creates a git worktree so the agent works on an isolated branch. Changes can be reviewed and merged via PR.

### Tips
- Set `cwd` explicitly — agents don't inherit the caller's working directory
- Use `model` to pick a specific model (e.g., `"sonnet"` for faster/cheaper tasks, `"opus"` for complex ones)
- Use `maxBudget` to cap spending on Claude agents (in USD)
- Use `from` to label orchestrator identity when multiple agents coordinate
- For timed-out sessions, use `read_terminal` with the `sessionId` to check progress, or `close_terminal` to kill it

## Examples

### Parallel oneshot tasks
```
// Spawn 3 agents simultaneously for independent tasks
delegate_task({ agent: "claude", prompt: "Write unit tests for UserService", cwd: "/project" })
delegate_task({ agent: "claude", prompt: "Write unit tests for AuthService", cwd: "/project" })
delegate_task({ agent: "claude", prompt: "Write unit tests for PaymentService", cwd: "/project" })
```

### Interactive code review with worktree
```
// 1. Start review
delegate_task({
  agent: "claude",
  prompt: "Review src/api/routes.ts for security issues",
  mode: "interactive",
  cwd: "/project",
  worktree: true,
  branch: "fix/security-review"
})
// → { status: "awaiting_followup", sessionId: "xyz789" }

// 2. Ask for fixes
delegate_task({
  sessionId: "xyz789",
  prompt: "Fix the SQL injection vulnerability you found and add parameterized queries"
})
// → { status: "awaiting_followup", sessionId: "xyz789" }

// 3. Finalize
delegate_task({
  sessionId: "xyz789",
  prompt: "Commit the changes and create a PR"
})
```
