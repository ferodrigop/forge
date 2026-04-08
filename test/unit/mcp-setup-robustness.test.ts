import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerMcpJsonFile } from "../../src/cli.js";

// ---------------------------------------------------------------------------
// 1. mergeJsonConfig / registerMcpJsonFile — force-overwrite behavior
// ---------------------------------------------------------------------------

describe("registerMcpJsonFile — idempotency", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = join(tmpdir(), `forge-robust-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("does not overwrite an existing forge entry (preserves stale config)", () => {
    const mcpFile = join(tempRoot, ".mcp.json");
    // Simulate a stale stdio-style config that a user might have
    writeFileSync(
      mcpFile,
      JSON.stringify({
        mcpServers: {
          forge: { command: "npx", args: ["forge-terminal-mcp"] },
        },
      }),
    );

    // Register should see "forge" already present and skip
    registerMcpJsonFile(mcpFile, "http://127.0.0.1:3141/mcp");

    const config = JSON.parse(readFileSync(mcpFile, "utf-8"));
    // Should still be the old stale config — not overwritten
    expect(config.mcpServers.forge).toEqual({
      command: "npx",
      args: ["forge-terminal-mcp"],
    });
  });

  it("creates parent directories for new config files", () => {
    const deepPath = join(tempRoot, "a", "b", ".mcp.json");
    registerMcpJsonFile(deepPath, "http://127.0.0.1:3141/mcp");

    const config = JSON.parse(readFileSync(deepPath, "utf-8"));
    expect(config.mcpServers.forge).toEqual({
      type: "http",
      url: "http://127.0.0.1:3141/mcp",
    });
  });

  it("preserves other MCP servers when adding forge", () => {
    const mcpFile = join(tempRoot, ".mcp.json");
    writeFileSync(
      mcpFile,
      JSON.stringify({
        mcpServers: {
          "other-server": { url: "http://localhost:9999" },
        },
      }),
    );

    registerMcpJsonFile(mcpFile, "http://127.0.0.1:3141/mcp");

    const config = JSON.parse(readFileSync(mcpFile, "utf-8"));
    expect(config.mcpServers["other-server"]).toEqual({ url: "http://localhost:9999" });
    expect(config.mcpServers.forge).toEqual({ type: "http", url: "http://127.0.0.1:3141/mcp" });
  });
});

// ---------------------------------------------------------------------------
// 2. Docs/landing command consistency — static analysis
// ---------------------------------------------------------------------------

describe("docs command consistency", () => {
  const repoRoot = join(import.meta.dirname, "..", "..");

  // The HTTP commands that MUST appear in docs (from src/cli.ts AGENTS array)
  const EXPECTED_COMMANDS: Record<string, string[]> = {
    "claude": ["claude mcp add --transport http forge http://127.0.0.1:3141/mcp"],
    "gemini": ["gemini mcp add --transport http forge http://127.0.0.1:3141/mcp"],
    "codex": ["codex mcp add forge --url http://127.0.0.1:3141/mcp"],
  };

  // Files that should contain these commands
  const DOC_FILES = [
    "README.md",
    "landing/index.html",
    "landing/docs/getting-started.html",
  ];

  for (const [agent, commands] of Object.entries(EXPECTED_COMMANDS)) {
    for (const docFile of DOC_FILES) {
      it(`${docFile} contains correct ${agent} MCP command`, () => {
        const content = readFileSync(join(repoRoot, docFile), "utf-8");
        for (const cmd of commands) {
          expect(content).toContain(cmd);
        }
      });
    }
  }

  // Negative test: stdio commands should NOT appear in docs anymore
  const STALE_STDIO_COMMANDS = [
    "claude mcp add forge -- npx forge-terminal-mcp",
  ];

  for (const docFile of DOC_FILES) {
    it(`${docFile} does not contain stale stdio commands`, () => {
      const content = readFileSync(join(repoRoot, docFile), "utf-8");
      for (const cmd of STALE_STDIO_COMMANDS) {
        expect(content).not.toContain(cmd);
      }
    });
  }

  // JSON config blocks should use HTTP, not stdio spawn
  it("landing/docs/getting-started.html JSON config uses HTTP, not stdio spawn", () => {
    const content = readFileSync(join(repoRoot, "landing/docs/getting-started.html"), "utf-8");
    // Should NOT have stdio-style JSON with "command":"npx"
    expect(content).not.toMatch(/"command".*"npx".*"args".*"forge-terminal-mcp"/s);
    // Should have HTTP-style JSON
    expect(content).toContain("http://127.0.0.1:3141/mcp");
  });
});

// ---------------------------------------------------------------------------
// 3. AGENTS array structure — verify all CLI agents construct valid args
// ---------------------------------------------------------------------------

describe("AGENTS array structure", () => {
  // We can't import AGENTS directly (not exported), but we can
  // verify the file content to catch structural regressions.

  const cliSource = readFileSync(
    join(import.meta.dirname, "..", "..", "src", "cli.ts"),
    "utf-8",
  );

  it("all registerViaCli calls in AGENTS include a notFoundUrl", () => {
    const agentsBlock = cliSource.match(/const AGENTS: AgentDef\[\] = \[[\s\S]*?\n\];/);
    expect(agentsBlock).not.toBeNull();
    const block = agentsBlock![0];

    const registerCalls = block.match(/registerViaCli\([\s\S]*?\);/g) ?? [];
    expect(registerCalls.length).toBeGreaterThanOrEqual(3); // claude, gemini, codex
    for (const call of registerCalls) {
      expect(call).toMatch(/https?:\/\//);
    }
  });

  it("all agents in AGENTS pass the force parameter", () => {
    const agentsBlock = cliSource.match(/const AGENTS: AgentDef\[\] = \[[\s\S]*?\n\];/);
    expect(agentsBlock).not.toBeNull();
    const block = agentsBlock![0];

    // Count register functions that accept force
    const registerFns = block.match(/register\(mcpUrl, force\)/g) ?? [];
    // There are 7 agents total
    expect(registerFns.length).toBe(7);
  });

  it("registerViaCli error message includes the failed command", () => {
    expect(cliSource).toContain("Command: ${bin} ${addArgs.join");
    expect(cliSource).toContain("CLI version mismatch");
  });

  it("cmdSetup parses --force flag", () => {
    expect(cliSource).toMatch(/const force = args\.includes\("--force"\)/);
  });
});
