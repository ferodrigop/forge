import { join, basename } from "node:path";
import { homedir } from "node:os";
import { readFile, readdir, stat, unlink, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { logger } from "../utils/logger.js";

export interface ChatSessionMeta {
  sessionId: string;
  parentSessionId?: string;
  project: string;
  fullPath: string;
  firstMessage: string;
  messageCount: number;
  toolCount: number;
  resumeCount: number;
  timestamp: string;
  lastTimestamp: string;
  gitBranch?: string;
  model?: string;
  sizeBytes: number;
  filePath: string;
  /** All file paths when this entry represents merged continuations */
  allFilePaths?: string[];
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

/** Decode a claude projects folder name back to a readable path.
 *  Claude encodes `/` as `-`, but directory names can also contain `-`.
 *  We greedily resolve from root, preferring the longest existing filesystem match. */
function decodeProjectPath(folderName: string): string {
  const segments = folderName.replace(/^-/, "").split("-");
  let resolved = "/";
  let i = 0;

  while (i < segments.length) {
    // Try longest possible hyphenated segment first
    let bestLen = 0;
    for (let len = segments.length - i; len >= 1; len--) {
      const candidate = segments.slice(i, i + len).join("-");
      const testPath = join(resolved, candidate);
      if (existsSync(testPath)) {
        bestLen = len;
        break;
      }
    }
    if (bestLen > 0) {
      resolved = join(resolved, segments.slice(i, i + bestLen).join("-"));
      i += bestLen;
    } else {
      // No match — join remaining segments with hyphens as fallback
      resolved = join(resolved, segments.slice(i).join("-"));
      break;
    }
  }

  return resolved;
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

  /** Get messages from a specific session (including merged continuations) */
  async getMessages(sessionId: string, opts?: { limit?: number; offset?: number }): Promise<ChatMessage[]> {
    const meta = await this.findSession(sessionId);
    if (!meta) return [];

    const paths = meta.allFilePaths || [meta.filePath];
    const messages: ChatMessage[] = [];

    for (const fp of paths) {
      try {
        const raw = await readFile(fp, "utf-8");
        for (const line of raw.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            messages.push(JSON.parse(trimmed) as ChatMessage);
          } catch {
            // skip malformed lines
          }
        }
      } catch {
        // skip unreadable files
      }
    }

    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? messages.length;
    return messages.slice(offset, offset + limit);
  }

  /** Delete a chat session and its associated subdirectory (including merged continuations) */
  async deleteSession(sessionId: string): Promise<boolean> {
    const meta = await this.findSession(sessionId);
    if (!meta) return false;

    try {
      // Delete all files (handles merged continuations)
      const paths = meta.allFilePaths || [meta.filePath];
      for (const fp of paths) {
        try {
          await unlink(fp);
          // Try to delete associated subdir (same name without .jsonl)
          const subdir = fp.replace(/\.jsonl$/, "");
          try { await rm(subdir, { recursive: true, force: true }); } catch { /* subdir may not exist */ }
        } catch {
          // file may already be gone
        }
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
      const fullPath = decodeProjectPath(folder);

      try {
        const files = await readdir(projectDir);
        for (const file of files) {
          if (!file.endsWith(".jsonl")) continue;

          const filePath = join(projectDir, file);
          const sessionId = basename(file, ".jsonl");

          try {
            const meta = await this.readSessionMeta(filePath, sessionId, projectName, fullPath);
            if (meta) sessions.push(meta);
          } catch {
            // skip unreadable files
          }
        }
      } catch {
        continue;
      }
    }

    return this.mergeResumedSessions(sessions);
  }

  /** Merge resumed/continued sessions into their root session entry */
  private mergeResumedSessions(sessions: ChatSessionMeta[]): ChatSessionMeta[] {
    const byId = new Map<string, ChatSessionMeta>();
    for (const s of sessions) byId.set(s.sessionId, s);

    // Find the root of each chain by following parentSessionId links
    const rootOf = (s: ChatSessionMeta): string => {
      const visited = new Set<string>();
      let id = s.sessionId;
      while (true) {
        const current = byId.get(id);
        if (!current?.parentSessionId || visited.has(current.parentSessionId)) break;
        visited.add(id);
        // If the parent file exists in our set, follow the chain
        if (byId.has(current.parentSessionId)) {
          id = current.parentSessionId;
        } else {
          // Parent file may have been deleted; this is now the effective root
          break;
        }
      }
      return id;
    };

    // Group sessions by root
    const groups = new Map<string, ChatSessionMeta[]>();
    for (const s of sessions) {
      const root = rootOf(s);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(s);
    }

    // Merge each group into a single entry
    const merged: ChatSessionMeta[] = [];
    for (const [, group] of groups) {
      if (group.length === 1) {
        merged.push(group[0]);
        continue;
      }

      // Sort by timestamp ascending to find the original
      group.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const root = group[0];

      // Use root's firstMessage but aggregate everything else
      const allPaths = group.map((s) => s.filePath);
      merged.push({
        ...root,
        messageCount: group.reduce((sum, s) => sum + s.messageCount, 0),
        toolCount: group.reduce((sum, s) => sum + s.toolCount, 0),
        sizeBytes: group.reduce((sum, s) => sum + s.sizeBytes, 0),
        lastTimestamp: group.reduce((latest, s) =>
          new Date(s.lastTimestamp) > new Date(latest) ? s.lastTimestamp : latest,
          root.lastTimestamp
        ),
        resumeCount: group.length - 1,
        allFilePaths: allPaths,
        model: root.model || group.find((s) => s.model)?.model,
      });
    }

    return merged;
  }

  /** Read only the first few lines of a JSONL to extract metadata (fast) */
  private async readSessionMeta(
    filePath: string,
    sessionId: string,
    project: string,
    fullPath: string
  ): Promise<ChatSessionMeta | null> {
    try {
      const fileStat = await stat(filePath);

      // Read file for metadata extraction
      const fd = await readFile(filePath, "utf-8");
      const allLines = fd.split("\n");
      const headerLines = allLines.slice(0, 50);

      let firstMessage = "";
      let timestamp = "";
      let lastTimestamp = "";
      let model: string | undefined;
      let gitBranch: string | undefined;
      let parentSessionId: string | undefined;

      for (const line of headerLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);

          // Detect resumed sessions: sessionId in the JSONL differs from the filename
          if (!parentSessionId && obj.sessionId && obj.sessionId !== sessionId) {
            parentSessionId = obj.sessionId;
          }

          // Extract timestamp
          if (obj.timestamp && !timestamp) {
            timestamp = obj.timestamp;
          }
          if (obj.timestamp) {
            lastTimestamp = obj.timestamp;
          }

          // Extract first user message (Claude Code uses "user" type, some older formats use "human")
          if (!firstMessage && (obj.type === "user" || obj.type === "human") && obj.message) {
            let candidate = "";
            const content = obj.message.content;
            if (typeof content === "string") {
              candidate = content.slice(0, 80);
            } else if (Array.isArray(content)) {
              const textBlock = content.find((c: Record<string, unknown>) => c.type === "text");
              if (textBlock?.text) {
                candidate = String(textBlock.text).slice(0, 80);
              }
            }
            // Skip system artifacts like tool-use interruptions
            if (candidate && !candidate.startsWith("[Request interrupted")) {
              firstMessage = candidate;
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

      // Count messages and tools using regex for speed (no JSON.parse per line)
      let messageCount = 0;
      let toolCount = 0;
      for (const line of allLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/"type"\s*:\s*"(user|human|assistant)"/.test(trimmed)) {
          messageCount++;
        }
        if (/"type"\s*:\s*"tool_use"/.test(trimmed) || /"tool_use"/.test(trimmed)) {
          toolCount++;
        }
      }

      if (!timestamp) {
        timestamp = fileStat.mtime.toISOString();
      }
      if (!lastTimestamp) {
        lastTimestamp = fileStat.mtime.toISOString();
      }

      return {
        sessionId,
        parentSessionId,
        project,
        fullPath,
        firstMessage: firstMessage || "(empty session)",
        messageCount,
        toolCount,
        resumeCount: 0,
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
