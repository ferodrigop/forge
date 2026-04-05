/**
 * Integration tests for structured output improvements to delegate_task:
 *   - filesChanged field in success responses (worktree mode)
 *   - base:<sha> session tag for worktree sessions
 *   - Consistent JSON error responses
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

/** Parse the text field from a tool result as JSON */
function parseResult(result: { content: unknown }): Record<string, unknown> {
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  return JSON.parse(text);
}

/** Get raw text from a tool result */
function rawText(result: { content: unknown }): string {
  return (result.content as Array<{ type: string; text: string }>)[0].text;
}

/** Create a temp git repo with an initial commit. Returns the repo path. */
function createTempRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "forge-test-"));
  execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir, stdio: "pipe" });
  writeFileSync(path.join(dir, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "."], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: dir, stdio: "pipe" });
  return dir;
}

/** Write a shell script to a temp file and make it executable. */
function writeScript(content: string): string {
  const scriptPath = path.join(mkdtempSync(path.join(tmpdir(), "forge-script-")), "agent.sh");
  writeFileSync(scriptPath, content);
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

describe("structured output", () => {
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

    // Clean up worktrees before removing the repo
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
  // filesChanged
  // ────────────────────────────────────────

  describe("filesChanged", () => {
    it("includes untracked files created by the agent", async () => {
      tempRepo = createTempRepo();

      // Agent script: ignores flags, creates a new file in cwd, exits
      const script = writeScript(
        '#!/bin/sh\necho "new content" > "$PWD/new-file.txt"\necho "done"\n',
      );
      scriptDirs.push(path.dirname(script));

      await setup({ claudePath: script });

      const branchName = "test-untracked-" + Date.now();
      const result = await client.callTool({
        name: "delegate_task",
        arguments: {
          agent: "claude",
          prompt: "create a file",
          cwd: tempRepo,
          worktree: true,
          branch: branchName,
          timeout: 15_000,
        },
      });

      const parsed = parseResult(result);
      expect(parsed.status).toBe("completed");
      expect(parsed.filesChanged).toBeDefined();
      expect(parsed.filesChanged).toContain("new-file.txt");

      // Track worktree for cleanup
      if (parsed.worktreePath) worktreePaths.push(parsed.worktreePath as string);
    }, 30_000);

    it("includes committed files via base SHA diff", async () => {
      tempRepo = createTempRepo();

      // Agent script: creates a file, stages, commits, then exits
      const script = writeScript([
        '#!/bin/sh',
        'echo "committed content" > "$PWD/committed.txt"',
        'cd "$PWD"',
        'git add committed.txt',
        'git -c user.email=test@test.com -c user.name=Test commit -m "agent commit"',
        'echo "done"',
      ].join("\n"));
      scriptDirs.push(path.dirname(script));

      await setup({ claudePath: script });

      const branchName = "test-committed-" + Date.now();
      const result = await client.callTool({
        name: "delegate_task",
        arguments: {
          agent: "claude",
          prompt: "commit a file",
          cwd: tempRepo,
          worktree: true,
          branch: branchName,
          timeout: 15_000,
        },
      });

      const parsed = parseResult(result);
      expect(parsed.status).toBe("completed");
      expect(parsed.filesChanged).toBeDefined();
      expect(parsed.filesChanged).toContain("committed.txt");

      if (parsed.worktreePath) worktreePaths.push(parsed.worktreePath as string);
    }, 30_000);

    it("is undefined when no worktree is used", async () => {
      await setup({ claudePath: "echo" });

      const result = await client.callTool({
        name: "delegate_task",
        arguments: {
          agent: "claude",
          prompt: "no worktree",
        },
      });

      const parsed = parseResult(result);
      expect(parsed.status).toBe("completed");
      expect(parsed.filesChanged).toBeUndefined();
    });
  });

  // ────────────────────────────────────────
  // base:<sha> tag
  // ────────────────────────────────────────

  describe("base SHA tag", () => {
    it("session tags include base:<sha> when worktree is used", async () => {
      tempRepo = createTempRepo();
      await setup({ claudePath: "echo" });

      const branchName = "test-basetag-" + Date.now();
      const result = await client.callTool({
        name: "delegate_task",
        arguments: {
          agent: "claude",
          prompt: "check tags",
          cwd: tempRepo,
          worktree: true,
          branch: branchName,
          timeout: 15_000,
        },
      });

      const parsed = parseResult(result);
      const sessionId = parsed.sessionId as string;

      const listResult = await client.callTool({
        name: "list_terminals",
        arguments: {},
      });
      const sessions = JSON.parse(rawText(listResult));
      const found = sessions.find((s: { id: string }) => s.id === sessionId);

      expect(found).toBeDefined();
      expect(found.tags).toContain("worktree");
      const baseTag = found.tags.find((t: string) => t.startsWith("base:"));
      expect(baseTag).toBeDefined();
      // The SHA should be a 40-char hex string
      expect(baseTag.slice(5)).toMatch(/^[0-9a-f]{40}$/);

      if (parsed.worktreePath) worktreePaths.push(parsed.worktreePath as string);
    }, 30_000);
  });

  // ────────────────────────────────────────
  // Error JSON consistency
  // ────────────────────────────────────────

  describe("error JSON consistency", () => {
    it("missing agent returns structured error JSON", async () => {
      await setup({ claudePath: "echo" });

      const result = await client.callTool({
        name: "delegate_task",
        arguments: {
          prompt: "no agent",
        },
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(rawText(result));
      expect(parsed.status).toBe("error");
      expect(parsed.message).toContain("agent");
    });

    it("worktree without branch returns structured error JSON", async () => {
      await setup({ claudePath: "echo" });

      const result = await client.callTool({
        name: "delegate_task",
        arguments: {
          agent: "claude",
          prompt: "missing branch",
          worktree: true,
        },
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(rawText(result));
      expect(parsed.status).toBe("error");
      expect(parsed.message).toContain("branch");
    });

    it("worktree outside git repo returns structured error JSON", async () => {
      const nonGitDir = mkdtempSync(path.join(tmpdir(), "forge-nogit-"));
      scriptDirs.push(nonGitDir);

      await setup({ claudePath: "echo" });

      const result = await client.callTool({
        name: "delegate_task",
        arguments: {
          agent: "claude",
          prompt: "not a repo",
          cwd: nonGitDir,
          worktree: true,
          branch: "test-branch",
        },
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(rawText(result));
      expect(parsed.status).toBe("error");
      expect(parsed.message).toContain("git repository");
    });

    it("follow-up to non-existent session returns structured error JSON", async () => {
      await setup({ claudePath: "echo" });

      const result = await client.callTool({
        name: "delegate_task",
        arguments: {
          sessionId: "does-not-exist",
          prompt: "hello",
        },
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(rawText(result));
      expect(parsed.status).toBe("error");
      expect(parsed.message).toContain("not found");
    });
  });
});
