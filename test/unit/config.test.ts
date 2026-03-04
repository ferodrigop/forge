import { describe, it, expect, afterEach } from "vitest";
import { parseConfig } from "../../src/utils/config.js";

describe("parseConfig", () => {
  const originalEnv = { ...process.env };

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
    const config = parseConfig([]);
    expect(config.maxSessions).toBe(20);
    expect(config.dashboard).toBe(true);
  });

  it("ignores invalid numbers", () => {
    const config = parseConfig(["--max-sessions", "abc"]);
    expect(config.maxSessions).toBe(10); // default
  });
});
