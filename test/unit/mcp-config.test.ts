import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureMcpConfig } from "../../src/utils/mcp-config.js";

describe("ensureMcpConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "forge-mcp-config-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes .mcp.json for Claude Code", () => {
    ensureMcpConfig(dir, "http://127.0.0.1:3141/mcp");

    const configPath = join(dir, ".mcp.json");
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.mcpServers.forge).toEqual({
      type: "http",
      url: "http://127.0.0.1:3141/mcp",
    });
  });

  it("writes .gemini/settings.json for Gemini CLI", () => {
    ensureMcpConfig(dir, "http://127.0.0.1:3141/mcp");

    const configPath = join(dir, ".gemini", "settings.json");
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.mcpServers.forge).toEqual({
      url: "http://127.0.0.1:3141/mcp",
    });
  });

  it("includes auth headers when authToken is provided", () => {
    ensureMcpConfig(dir, "http://127.0.0.1:3141/mcp", "secret-token");

    const claudeConfig = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8"));
    expect(claudeConfig.mcpServers.forge.headers).toEqual({
      Authorization: "Bearer secret-token",
    });

    const geminiConfig = JSON.parse(readFileSync(join(dir, ".gemini", "settings.json"), "utf-8"));
    expect(geminiConfig.mcpServers.forge.headers).toEqual({
      Authorization: "Bearer secret-token",
    });
  });

  it("does not overwrite existing .mcp.json", () => {
    const configPath = join(dir, ".mcp.json");
    writeFileSync(configPath, '{"existing": true}\n');

    ensureMcpConfig(dir, "http://127.0.0.1:3141/mcp");

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.existing).toBe(true);
    expect(config.mcpServers).toBeUndefined();
  });

  it("does not overwrite existing .gemini/settings.json", () => {
    const geminiDir = join(dir, ".gemini");
    const configPath = join(geminiDir, "settings.json");
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(configPath, '{"existing": true}\n');

    ensureMcpConfig(dir, "http://127.0.0.1:3141/mcp");

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.existing).toBe(true);
    expect(config.mcpServers).toBeUndefined();
  });

  it("does not throw on write failure", () => {
    // Pass a non-existent nested path that can't be written to
    expect(() => ensureMcpConfig("/dev/null/bad/path", "http://127.0.0.1:3141/mcp")).not.toThrow();
  });

  it("uses custom port in URL", () => {
    ensureMcpConfig(dir, "http://127.0.0.1:9999/mcp");

    const config = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8"));
    expect(config.mcpServers.forge.url).toBe("http://127.0.0.1:9999/mcp");
  });
});
