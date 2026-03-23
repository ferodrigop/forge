import { join, basename } from "node:path";
import { homedir } from "node:os";
import { readFile, readdir, stat, unlink } from "node:fs/promises";
import { logger } from "../utils/logger.js";

export interface GeminiChatMeta {
  sessionId: string;
  project: string;
  fullPath: string;
  firstMessage: string;
  messageCount: number;
  toolCount: number;
  timestamp: string;
  lastTimestamp: string;
  model?: string;
  sizeBytes: number;
  filePath: string;
}

export interface GeminiChatMessage {
  type: string;
  [key: string]: unknown;
}

function getGeminiDir(): string {
  const geminiHome = process.env.GEMINI_HOME || join(homedir(), ".gemini");
  return geminiHome;
}

const CACHE_TTL = 30_000;

export class GeminiChats {
  private cachedSessions: GeminiChatMeta[] | null = null;
  private cacheTime = 0;

  /** List all Gemini chat sessions */
  async listSessions(opts?: {
    project?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ sessions: GeminiChatMeta[]; total: number }> {
    const now = Date.now();
    if (!this.cachedSessions || now - this.cacheTime > CACHE_TTL) {
      this.cachedSessions = await this.scanAllSessions();
      this.cacheTime = now;
    }

    let filtered = this.cachedSessions;

    if (opts?.project) {
      const pf = opts.project.toLowerCase();
      filtered = filtered.filter((s) => s.project.toLowerCase().includes(pf));
    }

    if (opts?.search) {
      const sf = opts.search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.firstMessage.toLowerCase().includes(sf) ||
          s.project.toLowerCase().includes(sf)
      );
    }

    // Sort by most recent first
    filtered.sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime());

    const total = filtered.length;
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? 50;
    const sessions = filtered.slice(offset, offset + limit);

    return { sessions, total };
  }

  /** Get all events from a specific Gemini session */
  async getMessages(sessionId: string): Promise<GeminiChatMessage[]> {
    const meta = await this.findSession(sessionId);
    if (!meta) return [];

    try {
      const raw = await readFile(meta.filePath, "utf-8");
      // Try JSONL first
      const messages: GeminiChatMessage[] = [];
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          messages.push(JSON.parse(trimmed) as GeminiChatMessage);
        } catch {
          // skip malformed
        }
      }
      // If no JSONL lines parsed, try single JSON object
      if (messages.length === 0) {
        try {
          const obj = JSON.parse(raw);
          if (Array.isArray(obj)) {
            return obj.map((m) => m as GeminiChatMessage);
          }
          return [obj as GeminiChatMessage];
        } catch {
          // not valid JSON either
        }
      }
      return messages;
    } catch {
      return [];
    }
  }

  /** Delete a Gemini chat session file */
  async deleteSession(sessionId: string): Promise<boolean> {
    const meta = await this.findSession(sessionId);
    if (!meta) return false;

    try {
      await unlink(meta.filePath);
      this.cachedSessions = null;
      return true;
    } catch (err) {
      logger.error("Failed to delete gemini chat session", { sessionId, error: String(err) });
      return false;
    }
  }

  /** Find a session by ID */
  async findSession(sessionId: string): Promise<GeminiChatMeta | null> {
    if (this.cachedSessions && Date.now() - this.cacheTime < CACHE_TTL) {
      const found = this.cachedSessions.find((s) => s.sessionId === sessionId);
      if (found) return found;
    }

    const sessions = await this.scanAllSessions();
    this.cachedSessions = sessions;
    this.cacheTime = Date.now();
    return sessions.find((s) => s.sessionId === sessionId) || null;
  }

  /** Invalidate cache */
  invalidateCache(): void {
    this.cachedSessions = null;
  }

  /**
   * Scan ~/.gemini/ for chat session files.
   *
   * Gemini CLI stores sessions under ~/.gemini/tmp/<project_hash>/chats/
   * and may also store them under other directory structures.
   * We recursively scan for .json and .jsonl files.
   */
  private async scanAllSessions(): Promise<GeminiChatMeta[]> {
    const geminiDir = getGeminiDir();
    const sessions: GeminiChatMeta[] = [];

    // Scan ~/.gemini/tmp/ for project directories with chat subdirs
    const tmpDir = join(geminiDir, "tmp");
    try {
      const projectDirs = await readdir(tmpDir);
      for (const projHash of projectDirs) {
        const chatsDir = join(tmpDir, projHash, "chats");
        await this.scanDir(chatsDir, projHash, sessions);
      }
    } catch {
      // ~/.gemini/tmp/ doesn't exist — that's fine
    }

    // Also scan ~/.gemini/sessions/ if it exists (alternative layout)
    const sessionsDir = join(geminiDir, "sessions");
    try {
      await this.scanDir(sessionsDir, "sessions", sessions);
    } catch {
      // doesn't exist — fine
    }

    return sessions.filter((s) => s.messageCount > 0);
  }

  /** Scan a directory for .json/.jsonl session files */
  private async scanDir(dir: string, project: string, sessions: GeminiChatMeta[]): Promise<void> {
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return;
    }

    for (const file of files) {
      if (!file.endsWith(".json") && !file.endsWith(".jsonl")) continue;
      const filePath = join(dir, file);
      try {
        const meta = await this.readSessionMeta(filePath, file, project);
        if (meta) sessions.push(meta);
      } catch {
        // skip unreadable
      }
    }
  }

  /** Read a session file to extract metadata */
  private async readSessionMeta(
    filePath: string,
    fileName: string,
    project: string,
  ): Promise<GeminiChatMeta | null> {
    try {
      const fileStat = await stat(filePath);
      const fd = await readFile(filePath, "utf-8");
      const allLines = fd.split("\n");
      const headerLines = allLines.slice(0, 50);

      const sessionId = basename(fileName, fileName.endsWith(".jsonl") ? ".jsonl" : ".json");

      let firstMessage = "";
      let timestamp = "";
      let lastTimestamp = "";
      let model: string | undefined;
      let messageCount = 0;
      let toolCount = 0;

      for (const line of headerLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed) as Record<string, unknown>;

          // Extract timestamp
          const ts = obj.timestamp as string | undefined;
          if (ts && !timestamp) timestamp = String(ts);
          if (ts) lastTimestamp = String(ts);

          // Extract model
          if (obj.model && !model) model = String(obj.model);

          // Extract first user message
          if (!firstMessage) {
            const role = obj.role as string | undefined;
            const content = obj.content as string | undefined;
            const text = obj.text as string | undefined;
            const msg = obj.message as string | undefined;
            if (role === "user" && (content || text || msg)) {
              firstMessage = String(content || text || msg).slice(0, 80);
            } else if (obj.type === "user" && (content || text || msg)) {
              firstMessage = String(content || text || msg).slice(0, 80);
            }
          }

          messageCount++;
        } catch {
          continue;
        }
      }

      // Count remaining lines for message/tool counts
      for (const line of allLines.slice(50)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        messageCount++;
        // Heuristic tool detection
        if (/"tool_use"|"function_call"|"command"|"shell"/.test(trimmed)) toolCount++;
      }

      if (!timestamp) timestamp = fileStat.mtime.toISOString();
      if (!lastTimestamp) lastTimestamp = fileStat.mtime.toISOString();

      return {
        sessionId,
        project,
        fullPath: "",
        firstMessage: firstMessage || "(empty session)",
        messageCount,
        toolCount,
        timestamp,
        lastTimestamp,
        model,
        sizeBytes: fileStat.size,
        filePath,
      };
    } catch {
      return null;
    }
  }
}
