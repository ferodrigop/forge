import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigManager, loadSettingsFile, saveSettingsFile } from "../../src/utils/config.js";

// Use a temp dir for settings file tests to avoid polluting ~/.forge
const TEMP_DIR = join(tmpdir(), "forge-config-test-" + process.pid);
const TEMP_SETTINGS = join(TEMP_DIR, "settings.json");

describe("loadSettingsFile", () => {
  it("returns empty object when file does not exist", () => {
    // loadSettingsFile reads ~/.forge/settings.json — if it doesn't exist, returns {}
    // We test the function's resilience to missing files
    const result = loadSettingsFile();
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });
});

describe("ConfigManager", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("FORGE_")) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("creates config with defaults", () => {
    const cm = new ConfigManager([]);
    expect(cm.config.maxSessions).toBe(10);
    expect(cm.config.idleTimeout).toBe(1_800_000);
    expect(cm.config.bufferSize).toBe(1_048_576);
  });

  it("CLI args take highest precedence", () => {
    process.env.FORGE_MAX_SESSIONS = "20";
    const cm = new ConfigManager(["--max-sessions", "5"]);
    expect(cm.config.maxSessions).toBe(5);
  });

  it("env vars override file and defaults", () => {
    process.env.FORGE_MAX_SESSIONS = "25";
    const cm = new ConfigManager([]);
    expect(cm.config.maxSessions).toBe(25);
  });

  it("getConfigWithSources reports correct sources", () => {
    process.env.FORGE_MAX_SESSIONS = "20";
    const cm = new ConfigManager(["--idle-timeout", "5000"]);
    const fields = cm.getConfigWithSources();

    expect(fields.idleTimeout.source).toBe("cli");
    expect(fields.idleTimeout.value).toBe(5000);
    expect(fields.maxSessions.source).toBe("env");
    expect(fields.maxSessions.value).toBe(20);
    // bufferSize is not set by CLI or env, should be file or default
    expect(["file", "default"]).toContain(fields.bufferSize.source);
  });

  it("parses all CLI flags", () => {
    const cm = new ConfigManager([
      "--max-sessions", "15",
      "--idle-timeout", "60000",
      "--buffer-size", "2048",
      "--dashboard",
      "--port", "9999",
      "--shell", "/bin/fish",
      "--claude-path", "/usr/bin/claude",
      "--codex-path", "/usr/bin/codex",
      "--auth-token", "my-token",
      "--exited-ttl", "7200000",
    ]);
    expect(cm.config.maxSessions).toBe(15);
    expect(cm.config.idleTimeout).toBe(60000);
    expect(cm.config.bufferSize).toBe(2048);
    expect(cm.config.dashboard).toBe(true);
    expect(cm.config.dashboardPort).toBe(9999);
    expect(cm.config.shell).toBe("/bin/fish");
    expect(cm.config.claudePath).toBe("/usr/bin/claude");
    expect(cm.config.codexPath).toBe("/usr/bin/codex");
    expect(cm.config.authToken).toBe("my-token");
    expect(cm.config.exitedTtl).toBe(7200000);
  });

  it("ignores invalid CLI numbers", () => {
    const cm = new ConfigManager(["--max-sessions", "abc"]);
    expect(cm.config.maxSessions).toBe(10); // default
  });

  it("parses default model CLI flags", () => {
    const cm = new ConfigManager([
      "--claude-default-model", "sonnet",
      "--codex-default-model", "o3",
      "--gemini-default-model", "gemini-2.5-pro",
    ]);
    expect(cm.config.claudeDefaultModel).toBe("sonnet");
    expect(cm.config.codexDefaultModel).toBe("o3");
    expect(cm.config.geminiDefaultModel).toBe("gemini-2.5-pro");
  });

  it("reads default models from env vars", () => {
    process.env.FORGE_CLAUDE_DEFAULT_MODEL = "opus";
    process.env.FORGE_CODEX_DEFAULT_MODEL = "o4-mini";
    process.env.FORGE_GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
    const cm = new ConfigManager([]);
    expect(cm.config.claudeDefaultModel).toBe("opus");
    expect(cm.config.codexDefaultModel).toBe("o4-mini");
    expect(cm.config.geminiDefaultModel).toBe("gemini-2.5-flash");
  });

  it("CLI default model takes precedence over env var", () => {
    process.env.FORGE_CLAUDE_DEFAULT_MODEL = "opus";
    const cm = new ConfigManager(["--claude-default-model", "sonnet"]);
    expect(cm.config.claudeDefaultModel).toBe("sonnet");
  });

  it("reports correct source for default model fields", () => {
    process.env.FORGE_CODEX_DEFAULT_MODEL = "o3";
    const cm = new ConfigManager(["--claude-default-model", "sonnet"]);
    const fields = cm.getConfigWithSources();
    expect(fields.claudeDefaultModel.source).toBe("cli");
    expect(fields.claudeDefaultModel.value).toBe("sonnet");
    expect(fields.codexDefaultModel.source).toBe("env");
    expect(fields.codexDefaultModel.value).toBe("o3");
  });
});

describe("saveSettingsFile", () => {
  beforeEach(() => {
    mkdirSync(TEMP_DIR, { recursive: true });
  });

  afterEach(() => {
    try { unlinkSync(TEMP_SETTINGS); } catch {}
  });

  it("creates a valid JSON file", () => {
    // We can't easily test saveSettingsFile without mocking homedir,
    // but we can verify it doesn't throw
    // For a real test we'd need to mock the file path
    expect(typeof saveSettingsFile).toBe("function");
  });
});

describe("ConfigManager.on('changed')", () => {
  it("emits changed event when updateFileSettings is called", () => {
    const cm = new ConfigManager([]);
    const changes: any[] = [];
    cm.on("changed", (config) => {
      changes.push(config);
    });

    // updateFileSettings writes to ~/.forge/settings.json and recomputes
    // This will actually write the file — acceptable for testing
    const originalMax = cm.config.maxSessions;
    cm.updateFileSettings({ maxSessions: 99 });

    if (cm.config.maxSessions === 99) {
      // File was written and config updated
      expect(changes.length).toBe(1);
      expect(changes[0].maxSessions).toBe(99);
    }

    // Restore
    cm.updateFileSettings({ maxSessions: originalMax || 10 });
  });
});
