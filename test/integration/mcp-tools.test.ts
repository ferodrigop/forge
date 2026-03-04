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

    client = new Client({ name: "test-client", version: "1.0" });
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
});
