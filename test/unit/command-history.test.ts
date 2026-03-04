import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { CommandHistory } from "../../src/core/command-history.js";
import type { HistoryEvent } from "../../src/core/stream-json-parser.js";

let tempDir: string;
let origHome: string | undefined;
let history: CommandHistory;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "forge-history-test-"));
  origHome = process.env.HOME;
  process.env.HOME = tempDir;
  history = new CommandHistory();
});

afterEach(async () => {
  process.env.HOME = origHome;
  await rm(tempDir, { recursive: true, force: true });
});

const sampleEvent: HistoryEvent = {
  type: "tool_call",
  timestamp: "2025-01-01T00:00:00.000Z",
  toolName: "Bash",
  summary: "Bash: git status",
  input: { command: "git status" },
};

const initEvent: HistoryEvent = {
  type: "session_init",
  timestamp: "2025-01-01T00:00:00.000Z",
  cwd: "/tmp",
  model: "sonnet",
};

describe("CommandHistory", () => {
  it("getHistory returns [] for non-existent session", async () => {
    const events = await history.getHistory("nonexistent");
    expect(events).toEqual([]);
  });

  it("append + getHistory round-trip", async () => {
    history.append("test-session", initEvent);
    history.append("test-session", sampleEvent);

    // Wait for fire-and-forget writes
    await new Promise((r) => setTimeout(r, 200));

    const events = await history.getHistory("test-session");
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("session_init");
    expect(events[1].type).toBe("tool_call");
    if (events[1].type === "tool_call") {
      expect(events[1].toolName).toBe("Bash");
    }
  });

  it("deleteHistory removes the file", async () => {
    history.append("del-session", sampleEvent);
    await new Promise((r) => setTimeout(r, 200));

    let events = await history.getHistory("del-session");
    expect(events).toHaveLength(1);

    await history.deleteHistory("del-session");
    events = await history.getHistory("del-session");
    expect(events).toEqual([]);
  });

  it("deleteHistory is safe for non-existent session", async () => {
    await expect(history.deleteHistory("nope")).resolves.not.toThrow();
  });

  it("sweep removes old files", async () => {
    const histDir = join(tempDir, ".forge", "history");
    await mkdir(histDir, { recursive: true });

    // Create an "old" file by writing directly
    await writeFile(join(histDir, "old-session.jsonl"), JSON.stringify(sampleEvent) + "\n");

    // Backdate the file's mtime
    const { utimes } = await import("node:fs/promises");
    const oldDate = new Date(Date.now() - 10 * 86_400_000); // 10 days ago
    await utimes(join(histDir, "old-session.jsonl"), oldDate, oldDate);

    // Create a "new" file
    await writeFile(join(histDir, "new-session.jsonl"), JSON.stringify(sampleEvent) + "\n");

    // Sweep files older than 7 days
    await history.sweep(7);

    const oldEvents = await history.getHistory("old-session");
    expect(oldEvents).toEqual([]);

    const newEvents = await history.getHistory("new-session");
    expect(newEvents).toHaveLength(1);
  });

  it("getHistory handles malformed lines gracefully", async () => {
    const histDir = join(tempDir, ".forge", "history");
    await mkdir(histDir, { recursive: true });
    await writeFile(
      join(histDir, "bad-session.jsonl"),
      JSON.stringify(sampleEvent) + "\nnot json\n" + JSON.stringify(initEvent) + "\n"
    );

    const events = await history.getHistory("bad-session");
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("tool_call");
    expect(events[1].type).toBe("session_init");
  });
});
