import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverMcpJsonFiles, registerMcpJsonFile } from "../../src/cli.js";

describe("discoverMcpJsonFiles", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = join(tmpdir(), `forge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("returns empty array when no .mcp.json exists", () => {
    const result = discoverMcpJsonFiles(tempRoot);
    expect(result).toEqual([]);
  });

  it("finds .mcp.json in the start directory", () => {
    const mcpFile = join(tempRoot, ".mcp.json");
    writeFileSync(mcpFile, JSON.stringify({ mcpServers: {} }));

    const result = discoverMcpJsonFiles(tempRoot);
    expect(result).toContain(mcpFile);
  });

  it("finds .mcp.json in parent directories", () => {
    const child = join(tempRoot, "project", "src");
    mkdirSync(child, { recursive: true });

    const parentMcp = join(tempRoot, "project", ".mcp.json");
    writeFileSync(parentMcp, JSON.stringify({ mcpServers: {} }));

    const result = discoverMcpJsonFiles(child);
    expect(result).toContain(parentMcp);
  });

  it("finds multiple .mcp.json files walking up", () => {
    const child = join(tempRoot, "a", "b");
    mkdirSync(child, { recursive: true });

    const rootMcp = join(tempRoot, ".mcp.json");
    const midMcp = join(tempRoot, "a", ".mcp.json");
    writeFileSync(rootMcp, JSON.stringify({ mcpServers: {} }));
    writeFileSync(midMcp, JSON.stringify({ mcpServers: {} }));

    const result = discoverMcpJsonFiles(child);
    // Should find mid first (closer), then root
    expect(result).toEqual([midMcp, rootMcp]);
  });
});

describe("registerMcpJsonFile", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = join(tmpdir(), `forge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("is idempotent — calling twice produces exactly one forge entry", () => {
    const mcpFile = join(tempRoot, ".mcp.json");
    writeFileSync(mcpFile, JSON.stringify({ mcpServers: {} }));

    const url = "http://127.0.0.1:3141/mcp";
    registerMcpJsonFile(mcpFile, url);
    registerMcpJsonFile(mcpFile, url);

    const config = JSON.parse(readFileSync(mcpFile, "utf-8"));
    expect(Object.keys(config.mcpServers)).toEqual(["forge"]);
    expect(config.mcpServers.forge).toEqual({ type: "http", url });
  });

  it("skips malformed files with a warning instead of overwriting", () => {
    const mcpFile = join(tempRoot, ".mcp.json");
    const garbage = "{not valid json!!!";
    writeFileSync(mcpFile, garbage);

    registerMcpJsonFile(mcpFile, "http://127.0.0.1:3141/mcp");

    // File should be unchanged
    expect(readFileSync(mcpFile, "utf-8")).toBe(garbage);
  });
});
