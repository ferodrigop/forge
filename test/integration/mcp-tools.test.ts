import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { DEFAULT_CONFIG } from "../../src/core/types.js";
import type { SessionManager } from "../../src/core/session-manager.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("MCP Tools E2E", () => {
  let client: Client;
  let server: McpServer;
  let manager: SessionManager;

  beforeEach(async () => {
    const result = createServer({ ...DEFAULT_CONFIG, idleTimeout: 0 });
    server = result.server;
    manager = result.manager;

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "1.0" }, { capabilities: { resources: {} } });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    manager.closeAll();
    await client.close();
    await server.close();
  });

  it("list_terminals returns empty initially", async () => {
    const result = await client.callTool({ name: "list_terminals", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toBe("No active sessions");
  });

  it("create_terminal spawns a session", async () => {
    const result = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const info = JSON.parse(text);
    expect(info.status).toBe("running");
    expect(info.command).toBe("/bin/sh");
    expect(info.id).toBeDefined();
  });

  it("create_terminal with name and tags", async () => {
    const result = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", name: "my-shell", tags: ["dev", "test"] },
    });
    const info = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(info.name).toBe("my-shell");
    expect(info.tags).toEqual(["dev", "test"]);
  });

  it("list_terminals shows names", async () => {
    await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", name: "named-session" },
    });

    const listResult = await client.callTool({ name: "list_terminals", arguments: {} });
    const sessions = JSON.parse((listResult.content as Array<{ type: string; text: string }>)[0].text);
    expect(sessions[0].name).toBe("named-session");
  });

  it("write_terminal and read_terminal work end-to-end", async () => {
    // Create
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    // Write
    await client.callTool({
      name: "write_terminal",
      arguments: { id: info.id, input: "echo mcp-test" },
    });

    await new Promise((r) => setTimeout(r, 500));

    // Read
    const readResult = await client.callTool({
      name: "read_terminal",
      arguments: { id: info.id },
    });
    const output = JSON.parse((readResult.content as Array<{ type: string; text: string }>)[0].text);
    expect(output.data).toContain("mcp-test");
  });

  it("read_screen returns clean text", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    await client.callTool({
      name: "write_terminal",
      arguments: { id: info.id, input: "echo screen-mcp-test" },
    });

    await new Promise((r) => setTimeout(r, 500));

    const screenResult = await client.callTool({
      name: "read_screen",
      arguments: { id: info.id },
    });
    const screen = (screenResult.content as Array<{ type: string; text: string }>)[0].text;
    expect(screen).toContain("screen-mcp-test");
  });

  it("close_terminal removes the session", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    await client.callTool({
      name: "close_terminal",
      arguments: { id: info.id },
    });

    const listResult = await client.callTool({
      name: "list_terminals",
      arguments: {},
    });
    expect((listResult.content as Array<{ type: string; text: string }>)[0].text).toBe("No active sessions");
  });

  it("send_control sends ctrl+c", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const result = await client.callTool({
      name: "send_control",
      arguments: { id: info.id, key: "ctrl+c" },
    });
    expect((result.content as Array<{ type: string; text: string }>)[0].text).toContain("Sent ctrl+c");
  });

  it("send_control rejects unknown keys", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const result = await client.callTool({
      name: "send_control",
      arguments: { id: info.id, key: "ctrl+q" },
    });
    expect(result.isError).toBe(true);
  });

  it("resize_terminal changes dimensions", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const result = await client.callTool({
      name: "resize_terminal",
      arguments: { id: info.id, cols: 80, rows: 40 },
    });
    expect((result.content as Array<{ type: string; text: string }>)[0].text).toContain("80x40");
  });

  it("returns error for nonexistent session", async () => {
    const result = await client.callTool({
      name: "read_terminal",
      arguments: { id: "nonexistent" },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ type: string; text: string }>)[0].text).toContain("not found");
  });

  // --- spawn_claude tests ---

  it("spawn_claude creates session with auto-name and claude-agent tag", async () => {
    const result = await client.callTool({
      name: "spawn_claude",
      arguments: { prompt: "say hello world" },
    });
    const info = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(info.name).toBe("claude: say hello world");
    expect(info.tags).toContain("claude-agent");
    expect(info.command).toMatch(/claude$/);
  });

  it("spawn_claude accepts name/tags overrides", async () => {
    const result = await client.callTool({
      name: "spawn_claude",
      arguments: {
        prompt: "test prompt",
        name: "custom-agent",
        tags: ["research"],
        model: "sonnet",
      },
    });
    const info = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(info.name).toBe("custom-agent");
    expect(info.tags).toContain("claude-agent");
    expect(info.tags).toContain("research");
  });

  // --- MCP Resource tests ---

  it("listResources returns sessions", async () => {
    // Create a named session
    await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", name: "resource-test" },
    });

    const resources = await client.listResources();
    expect(resources.resources.length).toBe(1);
    expect(resources.resources[0].name).toBe("resource-test");
    expect(resources.resources[0].uri).toContain("terminal://sessions/");
    expect(resources.resources[0].mimeType).toBe("application/json");
  });

  it("readResource returns session info and screen", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", name: "read-resource-test" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const resource = await client.readResource({ uri: `terminal://sessions/${info.id}` });
    const content = resource.contents[0];
    expect(content.mimeType).toBe("application/json");

    const data = JSON.parse(content.text as string);
    expect(data.id).toBe(info.id);
    expect(data.name).toBe("read-resource-test");
    expect(data.screen).toBeDefined();
  });

  it("readResource for nonexistent session returns error text", async () => {
    const resource = await client.readResource({ uri: "terminal://sessions/nonexistent" });
    const content = resource.contents[0];
    expect(content.mimeType).toBe("text/plain");
    expect(content.text).toContain("not found");
  });

  // --- create_terminal with bufferSize ---

  it("create_terminal accepts custom bufferSize", async () => {
    const result = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", bufferSize: 2048 },
    });
    const info = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(info.status).toBe("running");
    expect(info.id).toBeDefined();
  });

  // --- grep_terminal tests ---

  it("grep_terminal finds pattern in output", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    await client.callTool({
      name: "write_terminal",
      arguments: { id: info.id, input: "echo GREP_TARGET_123" },
    });
    await new Promise((r) => setTimeout(r, 500));

    const grepResult = await client.callTool({
      name: "grep_terminal",
      arguments: { id: info.id, pattern: "GREP_TARGET_\\d+" },
    });
    const parsed = JSON.parse((grepResult.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.totalMatches).toBeGreaterThan(0);
    expect(parsed.matches[0].text).toContain("GREP_TARGET_123");
  });

  it("grep_terminal with invalid regex returns isError", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const result = await client.callTool({
      name: "grep_terminal",
      arguments: { id: info.id, pattern: "[invalid(" },
    });
    expect(result.isError).toBe(true);
  });

  it("grep_terminal no matches returns empty array", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const result = await client.callTool({
      name: "grep_terminal",
      arguments: { id: info.id, pattern: "NONEXISTENT_PATTERN_XYZ" },
    });
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.totalMatches).toBe(0);
    expect(parsed.matches).toEqual([]);
  });

  // --- wait_for tests ---

  it("wait_for matches from backlog", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    // Echo first, then wait — should match from backlog
    await client.callTool({
      name: "write_terminal",
      arguments: { id: info.id, input: "echo BACKLOG_MATCH" },
    });
    await new Promise((r) => setTimeout(r, 500));

    const waitResult = await client.callTool({
      name: "wait_for",
      arguments: { id: info.id, pattern: "BACKLOG_MATCH", timeout: 5000 },
    });
    const parsed = JSON.parse((waitResult.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.matched).toBe(true);
    expect(parsed.elapsed).toBe(0);
  });

  it("wait_for matches new output", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    // Start waiting, then echo (using setTimeout to write after wait starts)
    const waitPromise = client.callTool({
      name: "wait_for",
      arguments: { id: info.id, pattern: "LIVE_MATCH", timeout: 10000 },
    });

    // Give the wait tool time to set up its listener
    await new Promise((r) => setTimeout(r, 200));

    await client.callTool({
      name: "write_terminal",
      arguments: { id: info.id, input: "echo LIVE_MATCH" },
    });

    const waitResult = await waitPromise;
    const parsed = JSON.parse((waitResult.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.matched).toBe(true);
    expect(parsed.data).toBe("LIVE_MATCH");
  });

  it("wait_for timeout with short timeout", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const waitResult = await client.callTool({
      name: "wait_for",
      arguments: { id: info.id, pattern: "NEVER_APPEARS", timeout: 500 },
    });
    const parsed = JSON.parse((waitResult.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.matched).toBe(false);
    expect(parsed.reason).toBe("timeout");
    expect(waitResult.isError).toBeUndefined();
  });

  // --- health_check ---

  it("health_check returns version, uptime, sessions, memory", async () => {
    const result = await client.callTool({ name: "health_check", arguments: {} });
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.version).toBe("0.6.0");
    expect(parsed.uptime).toBeGreaterThanOrEqual(0);
    expect(parsed.sessions).toHaveProperty("active");
    expect(parsed.sessions).toHaveProperty("max");
    expect(parsed.memory).toHaveProperty("rss");
    expect(parsed.memory).toHaveProperty("heapUsed");
    expect(parsed.memory).toHaveProperty("heapTotal");
  });

  // --- V0.5.0: Session Groups (#22) ---

  it("list_terminals with tag filter returns only matching sessions", async () => {
    await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", tags: ["group-a"] },
    });
    await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", tags: ["group-b"] },
    });

    const result = await client.callTool({
      name: "list_terminals",
      arguments: { tag: "group-a" },
    });
    const sessions = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tags).toContain("group-a");
  });

  it("list_terminals with tag filter returns empty when no match", async () => {
    await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", tags: ["alpha"] },
    });

    const result = await client.callTool({
      name: "list_terminals",
      arguments: { tag: "nonexistent-tag" },
    });
    expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe("No active sessions");
  });

  it("close_group closes sessions with matching tag", async () => {
    await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", tags: ["batch-close"] },
    });
    await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", tags: ["batch-close"] },
    });
    await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", tags: ["keep-alive"] },
    });

    const closeResult = await client.callTool({
      name: "close_group",
      arguments: { tag: "batch-close" },
    });
    expect((closeResult.content as Array<{ type: string; text: string }>)[0].text).toBe(
      "Closed 2 sessions with tag 'batch-close'"
    );

    // The remaining session should still be alive
    const listResult = await client.callTool({
      name: "list_terminals",
      arguments: { tag: "keep-alive" },
    });
    const remaining = JSON.parse((listResult.content as Array<{ type: string; text: string }>)[0].text);
    expect(remaining).toHaveLength(1);
  });

  // --- V0.5.0: Output Multiplexing (#23) ---

  it("read_multiple reads from two sessions", async () => {
    const r1 = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const r2 = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const id1 = JSON.parse((r1.content as Array<{ type: string; text: string }>)[0].text).id;
    const id2 = JSON.parse((r2.content as Array<{ type: string; text: string }>)[0].text).id;

    await client.callTool({ name: "write_terminal", arguments: { id: id1, input: "echo multi-1" } });
    await client.callTool({ name: "write_terminal", arguments: { id: id2, input: "echo multi-2" } });
    await new Promise((r) => setTimeout(r, 500));

    const result = await client.callTool({
      name: "read_multiple",
      arguments: { ids: [id1, id2] },
    });
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe(id1);
    expect(parsed[0].data).toContain("multi-1");
    expect(parsed[1].id).toBe(id2);
    expect(parsed[1].data).toContain("multi-2");
  });

  it("read_multiple with screen mode", async () => {
    const r1 = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const id1 = JSON.parse((r1.content as Array<{ type: string; text: string }>)[0].text).id;

    await client.callTool({ name: "write_terminal", arguments: { id: id1, input: "echo screen-multi" } });
    await new Promise((r) => setTimeout(r, 500));

    const result = await client.callTool({
      name: "read_multiple",
      arguments: { ids: [id1], mode: "screen" },
    });
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].data).toContain("screen-multi");
    expect(parsed[0].status).toBe("running");
  });

  it("read_multiple includes inline error for bad id", async () => {
    const r1 = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const id1 = JSON.parse((r1.content as Array<{ type: string; text: string }>)[0].text).id;

    const result = await client.callTool({
      name: "read_multiple",
      arguments: { ids: [id1, "bad-id-xyz"] },
    });
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe(id1);
    expect(parsed[0].status).toBe("running");
    expect(parsed[1].id).toBe("bad-id-xyz");
    expect(parsed[1].error).toContain("not found");
    // Tool-level isError should not be set (partial results are useful)
    expect(result.isError).toBeUndefined();
  });

  // --- V0.5.0: Event Notifications (#24) ---

  it("subscribe_events returns subscriptionId", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const subResult = await client.callTool({
      name: "subscribe_events",
      arguments: { id: info.id, events: ["exit"] },
    });
    const parsed = JSON.parse((subResult.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.subscriptionId).toBeDefined();
    expect(parsed.sessionId).toBe(info.id);
    expect(parsed.events).toEqual(["exit"]);
  });

  it("unsubscribe_events cleans up", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const subResult = await client.callTool({
      name: "subscribe_events",
      arguments: { id: info.id, events: ["exit"] },
    });
    const { subscriptionId } = JSON.parse((subResult.content as Array<{ type: string; text: string }>)[0].text);

    const unsubResult = await client.callTool({
      name: "unsubscribe_events",
      arguments: { subscriptionId },
    });
    expect((unsubResult.content as Array<{ type: string; text: string }>)[0].text).toContain("Unsubscribed");

    // Second unsubscribe should fail
    const unsubResult2 = await client.callTool({
      name: "unsubscribe_events",
      arguments: { subscriptionId },
    });
    expect(unsubResult2.isError).toBe(true);
  });

  // --- V0.6.0: run_command tool ---

  it("run_command runs echo and returns output", async () => {
    const result = await client.callTool({
      name: "run_command",
      arguments: { command: "/bin/sh", args: ["-c", "echo run_cmd_test"] },
    });
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.output).toContain("run_cmd_test");
    expect(parsed.duration).toBeGreaterThanOrEqual(0);
    expect(parsed.sessionId).toBeDefined();
  });

  it("run_command returns non-zero exit code", async () => {
    const result = await client.callTool({
      name: "run_command",
      arguments: { command: "/bin/sh", args: ["-c", "exit 42"] },
    });
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.exitCode).toBe(42);
  });

  it("run_command respects cwd", async () => {
    const result = await client.callTool({
      name: "run_command",
      arguments: { command: "/bin/sh", args: ["-c", "pwd"], cwd: "/tmp" },
    });
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.output).toContain("/tmp");
    expect(parsed.exitCode).toBe(0);
  });

  it("run_command passes env vars", async () => {
    const result = await client.callTool({
      name: "run_command",
      arguments: {
        command: "/bin/sh",
        args: ["-c", "echo $MY_TEST_VAR"],
        env: { MY_TEST_VAR: "forge_env_test" },
      },
    });
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.output).toContain("forge_env_test");
  });

  it("run_command times out and keeps session alive", async () => {
    const result = await client.callTool({
      name: "run_command",
      arguments: { command: "/bin/sh", args: ["-c", "sleep 60"], timeout: 1000 },
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.timeout).toBe(true);
    expect(parsed.sessionId).toBeDefined();
    // Session should still be accessible
    const readResult = await client.callTool({
      name: "read_terminal",
      arguments: { id: parsed.sessionId },
    });
    expect(readResult.isError).toBeUndefined();
  }, 10_000);

  it("run_command auto-cleans up session on success", async () => {
    const result = await client.callTool({
      name: "run_command",
      arguments: { command: "/bin/sh", args: ["-c", "echo cleanup_test"] },
    });
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.exitCode).toBe(0);

    // Session should be cleaned up — reading it should fail
    const readResult = await client.callTool({
      name: "read_terminal",
      arguments: { id: parsed.sessionId },
    });
    expect(readResult.isError).toBe(true);
    expect((readResult.content as Array<{ type: string; text: string }>)[0].text).toContain("not found");
  });

  // --- V0.6.0: wait_for + waitForExit ---

  it("wait_for with waitForExit detects process exit", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", args: ["-c", "sleep 0.5 && exit 0"] },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const waitResult = await client.callTool({
      name: "wait_for",
      arguments: { id: info.id, waitForExit: true, timeout: 5000 },
    });
    const parsed = JSON.parse((waitResult.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.matched).toBe(true);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.elapsed).toBeGreaterThan(0);
  }, 10_000);

  it("wait_for with waitForExit on already-exited session returns immediately", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", args: ["-c", "exit 7"] },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    // Give it a moment to exit
    await new Promise((r) => setTimeout(r, 500));

    const waitResult = await client.callTool({
      name: "wait_for",
      arguments: { id: info.id, waitForExit: true, timeout: 5000 },
    });
    const parsed = JSON.parse((waitResult.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.matched).toBe(true);
    expect(parsed.exitCode).toBe(7);
    expect(parsed.elapsed).toBe(0);
  });

  it("wait_for with waitForExit times out", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const waitResult = await client.callTool({
      name: "wait_for",
      arguments: { id: info.id, waitForExit: true, timeout: 500 },
    });
    const parsed = JSON.parse((waitResult.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.matched).toBe(false);
    expect(parsed.reason).toBe("timeout");
  });

  it("wait_for without pattern or waitForExit returns error", async () => {
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh" },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const waitResult = await client.callTool({
      name: "wait_for",
      arguments: { id: info.id },
    });
    expect(waitResult.isError).toBe(true);
    expect((waitResult.content as Array<{ type: string; text: string }>)[0].text).toContain("Either");
  });

  // --- V0.5.0: Session Templates (#25) ---

  it("create_from_template with shell template", async () => {
    const result = await client.callTool({
      name: "create_from_template",
      arguments: { template: "shell" },
    });
    const info = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(info.status).toBe("running");
    expect(info.name).toBe("Shell");
    expect(info.tags).toContain("shell");
  });

  it("create_from_template with unknown template returns error", async () => {
    const result = await client.callTool({
      name: "create_from_template",
      arguments: { template: "nonexistent" },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ type: string; text: string }>)[0].text).toContain("Unknown template");
    expect((result.content as Array<{ type: string; text: string }>)[0].text).toContain("Available:");
  });

  it("list_templates returns available templates", async () => {
    const result = await client.callTool({
      name: "list_templates",
      arguments: {},
    });
    const templates = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(templates.length).toBeGreaterThanOrEqual(6);
    const names = templates.map((t: { name: string }) => t.name);
    expect(names).toContain("shell");
    expect(names).toContain("next-dev");
  });
});
