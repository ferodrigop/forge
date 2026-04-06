import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { parseConfig, _setSettingsPath, _resetSettingsPath } from "../../src/utils/config.js";

describe("parseConfig", () => {
  const originalEnv = { ...process.env };

  // Use a non-existent settings file so user's config doesn't affect tests
  beforeAll(() => { _setSettingsPath("/tmp/forge-test-nonexistent/settings.json"); });
  afterAll(() => { _resetSettingsPath(); });

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("FORGE_")) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("returns defaults with no args and no env", () => {
    const config = parseConfig([]);
    expect(config.maxSessions).toBe(10);
    expect(config.idleTimeout).toBe(1_800_000);
    expect(config.bufferSize).toBe(1_048_576);
    expect(config.dashboard).toBe(false);
    expect(config.dashboardPort).toBe(3141);
  });

  it("parses CLI flags", () => {
    const config = parseConfig([
      "--max-sessions", "5",
      "--idle-timeout", "60000",
      "--buffer-size", "512",
      "--dashboard",
      "--port", "8080",
      "--shell", "/bin/zsh",
    ]);
    expect(config.maxSessions).toBe(5);
    expect(config.idleTimeout).toBe(60000);
    expect(config.bufferSize).toBe(512);
    expect(config.dashboard).toBe(true);
    expect(config.dashboardPort).toBe(8080);
    expect(config.shell).toBe("/bin/zsh");
  });

  it("prefers CLI flags over env vars", () => {
    process.env.FORGE_MAX_SESSIONS = "20";
    const config = parseConfig(["--max-sessions", "3"]);
    expect(config.maxSessions).toBe(3);
  });

  it("falls back to env vars", () => {
    process.env.FORGE_MAX_SESSIONS = "20";
    process.env.FORGE_DASHBOARD = "true";
    process.env.FORGE_AUTH_TOKEN = "env-secret";
    const config = parseConfig([]);
    expect(config.maxSessions).toBe(20);
    expect(config.dashboard).toBe(true);
    expect(config.authToken).toBe("env-secret");
  });

  it("ignores invalid numbers", () => {
    const config = parseConfig(["--max-sessions", "abc"]);
    expect(config.maxSessions).toBe(10); // default
  });

  it("prefers auth token from CLI over env", () => {
    process.env.FORGE_AUTH_TOKEN = "env-secret";
    const config = parseConfig(["--auth-token", "cli-secret"]);
    expect(config.authToken).toBe("cli-secret");
  });

  it("codexPath defaults to 'codex'", () => {
    const config = parseConfig([]);
    expect(config.codexPath).toBe("codex");
  });

  it("codexPath from CLI flag", () => {
    const config = parseConfig(["--codex-path", "/usr/local/bin/codex"]);
    expect(config.codexPath).toBe("/usr/local/bin/codex");
  });

  it("codexPath from env var", () => {
    process.env.FORGE_CODEX_PATH = "/opt/codex";
    const config = parseConfig([]);
    expect(config.codexPath).toBe("/opt/codex");
  });

  it("codexPath CLI flag takes precedence over env var", () => {
    process.env.FORGE_CODEX_PATH = "/opt/codex";
    const config = parseConfig(["--codex-path", "/usr/local/bin/codex"]);
    expect(config.codexPath).toBe("/usr/local/bin/codex");
  });

  it("default models are undefined when not set", () => {
    const config = parseConfig([]);
    expect(config.claudeDefaultModel).toBeUndefined();
    expect(config.codexDefaultModel).toBeUndefined();
    expect(config.geminiDefaultModel).toBeUndefined();
  });

  it("parses default model CLI flags", () => {
    const config = parseConfig([
      "--claude-default-model", "sonnet",
      "--codex-default-model", "o3",
      "--gemini-default-model", "gemini-2.5-pro",
    ]);
    expect(config.claudeDefaultModel).toBe("sonnet");
    expect(config.codexDefaultModel).toBe("o3");
    expect(config.geminiDefaultModel).toBe("gemini-2.5-pro");
  });

  it("reads default models from env vars", () => {
    process.env.FORGE_CLAUDE_DEFAULT_MODEL = "opus";
    process.env.FORGE_CODEX_DEFAULT_MODEL = "o4-mini";
    process.env.FORGE_GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
    const config = parseConfig([]);
    expect(config.claudeDefaultModel).toBe("opus");
    expect(config.codexDefaultModel).toBe("o4-mini");
    expect(config.geminiDefaultModel).toBe("gemini-2.5-flash");
  });

  it("CLI default model flags take precedence over env vars", () => {
    process.env.FORGE_CLAUDE_DEFAULT_MODEL = "opus";
    const config = parseConfig(["--claude-default-model", "sonnet"]);
    expect(config.claudeDefaultModel).toBe("sonnet");
  });
});
