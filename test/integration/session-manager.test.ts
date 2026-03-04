import { describe, it, expect, afterEach } from "vitest";
import { SessionManager } from "../../src/core/session-manager.js";
import { DEFAULT_CONFIG } from "../../src/core/types.js";

describe("SessionManager", () => {
  let manager: SessionManager;

  afterEach(() => {
    manager?.closeAll();
  });

  it("creates and lists sessions", () => {
    manager = new SessionManager({ ...DEFAULT_CONFIG, idleTimeout: 0 });
    const session = manager.create({ command: "/bin/sh" });
    expect(session.status).toBe("running");
    expect(manager.list()).toHaveLength(1);
    expect(manager.list()[0].id).toBe(session.id);
  });

  it("get returns session by ID", () => {
    manager = new SessionManager({ ...DEFAULT_CONFIG, idleTimeout: 0 });
    const session = manager.create({ command: "/bin/sh" });
    expect(manager.get(session.id)).toBe(session);
  });

  it("getOrThrow throws for unknown ID", () => {
    manager = new SessionManager({ ...DEFAULT_CONFIG, idleTimeout: 0 });
    expect(() => manager.getOrThrow("nonexistent")).toThrow("not found");
  });

  it("enforces max sessions limit", () => {
    manager = new SessionManager({ ...DEFAULT_CONFIG, maxSessions: 2, idleTimeout: 0 });
    manager.create({ command: "/bin/sh" });
    manager.create({ command: "/bin/sh" });
    expect(() => manager.create({ command: "/bin/sh" })).toThrow("Maximum sessions");
  });

  it("close removes session from manager", () => {
    manager = new SessionManager({ ...DEFAULT_CONFIG, idleTimeout: 0 });
    const session = manager.create({ command: "/bin/sh" });
    expect(manager.count).toBe(1);
    manager.close(session.id);
    expect(manager.count).toBe(0);
    expect(manager.get(session.id)).toBeUndefined();
  });

  it("close throws for unknown session", () => {
    manager = new SessionManager({ ...DEFAULT_CONFIG, idleTimeout: 0 });
    expect(() => manager.close("nonexistent")).toThrow("not found");
  });

  it("closeAll cleans up everything", () => {
    manager = new SessionManager({ ...DEFAULT_CONFIG, idleTimeout: 0 });
    manager.create({ command: "/bin/sh" });
    manager.create({ command: "/bin/sh" });
    expect(manager.count).toBe(2);
    manager.closeAll();
    expect(manager.count).toBe(0);
  });
});
