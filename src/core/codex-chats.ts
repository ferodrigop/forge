import { join, basename } from "node:path";
import { homedir } from "node:os";
import { readFile, readdir, stat, unlink } from "node:fs/promises";
import { logger } from "../utils/logger.js";

export interface CodexChatMeta {
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

export interface CodexChatMessage {
  type: string;
  [key: string]: unknown;
}

function getCodexSessionsDir(): string {
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  return join(codexHome, "sessions");
}

const CACHE_TTL = 30_000;

export class CodexChats {
  private cachedSessions: CodexChatMeta[] | null = null;
  private cacheTime = 0;

  /** List all Codex chat sessions */
  async listSessions(opts?: {
    project?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ sessions: CodexChatMeta[]; total: number }> {
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

  /** Get all events from a specific Codex session */
  async getMessages(sessionId: string): Promise<CodexChatMessage[]> {
    const meta = await this.findSession(sessionId);
    if (!meta) return [];

    try {
      const raw = await readFile(meta.filePath, "utf-8");
      const messages: CodexChatMessage[] = [];
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          messages.push(JSON.parse(trimmed) as CodexChatMessage);
        } catch {
          // skip malformed
        }
      }
      return messages;
    } catch {
      return [];
    }
  }

  /** Delete a Codex chat session file */
  async deleteSession(sessionId: string): Promise<boolean> {
    const meta = await this.findSession(sessionId);
    if (!meta) return false;

    try {
      await unlink(meta.filePath);
      this.cachedSessions = null;
      return true;
    } catch (err) {
      logger.error("Failed to delete codex chat session", { sessionId, error: String(err) });
      return false;
    }
  }

  /** Find a session by ID */
  async findSession(sessionId: string): Promise<CodexChatMeta | null> {
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

  /** Scan ~/.codex/sessions/YYYY/MM/DD/ for rollout-*.jsonl files */
  private async scanAllSessions(): Promise<CodexChatMeta[]> {
    const sessionsDir = getCodexSessionsDir();
    const sessions: CodexChatMeta[] = [];

    // Walk YYYY/MM/DD structure
    let years: string[];
    try {
      years = await readdir(sessionsDir);
    } catch {
      return [];
    }

    for (const year of years) {
      if (!/^\d{4}$/.test(year)) continue;
      const yearDir = join(sessionsDir, year);

      let months: string[];
      try {
        months = await readdir(yearDir);
      } catch {
        continue;
      }

      for (const month of months) {
        if (!/^\d{2}$/.test(month)) continue;
        const monthDir = join(yearDir, month);

        let days: string[];
        try {
          days = await readdir(monthDir);
        } catch {
          continue;
        }

        for (const day of days) {
          if (!/^\d{2}$/.test(day)) continue;
          const dayDir = join(monthDir, day);

          let files: string[];
          try {
            files = await readdir(dayDir);
          } catch {
            continue;
          }

          for (const file of files) {
            if (!file.endsWith(".jsonl")) continue;
            // Skip index files
            if (file === "session_index.jsonl") continue;

            const filePath = join(dayDir, file);
            try {
              const meta = await this.readSessionMeta(filePath, file, `${year}/${month}/${day}`);
              if (meta) sessions.push(meta);
            } catch {
              // skip unreadable
            }
          }
        }
      }
    }

    // Filter out empty sessions
    return sessions.filter((s) => s.messageCount > 0);
  }

  /** Read first N lines of a JSONL file to extract metadata */
  private async readSessionMeta(
    filePath: string,
    fileName: string,
    dateFolder: string,
  ): Promise<CodexChatMeta | null> {
    try {
      const fileStat = await stat(filePath);
      const fd = await readFile(filePath, "utf-8");
      const allLines = fd.split("\n");
      const headerLines = allLines.slice(0, 50);

      // Session ID from filename: rollout-<timestamp>-<uuid>.jsonl → use uuid part
      const sessionId = basename(fileName, ".jsonl");

      let firstMessage = "";
      let timestamp = "";
      let lastTimestamp = "";
      let model: string | undefined;
      let cwd: string | undefined;

      for (const line of headerLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          // Codex JSONL wraps data under "payload"
          const payload = (obj.payload || obj) as Record<string, unknown>;

          // session_meta event
          if (obj.type === "session_meta") {
            if (payload.model && !model) model = String(payload.model);
            if (payload.cwd && !cwd) cwd = String(payload.cwd);
            if ((payload.timestamp || obj.timestamp) && !timestamp) timestamp = String(payload.timestamp || obj.timestamp);
          }

          // Extract timestamp
          const ts = obj.timestamp || payload.timestamp;
          if (ts && !timestamp) timestamp = String(ts);
          if (ts) lastTimestamp = String(ts);

          // First user prompt from response_item with role=user or event_msg
          if (!firstMessage) {
            if (obj.type === "response_item" && payload) {
              // Skip developer/system messages
              if (payload.type === "message" && payload.role === "developer") continue;
              if (payload.type === "message" && payload.role === "user") {
                const content = payload.content;
                if (Array.isArray(content)) {
                  const textPart = content.find((c: Record<string, unknown>) => c.type === "input_text" || c.type === "text");
                  if (textPart) {
                    firstMessage = String((textPart as Record<string, unknown>).text || "").slice(0, 80);
                  }
                } else if (typeof content === "string") {
                  firstMessage = content.slice(0, 80);
                }
              }
            }
            // Also check for prompt in event_msg with user_message type
            if (obj.type === "event_msg" && payload.type === "user_message") {
              const text = payload.message || payload.text || payload.content || "";
              if (typeof text === "string" && text.length > 0) {
                firstMessage = text.slice(0, 80);
              }
            }
          }
        } catch {
          continue;
        }
      }

      // Count messages and tool uses via regex for speed
      let messageCount = 0;
      let toolCount = 0;
      for (const line of allLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Count response_item events (messages, tool calls, etc.)
        if (/"type"\s*:\s*"response_item"/.test(trimmed)) messageCount++;
        // Count command executions and file edits
        if (/"type"\s*:\s*"(command_execution|file_edit|file_create|file_delete|function_call)"/.test(trimmed)) toolCount++;
      }

      if (!timestamp) timestamp = fileStat.mtime.toISOString();
      if (!lastTimestamp) lastTimestamp = fileStat.mtime.toISOString();

      // Derive project name from cwd
      let project = dateFolder;
      if (cwd) {
        const parts = cwd.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~").split("/").filter(Boolean);
        if (parts.length > 0) project = parts.slice(-2).join("/");
      }

      return {
        sessionId,
        project,
        fullPath: cwd || "",
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
