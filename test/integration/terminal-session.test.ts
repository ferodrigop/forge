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

  describe("respawn on exit", () => {
    it("status stays running through respawn", async () => {
      // Spawn a short-lived command with respawn enabled
      const session = createSession({ command: "/bin/sh", args: ["-c", "exit 0"] });
      session.enableRespawnOnExit("/bin/sh");

      // Wait for the short-lived command to exit and shell to respawn
      await new Promise((r) => setTimeout(r, 1000));

      expect(session.status).toBe("running");
      // The exit message should appear in the buffer
      const buf = session.readFullBuffer();
      expect(buf).toContain("agent exited with code 0");
      expect(buf).toContain("shell restored");
    });

    it("write() after respawn routes to new PTY", async () => {
      const session = createSession({ command: "/bin/sh", args: ["-c", "exit 0"] });
      session.enableRespawnOnExit("/bin/sh");

      await new Promise((r) => setTimeout(r, 1000));
      expect(session.status).toBe("running");

      // Write to the respawned shell and verify output
      session.write("echo respawn-test-output\n");
      await new Promise((r) => setTimeout(r, 500));

      const { data } = session.read();
      expect(data).toContain("respawn-test-output");
    });

    it("shell exit after respawn sets status to exited with no second respawn", async () => {
      const session = createSession({ command: "/bin/sh", args: ["-c", "exit 42"] });
      session.enableRespawnOnExit("/bin/sh");

      // Wait for agent exit + shell respawn
      await new Promise((r) => setTimeout(r, 1000));
      expect(session.status).toBe("running");

      // Now exit the respawned shell — should NOT respawn again
      session.write("exit 7\n");
      await new Promise((r) => setTimeout(r, 500));

      expect(session.status).toBe("exited");
      expect(session.exitCode).toBe(7);
    });

    it("close() kills the respawned PTY", async () => {
      const session = createSession({ command: "/bin/sh", args: ["-c", "exit 0"] });
      session.enableRespawnOnExit("/bin/sh");

      await new Promise((r) => setTimeout(r, 1000));
      expect(session.status).toBe("running");

      const pid = session.pid;
      expect(pid).toBeGreaterThan(0);

      session.close();
      expect(session.status).toBe("exited");

      // Wait for the SIGTERM to be delivered and process to exit
      await new Promise((r) => setTimeout(r, 200));

      let alive = false;
      try { process.kill(pid, 0); alive = true; } catch { /* expected */ }
      expect(alive).toBe(false);
    });
  });
});
