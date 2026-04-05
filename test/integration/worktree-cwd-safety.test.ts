/**
 * Integration tests for worktree cwd safety (issue #14):
 *   - When worktree: true, the session cwd must be the worktree path
 *   - baseCwd must respect effectiveCwd (fromSession) when resolving the git repo root
 */

import { describe, it, expect, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { DEFAULT_CONFIG } from "../../src/core/types.js";
import type { SessionManager } from "../../src/core/session-manager.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function parseResult(result: { content: unknown }): Record<string, unknown> {
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  return JSON.parse(text);
}

function rawText(result: { content: unknown }): string {
  return (result.content as Array<{ type: string; text: string }>)[0].text;
}

function createTempRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "forge-wt-test-"));
  execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir, stdio: "pipe" });
  writeFileSync(path.join(dir, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "."], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: dir, stdio: "pipe" });
  return dir;
}

function writeScript(content: string): string {
  const scriptPath = path.join(mkdtempSync(path.join(tmpdir(), "forge-script-")), "agent.sh");
  writeFileSync(scriptPath, content);
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

describe("worktree cwd safety", () => {
  let client: Client;
  let server: McpServer;
  let manager: SessionManager;
  let tempRepo: string | undefined;
  let worktreePaths: string[] = [];
  let scriptDirs: string[] = [];

  async function setup(configOverrides: Record<string, unknown> = {}) {
    const config = { ...DEFAULT_CONFIG, idleTimeout: 0, ...configOverrides };
    const result = createServer(config);
    server = result.server;
    manager = result.manager;

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "1.0" }, { capabilities: { resources: {} } });
    await client.connect(clientTransport);
  }

  afterEach(async () => {
    if (manager) manager.closeAll();
    if (client) await client.close();
    if (server) await server.close();

    if (tempRepo) {
      for (const wt of worktreePaths) {
        try {
          execFileSync("git", ["worktree", "remove", "--force", wt], { cwd: tempRepo, stdio: "pipe" });
        } catch { /* already cleaned */ }
        try { rmSync(wt, { recursive: true, force: true }); } catch { /* ignore */ }
      }
      rmSync(tempRepo, { recursive: true, force: true });
      tempRepo = undefined;
    }
    for (const d of scriptDirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    worktreePaths = [];
    scriptDirs = [];
  });

  // ────────────────────────────────────────
  // Session cwd must be the worktree path
  // ────────────────────────────────────────

  describe("session cwd is worktree path", () => {
    it("spawn_claude sets cwd to worktree path when no explicit cwd", async () => {
      tempRepo = createTempRepo();
      await setup({ claudePath: "echo" });

      const branchName = "test-cwd-claude-" + Date.now();
      const result = await client.callTool({
        name: "spawn_claude",
        arguments: {
          prompt: "test",
          cwd: tempRepo,
          worktree: true,
          branch: branchName,
        },
      });

      const parsed = parseResult(result);
      expect(parsed.worktreePath).toBeDefined();
      // Session cwd must equal the worktree path, not process.cwd() or the original cwd
      expect(parsed.cwd).toBe(parsed.worktreePath);

      if (parsed.worktreePath) worktreePaths.push(parsed.worktreePath as string);
    });

    it("spawn_codex sets cwd to worktree path when no explicit cwd", async () => {
      tempRepo = createTempRepo();
      await setup({ codexPath: "echo" });

      const branchName = "test-cwd-codex-" + Date.now();
      const result = await client.callTool({
        name: "spawn_codex",
        arguments: {
          prompt: "test",
          cwd: tempRepo,
          worktree: true,
          branch: branchName,
        },
      });

      const parsed = parseResult(result);
      expect(parsed.worktreePath).toBeDefined();
      expect(parsed.cwd).toBe(parsed.worktreePath);

      if (parsed.worktreePath) worktreePaths.push(parsed.worktreePath as string);
    });

    it("spawn_gemini sets cwd to worktree path when no explicit cwd", async () => {
      tempRepo = createTempRepo();
      await setup({ geminiPath: "echo" });

      const branchName = "test-cwd-gemini-" + Date.now();
      const result = await client.callTool({
        name: "spawn_gemini",
        arguments: {
          prompt: "test",
          cwd: tempRepo,
          worktree: true,
          branch: branchName,
        },
      });

      const parsed = parseResult(result);
      expect(parsed.worktreePath).toBeDefined();
      expect(parsed.cwd).toBe(parsed.worktreePath);

      if (parsed.worktreePath) worktreePaths.push(parsed.worktreePath as string);
    });

    it("delegate_task sets cwd to worktree path", async () => {
      tempRepo = createTempRepo();
      await setup({ claudePath: "echo" });

      const branchName = "test-cwd-delegate-" + Date.now();
      const result = await client.callTool({
        name: "delegate_task",
        arguments: {
          agent: "claude",
          prompt: "test",
          cwd: tempRepo,
          worktree: true,
          branch: branchName,
          timeout: 15_000,
        },
      });

      const parsed = parseResult(result);
      expect(parsed.worktreePath).toBeDefined();

      // Verify the session cwd via list_terminals
      const sessionId = parsed.sessionId as string;
      const listResult = await client.callTool({
        name: "list_terminals",
        arguments: {},
      });
      const sessions = JSON.parse(rawText(listResult));
      const found = sessions.find((s: { id: string }) => s.id === sessionId);
      expect(found).toBeDefined();
      expect(found.cwd).toBe(parsed.worktreePath);

      if (parsed.worktreePath) worktreePaths.push(parsed.worktreePath as string);
    }, 30_000);
  });

  // ────────────────────────────────────────
  // fromSession cwd is used for repo root detection
  // ────────────────────────────────────────

  describe("fromSession cwd used for worktree repo root", () => {
    it("spawn_claude with fromSession resolves repo from source session cwd", async () => {
      tempRepo = createTempRepo();

      // Use a script that stays alive briefly so fromSession can read its cwd
      const script = writeScript('#!/bin/sh\nsleep 5\n');
      scriptDirs.push(path.dirname(script));

      await setup({ claudePath: script });

      // Create a source session with cwd set to the temp repo
      const sourceResult = await client.callTool({
        name: "spawn_claude",
        arguments: {
          prompt: "source session",
          cwd: tempRepo,
        },
      });
      const sourceSession = parseResult(sourceResult);
      const sourceId = sourceSession.id as string;

      // Now spawn with worktree using fromSession (no explicit cwd)
      const branchName = "test-fromsession-" + Date.now();
      const result = await client.callTool({
        name: "spawn_claude",
        arguments: {
          prompt: "worktree from session",
          fromSession: sourceId,
          worktree: true,
          branch: branchName,
        },
      });

      const parsed = parseResult(result);
      // Should succeed and create worktree in the correct repo
      expect(parsed.worktreePath).toBeDefined();
      expect(parsed.cwd).toBe(parsed.worktreePath);

      // The worktree path should be relative to tempRepo's parent (resolve symlinks for macOS /tmp → /private/tmp)
      const wtPath = parsed.worktreePath as string;
      const resolvedWt = execFileSync("realpath", [path.dirname(wtPath)], { encoding: "utf-8" }).trim();
      const resolvedRepo = execFileSync("realpath", [path.dirname(tempRepo)], { encoding: "utf-8" }).trim();
      expect(resolvedWt).toBe(resolvedRepo);

      if (parsed.worktreePath) worktreePaths.push(wtPath);
    });
  });

  // ────────────────────────────────────────
  // Agent actually runs in the worktree directory
  // ────────────────────────────────────────

  describe("agent process runs in worktree directory", () => {
    it("delegate_task agent pwd matches worktree path", async () => {
      tempRepo = createTempRepo();

      // Agent script: prints its working directory and exits
      const script = writeScript('#!/bin/sh\npwd\n');
      scriptDirs.push(path.dirname(script));

      await setup({ claudePath: script });

      const branchName = "test-pwd-" + Date.now();
      const result = await client.callTool({
        name: "delegate_task",
        arguments: {
          agent: "claude",
          prompt: "print pwd",
          cwd: tempRepo,
          worktree: true,
          branch: branchName,
          timeout: 15_000,
        },
      });

      const parsed = parseResult(result);
      expect(parsed.status).toBe("completed");
      expect(parsed.worktreePath).toBeDefined();

      // The agent output should contain the worktree path (agent ran in worktree dir)
      const output = parsed.output as string;
      const wtPath = parsed.worktreePath as string;
      // Resolve both paths to handle symlinks (e.g., /tmp → /private/tmp on macOS)
      const resolvedWtPath = execFileSync("realpath", [wtPath], { encoding: "utf-8" }).trim();
      expect(output).toContain(resolvedWtPath);

      if (parsed.worktreePath) worktreePaths.push(wtPath);
    }, 30_000);
  });
});
