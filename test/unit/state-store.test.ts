import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { loadState, saveState, clearState } from "../../src/core/state-store.js";
import type { SessionInfo } from "../../src/core/types.js";

let tempDir: string;
let origHome: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "forge-state-test-"));
  origHome = process.env.HOME;
  process.env.HOME = tempDir;
});

afterEach(async () => {
  process.env.HOME = origHome;
  await rm(tempDir, { recursive: true, force: true });
});

const fakeSessions: SessionInfo[] = [
  {
    id: "abc12345",
    pid: 1234,
    command: "/bin/sh",
    cwd: "/tmp",
    cols: 120,
    rows: 24,
    status: "running",
    createdAt: "2025-01-01T00:00:00.000Z",
    lastActivityAt: "2025-01-01T00:01:00.000Z",
    name: "test-session",
  },
];

describe("state-store", () => {
  it("loadState returns [] on missing file", async () => {
    const result = await loadState();
    expect(result).toEqual([]);
  });

  it("saveState + loadState round-trip", async () => {
    await saveState(fakeSessions);
    const loaded = await loadState();
    expect(loaded).toEqual(fakeSessions);
  });

  it("clearState empties state", async () => {
    await saveState(fakeSessions);
    await clearState();
    const loaded = await loadState();
    expect(loaded).toEqual([]);
  });

  it("loadState handles corrupted JSON gracefully", async () => {
    const stateDir = join(tempDir, ".forge");
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, "sessions.json"), "not valid json{{{");
    const result = await loadState();
    expect(result).toEqual([]);
  });
});
