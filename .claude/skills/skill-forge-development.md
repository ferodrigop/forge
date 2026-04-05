# Contributing to Forge

## When to use
When working on the forge-terminal-mcp codebase itself — building, testing, debugging, or adding features to Forge.

## Instructions

### Build and test
- **Build**: `bun run build` — compiles TypeScript to `dist/`
- **Test**: `bun run test` — runs vitest test suite
- **Dev**: `bun run dev` — runs the server in development mode
- Always run build + test before committing changes

### Project structure
- `src/server.ts` — Main MCP server with all tool definitions (create_terminal, run_command, delegate_task, etc.)
- `src/cli.ts` — CLI entry point, argument parsing, stdio/SSE transport setup
- `src/core/session-manager.ts` — Session lifecycle management (create, destroy, read, write)
- `src/core/types.ts` — Config types (`ForgeConfig`) and shared interfaces
- `src/core/templates.ts` — Pre-built session templates (shell, next-dev, npm-test, etc.)
- `src/utils/` — Utilities (config loading, control characters, etc.)
- `src/dashboard/` — Web dashboard (Preact + esbuild), accessible via SSE transport
- `tests/` — Vitest tests using `InMemoryTransport` for MCP E2E testing

### Testing patterns
Tests use `@modelcontextprotocol/sdk`'s `InMemoryTransport` to create in-process MCP client/server pairs:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const { server, manager } = createServer(config);
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: "test", version: "1.0" });
await client.connect(clientTransport);

// Call tools via client
const result = await client.callTool({ name: "create_terminal", arguments: { ... } });
```

### Key conventions
- All tools are defined in `src/server.ts` as `server.tool(name, description, schema, handler)`
- Zod is used for input validation schemas
- Config is resolved through `ConfigManager` (live) or plain `ForgeConfig` (static)
- Sessions are managed by `SessionManager` which wraps node-pty
- The dashboard is a single-page Preact app built with esbuild at build time

## Examples

### Adding a new tool
1. Add the tool definition in `src/server.ts` following the existing pattern:
```typescript
server.tool(
  "my_tool",
  "Description of what the tool does.",
  { param: z.string().describe("Param description") },
  async (params) => {
    // implementation
    return { content: [{ type: "text" as const, text: "result" }] };
  }
);
```
2. Add tests in `tests/` using InMemoryTransport
3. Run `bun run build && bun run test`

### Running the test suite
```
bun run test           # all tests
bun run test -- -t "pattern"  # filter by test name
```
