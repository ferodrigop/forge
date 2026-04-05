import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../../src/server.js";
import { DEFAULT_CONFIG } from "../../src/core/types.js";
import type { SessionManager } from "../../src/core/session-manager.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("Progress Notifications", () => {
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

  it("wait_for emits progress notifications during pattern wait", async () => {
    // Create a terminal with a slow command that outputs after a delay
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", args: ["-c", "sleep 5 && echo DONE"] },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const progressUpdates: Array<{ progress: number; total?: number }> = [];

    // Call wait_for with a timeout that allows a few progress ticks
    // Pattern won't match (command sleeps 5s), so we'll timeout at 5s and get ~2 progress ticks
    const result = await client.callTool(
      {
        name: "wait_for",
        arguments: { id: info.id, pattern: "DONE", timeout: 5000 },
      },
      CallToolResultSchema,
      {
        onprogress: (progress) => {
          progressUpdates.push({ progress: progress.progress, total: progress.total });
        },
      },
    );

    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);

    // Should have timed out (sleep 5 + echo vs 5s timeout — pattern arrives right at edge, timeout likely wins)
    // Either way, we should have received at least 1 progress notification (first tick at 2s)
    expect(progressUpdates.length).toBeGreaterThanOrEqual(1);
    expect(progressUpdates[0].progress).toBe(1);
    expect(progressUpdates[0].total).toBe(Math.ceil(5000 / 2000));
  });

  it("wait_for emits progress notifications during waitForExit", async () => {
    // Create a terminal with a command that sleeps for 5 seconds
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sleep", args: ["5"] },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    const progressUpdates: Array<{ progress: number; total?: number }> = [];

    const result = await client.callTool(
      {
        name: "wait_for",
        arguments: { id: info.id, waitForExit: true, timeout: 8000 },
      },
      CallToolResultSchema,
      {
        onprogress: (progress) => {
          progressUpdates.push({ progress: progress.progress, total: progress.total });
        },
      },
    );

    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.matched).toBe(true);

    // sleep 5 should produce at least 2 progress ticks (at 2s and 4s)
    expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
    expect(progressUpdates[0].progress).toBe(1);
    expect(progressUpdates[1].progress).toBe(2);
    expect(progressUpdates[0].total).toBe(Math.ceil(8000 / 2000));
  });

  it("wait_for with fast exit sends no progress notifications", async () => {
    // Create a terminal that exits immediately
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/echo", args: ["hello"] },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    // Small delay to let the process exit
    await new Promise((r) => setTimeout(r, 300));

    const progressUpdates: Array<{ progress: number; total?: number }> = [];

    const result = await client.callTool(
      {
        name: "wait_for",
        arguments: { id: info.id, waitForExit: true, timeout: 5000 },
      },
      CallToolResultSchema,
      {
        onprogress: (progress) => {
          progressUpdates.push({ progress: progress.progress, total: progress.total });
        },
      },
    );

    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.matched).toBe(true);
    expect(parsed.exitCode).toBe(0);

    // Process already exited before wait_for — no progress ticks should fire
    expect(progressUpdates.length).toBe(0);
  });

  it("wait_for without progressToken sends no notifications", async () => {
    // Create a terminal with a slow command
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sleep", args: ["3"] },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    // Call without onprogress — no progressToken sent
    const result = await client.callTool({
      name: "wait_for",
      arguments: { id: info.id, waitForExit: true, timeout: 4000 },
    });

    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    // Should still work normally — just no progress sent
    expect(parsed.matched).toBe(true);
  });

  it("wait_for pattern match from backlog sends no progress notifications", async () => {
    // Create a terminal that outputs immediately
    const createResult = await client.callTool({
      name: "create_terminal",
      arguments: { command: "/bin/sh", args: ["-c", "echo BACKLOG_MATCH"] },
    });
    const info = JSON.parse((createResult.content as Array<{ type: string; text: string }>)[0].text);

    // Wait for output to land in backlog
    await new Promise((r) => setTimeout(r, 500));

    const progressUpdates: Array<{ progress: number; total?: number }> = [];

    const result = await client.callTool(
      {
        name: "wait_for",
        arguments: { id: info.id, pattern: "BACKLOG_MATCH", timeout: 5000 },
      },
      CallToolResultSchema,
      {
        onprogress: (progress) => {
          progressUpdates.push({ progress: progress.progress, total: progress.total });
        },
      },
    );

    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.matched).toBe(true);
    expect(parsed.data).toContain("BACKLOG_MATCH");

    // Backlog match is instant — no progress ticks
    expect(progressUpdates.length).toBe(0);
  });
});
