import { describe, it, expect, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { DEFAULT_CONFIG } from "../../src/core/types.js";
import type { SessionManager } from "../../src/core/session-manager.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("spawn_gemini", () => {
  let client: Client;
  let server: McpServer;
  let manager: SessionManager;

  async function setup(overrides = {}) {
    const config = { ...DEFAULT_CONFIG, idleTimeout: 0, geminiPath: "/bin/echo", ...overrides };
    const result = createServer(config);
    server = result.server;
    manager = result.manager;
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await result.server.connect(st);
    client = new Client({ name: "test", version: "1.0" }, { capabilities: { resources: {} } });
    await client.connect(ct);
  }

  afterEach(async () => {
    manager?.closeAll();
    if (client) await client.close();
    if (server) await server.close();
  });

  it("spawns a gemini session with oneShot", async () => {
    await setup();
    const result = await client.callTool({ name: "spawn_gemini", arguments: { prompt: "hello", oneShot: true } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const info = JSON.parse(text);
    expect(info.id).toBeDefined();
    expect(info.tags).toContain("gemini-agent");

    // Verify the session actually ran: /bin/echo receives the prompt as an arg and exits
    const waitResult = await client.callTool({
      name: "wait_for",
      arguments: { id: info.id, waitForExit: true, timeout: 5000 },
    });
    const waited = JSON.parse((waitResult.content as Array<{ text: string }>)[0].text);
    expect(waited.matched).toBe(true);
    expect(waited.exitCode).toBe(0);

    const readResult = await client.callTool({
      name: "read_terminal",
      arguments: { id: info.id },
    });
    const output = JSON.parse((readResult.content as Array<{ text: string }>)[0].text);
    expect(output.data).toContain("hello");
  }, 10_000);

  it("spawns an interactive gemini session", async () => {
    await setup();
    const result = await client.callTool({ name: "spawn_gemini", arguments: { prompt: "hello" } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const info = JSON.parse(text);
    expect(info.id).toBeDefined();
    expect(info.status).toBe("running");
  });

  it("requires prompt for oneShot mode", async () => {
    await setup();
    const result = await client.callTool({ name: "spawn_gemini", arguments: { oneShot: true } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("prompt");
    expect(result.isError).toBe(true);
  });

  it("spawns interactive session without prompt", async () => {
    await setup();
    const result = await client.callTool({ name: "spawn_gemini", arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const info = JSON.parse(text);
    expect(info.id).toBeDefined();
    expect(info.name).toBe("gemini: interactive");
    expect(info.tags).toContain("gemini-agent");
  });

  it("accepts name and tags overrides", async () => {
    await setup();
    const result = await client.callTool({
      name: "spawn_gemini",
      arguments: { prompt: "test", name: "custom-gemini", tags: ["research"] },
    });
    const info = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(info.name).toBe("custom-gemini");
    expect(info.tags).toContain("gemini-agent");
    expect(info.tags).toContain("research");
  });

  it("fromSession copies cwd", async () => {
    await setup();
    // Create a source session with a known cwd
    const source = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", cwd: "/tmp" },
    });
    const sourceInfo = JSON.parse((source.content as Array<{ text: string }>)[0].text);

    const result = await client.callTool({
      name: "spawn_gemini",
      arguments: { prompt: "hello", fromSession: sourceInfo.id },
    });
    const info = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(info.cwd).toBe("/tmp");
  });

  it("fromSession with invalid id returns error", async () => {
    await setup();
    const result = await client.callTool({
      name: "spawn_gemini",
      arguments: { prompt: "hello", fromSession: "nonexistent" },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain("not found");
  });
});
