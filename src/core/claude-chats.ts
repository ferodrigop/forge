import { join, basename } from "node:path";
import { homedir } from "node:os";
import { readFile, readdir, stat, unlink, rm } from "node:fs/promises";
import { logger } from "../utils/logger.js";

export interface ChatSessionMeta {
  sessionId: string;
  project: string;
  firstMessage: string;
  messageCount: number;
  timestamp: string;
  lastTimestamp: string;
  gitBranch?: string;
  model?: string;
  sizeBytes: number;
  filePath: string;
}

export interface ChatMessage {
  role: string;
  content: unknown;
  timestamp?: string;
  type?: string;
  [key: string]: unknown;
}

function getProjectsDir(): string {
  return join(homedir(), ".claude", "projects");
}

/** Decode a claude projects folder name back to a readable path */
function decodeProjectPath(folderName: string): string {
  // Claude encodes paths like: -Users-rodrigopineda-foo-bar
  return folderName.replace(/^-/, "/").replace(/-/g, "/");
}

/** Get a short display name from a project folder — last 2 path segments */
function shortProjectName(folderName: string): string {
  const decoded = decodeProjectPath(folderName);
  const parts = decoded.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}

const CACHE_TTL = 30_000; // 30 seconds

export class ClaudeChats {
  private cachedSessions: ChatSessionMeta[] | null = null;
  private cacheTime = 0;

  /** List all Claude Code chat sessions across all projects */
  async listSessions(opts?: {
    project?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ sessions: ChatSessionMeta[]; total: number }> {
    const now = Date.now();
    if (!this.cachedSessions || now - this.cacheTime > CACHE_TTL) {
      this.cachedSessions = await this.scanAllSessions();
      this.cacheTime = now;
    }

    let filtered = this.cachedSessions;

    if (opts?.project) {
      const projectFilter = opts.project.toLowerCase();
      filtered = filtered.filter((s) => s.project.toLowerCase().includes(projectFilter));
    }

    if (opts?.search) {
      const searchFilter = opts.search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.firstMessage.toLowerCase().includes(searchFilter) ||
          s.project.toLowerCase().includes(searchFilter)
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

  /** Get messages from a specific session */
  async getMessages(sessionId: string, opts?: { limit?: number; offset?: number }): Promise<ChatMessage[]> {
    const meta = await this.findSession(sessionId);
    if (!meta) return [];

    try {
      const raw = await readFile(meta.filePath, "utf-8");
      const messages: ChatMessage[] = [];

      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          messages.push(JSON.parse(trimmed) as ChatMessage);
        } catch {
          // skip malformed lines
        }
      }

      const offset = opts?.offset ?? 0;
      const limit = opts?.limit ?? messages.length;
      return messages.slice(offset, offset + limit);
    } catch {
      return [];
    }
  }

  /** Delete a chat session and its associated subdirectory */
  async deleteSession(sessionId: string): Promise<boolean> {
    const meta = await this.findSession(sessionId);
    if (!meta) return false;

    try {
      // Delete the JSONL file
      await unlink(meta.filePath);

      // Try to delete associated subdir (same name without .jsonl)
      const subdir = meta.filePath.replace(/\.jsonl$/, "");
      try {
        await rm(subdir, { recursive: true, force: true });
      } catch {
        // subdir may not exist
      }

      // Invalidate cache
      this.cachedSessions = null;
      return true;
    } catch (err) {
      logger.error("Failed to delete chat session", { sessionId, error: String(err) });
      return false;
    }
  }

  /** Find a session by ID across all projects */
  async findSession(sessionId: string): Promise<ChatSessionMeta | null> {
    // Check cache first
    if (this.cachedSessions && Date.now() - this.cacheTime < CACHE_TTL) {
      const found = this.cachedSessions.find((s) => s.sessionId === sessionId);
      if (found) return found;
    }

    // Full scan
    const sessions = await this.scanAllSessions();
    this.cachedSessions = sessions;
    this.cacheTime = Date.now();
    return sessions.find((s) => s.sessionId === sessionId) || null;
  }

  /** Invalidate the session cache */
  invalidateCache(): void {
    this.cachedSessions = null;
  }

  private async scanAllSessions(): Promise<ChatSessionMeta[]> {
    const projectsDir = getProjectsDir();
    const sessions: ChatSessionMeta[] = [];

    let projectFolders: string[];
    try {
      projectFolders = await readdir(projectsDir);
    } catch {
      return [];
    }

    for (const folder of projectFolders) {
      const projectDir = join(projectsDir, folder);
      try {
        const dirStat = await stat(projectDir);
        if (!dirStat.isDirectory()) continue;
      } catch {
        continue;
      }

      const projectName = shortProjectName(folder);

      try {
        const files = await readdir(projectDir);
        for (const file of files) {
          if (!file.endsWith(".jsonl")) continue;

          const filePath = join(projectDir, file);
          const sessionId = basename(file, ".jsonl");

          try {
            const meta = await this.readSessionMeta(filePath, sessionId, projectName);
            if (meta) sessions.push(meta);
          } catch {
            // skip unreadable files
          }
        }
      } catch {
        continue;
      }
    }

    return sessions;
  }

  /** Read only the first few lines of a JSONL to extract metadata (fast) */
  private async readSessionMeta(
    filePath: string,
    sessionId: string,
    project: string
  ): Promise<ChatSessionMeta | null> {
    try {
      const fileStat = await stat(filePath);

      // Read first 8KB for metadata extraction
      const fd = await readFile(filePath, "utf-8");
      const lines = fd.split("\n").slice(0, 20);

      let firstMessage = "";
      let messageCount = 0;
      let timestamp = "";
      let lastTimestamp = "";
      let model: string | undefined;
      let gitBranch: string | undefined;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          messageCount++;

          // Extract timestamp
          if (obj.timestamp && !timestamp) {
            timestamp = obj.timestamp;
          }
          if (obj.timestamp) {
            lastTimestamp = obj.timestamp;
          }

          // Extract first user message
          if (!firstMessage && obj.type === "human" && obj.message) {
            const content = obj.message.content;
            if (typeof content === "string") {
              firstMessage = content.slice(0, 80);
            } else if (Array.isArray(content)) {
              const textBlock = content.find((c: Record<string, unknown>) => c.type === "text");
              if (textBlock?.text) {
                firstMessage = String(textBlock.text).slice(0, 80);
              }
            }
          }

          // Extract model
          if (!model && obj.model) {
            model = obj.model;
          }

          // Extract git branch from cwd or metadata
          if (!gitBranch && obj.cwd) {
            // Try to infer branch from path
            const cwdStr = String(obj.cwd);
            const branchMatch = cwdStr.match(/feature\/([^/]+)/);
            if (branchMatch) gitBranch = `feature/${branchMatch[1]}`;
          }
        } catch {
          continue;
        }
      }

      // Count total lines (approximate message count) by counting newlines
      const totalLines = fd.split("\n").filter((l) => l.trim()).length;

      if (!timestamp) {
        timestamp = fileStat.mtime.toISOString();
      }
      if (!lastTimestamp) {
        lastTimestamp = fileStat.mtime.toISOString();
      }

      return {
        sessionId,
        project,
        firstMessage: firstMessage || "(empty session)",
        messageCount: totalLines,
        timestamp,
        lastTimestamp,
        gitBranch,
        model,
        sizeBytes: fileStat.size,
        filePath,
      };
    } catch {
      return null;
    }
  }
}
