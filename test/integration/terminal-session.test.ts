import { describe, it, expect, afterEach } from "vitest";
import { TerminalSession } from "../../src/core/terminal-session.js";

describe("TerminalSession", () => {
  const sessions: TerminalSession[] = [];

  function createSession(opts?: Partial<Parameters<typeof TerminalSession.prototype.write>[0]>) {
    const session = new TerminalSession({
      id: `test-${Date.now()}`,
      command: "/bin/sh",
      idleTimeout: 0, // disable idle timeout for tests
      bufferSize: 4096,
      ...opts,
    });
    sessions.push(session);
    return session;
  }

  afterEach(() => {
    for (const s of sessions) {
      try { s.close(); } catch { /* ignore */ }
    }
    sessions.length = 0;
  });

  it("creates a session with correct info", () => {
    const session = createSession();
    const info = session.getInfo();
    expect(info.id).toContain("test-");
    expect(info.status).toBe("running");
    expect(info.command).toBe("/bin/sh");
    expect(info.pid).toBeGreaterThan(0);
  });

  it("writes and reads output", async () => {
    const session = createSession();
    session.write("echo hello-forge\n");

    // Wait for output
    await new Promise((r) => setTimeout(r, 500));

    const { data } = session.read();
    expect(data).toContain("hello-forge");
  });

  it("read_screen returns clean text", async () => {
    const session = createSession();
    session.write("echo screen-test\n");

    await new Promise((r) => setTimeout(r, 500));

    const screen = session.readScreen();
    expect(screen).toContain("screen-test");
    // Should not contain raw ANSI escape codes
    expect(screen).not.toMatch(/\x1B\[/);
  });

  it("incremental reads only return new data", async () => {
    const session = createSession();
    session.write("echo first\n");
    await new Promise((r) => setTimeout(r, 500));

    const r1 = session.read();
    expect(r1.data).toContain("first");

    session.write("echo second\n");
    await new Promise((r) => setTimeout(r, 500));

    const r2 = session.read();
    expect(r2.data).toContain("second");
    expect(r2.data).not.toContain("first"); // first was already consumed
  });

  it("resize changes dimensions", () => {
    const session = createSession();
    session.resize(80, 40);
    expect(session.cols).toBe(80);
    expect(session.rows).toBe(40);
  });

  it("close kills the session", () => {
    const session = createSession();
    expect(session.status).toBe("running");
    session.close();
    expect(session.status).toBe("exited");
  });

  it("write to closed session throws", () => {
    const session = createSession();
    session.close();
    expect(() => session.write("test")).toThrow("not running");
  });

  it("detects process exit", async () => {
    const session = createSession();
    session.write("exit 0\n");
    await new Promise((r) => setTimeout(r, 500));
    expect(session.status).toBe("exited");
  });
});
