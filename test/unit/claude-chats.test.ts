import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { ClaudeChats } from "../../src/core/claude-chats.js";

let tempDir: string;
let origHome: string | undefined;
let chats: ClaudeChats;

const SESSION_ID = "abc12345-6789-0000-1111-222233334444";

function createSessionContent(): string {
  return [
    JSON.stringify({ type: "summary", timestamp: "2025-06-01T10:00:00Z", model: "claude-sonnet" }),
    JSON.stringify({ type: "human", timestamp: "2025-06-01T10:00:01Z", message: { content: "Help me build a REST API for user authentication" } }),
    JSON.stringify({ type: "assistant", timestamp: "2025-06-01T10:00:05Z", message: { content: [{ type: "text", text: "I'll help you build that." }] } }),
    JSON.stringify({ type: "human", timestamp: "2025-06-01T10:01:00Z", message: { content: "Add JWT support" } }),
  ].join("\n") + "\n";
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "forge-chats-test-"));
  origHome = process.env.HOME;
  process.env.HOME = tempDir;
  chats = new ClaudeChats();
  chats.invalidateCache();

  // Create a mock project directory with a session
  const projectDir = join(tempDir, ".claude", "projects", "-Users-testuser-projects-my-api");
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, `${SESSION_ID}.jsonl`), createSessionContent());
});

afterEach(async () => {
  process.env.HOME = origHome;
  await rm(tempDir, { recursive: true, force: true });
});

describe("ClaudeChats", () => {
  it("listSessions returns sessions from project directories", async () => {
    const { sessions, total } = await chats.listSessions();
    expect(total).toBe(1);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe(SESSION_ID);
    expect(sessions[0].project).toBe("my/api");
    expect(sessions[0].firstMessage).toBe("Help me build a REST API for user authentication");
    expect(sessions[0].model).toBe("claude-sonnet");
    expect(sessions[0].messageCount).toBe(4);
  });

  it("listSessions filters by project", async () => {
    const { total } = await chats.listSessions({ project: "my" });
    expect(total).toBe(1);

    chats.invalidateCache();
    const { total: noMatch } = await chats.listSessions({ project: "nonexistent" });
    expect(noMatch).toBe(0);
  });

  it("listSessions filters by search term", async () => {
    const { total } = await chats.listSessions({ search: "REST API" });
    expect(total).toBe(1);

    chats.invalidateCache();
    const { total: noMatch } = await chats.listSessions({ search: "blockchain" });
    expect(noMatch).toBe(0);
  });

  it("listSessions paginates", async () => {
    const { sessions } = await chats.listSessions({ limit: 1, offset: 0 });
    expect(sessions).toHaveLength(1);

    chats.invalidateCache();
    const { sessions: page2 } = await chats.listSessions({ limit: 1, offset: 1 });
    expect(page2).toHaveLength(0);
  });

  it("getMessages returns all messages", async () => {
    const messages = await chats.getMessages(SESSION_ID);
    expect(messages).toHaveLength(4);
    expect(messages[1].type).toBe("human");
  });

  it("getMessages returns empty for unknown session", async () => {
    chats.invalidateCache();
    const messages = await chats.getMessages("nonexistent");
    expect(messages).toEqual([]);
  });

  it("getMessages supports pagination", async () => {
    const messages = await chats.getMessages(SESSION_ID, { limit: 2, offset: 1 });
    expect(messages).toHaveLength(2);
    expect(messages[0].type).toBe("human");
  });

  it("deleteSession removes the file", async () => {
    const deleted = await chats.deleteSession(SESSION_ID);
    expect(deleted).toBe(true);

    chats.invalidateCache();
    const { total } = await chats.listSessions();
    expect(total).toBe(0);
  });

  it("deleteSession returns false for unknown session", async () => {
    chats.invalidateCache();
    const deleted = await chats.deleteSession("nonexistent");
    expect(deleted).toBe(false);
  });

  it("findSession locates a session by ID", async () => {
    chats.invalidateCache();
    const meta = await chats.findSession(SESSION_ID);
    expect(meta).not.toBeNull();
    expect(meta!.sessionId).toBe(SESSION_ID);
  });

  it("handles empty project directories", async () => {
    const emptyDir = join(tempDir, ".claude", "projects", "-Users-testuser-empty");
    await mkdir(emptyDir, { recursive: true });
    chats.invalidateCache();

    const { total } = await chats.listSessions();
    expect(total).toBe(1); // only the original session
  });

  it("handles missing .claude/projects directory", async () => {
    // Use a different temp dir with no .claude directory
    const emptyHome = await mkdtemp(join(tmpdir(), "forge-chats-empty-"));
    process.env.HOME = emptyHome;
    chats.invalidateCache();

    const { total } = await chats.listSessions();
    expect(total).toBe(0);

    process.env.HOME = tempDir;
    await rm(emptyHome, { recursive: true, force: true });
  });
});
