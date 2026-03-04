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
    expect(parsed.version).toBe("0.4.0");
    expect(parsed.uptime).toBeGreaterThanOrEqual(0);
    expect(parsed.sessions).toHaveProperty("active");
    expect(parsed.sessions).toHaveProperty("max");
    expect(parsed.memory).toHaveProperty("rss");
    expect(parsed.memory).toHaveProperty("heapUsed");
    expect(parsed.memory).toHaveProperty("heapTotal");
  });
});
