import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { TerminalSession, type TerminalSessionOptions } from "./terminal-session.js";
import type { ForgeConfig, SessionInfo } from "./types.js";
import { loadState, saveState, clearState } from "./state-store.js";
import { StreamJsonParser } from "./stream-json-parser.js";
import { CommandHistory } from "./command-history.js";
import type { HistoryEvent } from "./stream-json-parser.js";
import { logger } from "../utils/logger.js";

export type SessionManagerEvent =
  | "sessionCreated"
  | "sessionClosed"
  | "sessionUpdated";

export class SessionManager {
  private sessions = new Map<string, TerminalSession>();
  private config: ForgeConfig;
  private emitter = new EventEmitter();
  private staleEntries: SessionInfo[] = [];
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  public readonly commandHistory = new CommandHistory();
  private historyEmitter = new EventEmitter();

  constructor(config: ForgeConfig) {
    this.config = config;
  }

  /** Listen for live history events: (sessionId, event) */
  onHistoryEvent(fn: (sessionId: string, event: HistoryEvent) => void): () => void {
    this.historyEmitter.on("history", fn);
    return () => this.historyEmitter.off("history", fn);
  }

  /** Load persisted session metadata, kill orphan PIDs, start exited-TTL sweep */
  async init(): Promise<void> {
    const persisted = await loadState();
    this.staleEntries = persisted.map((s) => ({
      ...s,
      status: "exited" as const,
      exitedAt: s.exitedAt ?? new Date().toISOString(),
    }));

    // Kill orphan processes from previous run
    for (const stale of this.staleEntries) {
      if (stale.pid && stale.status === "exited") {
        try {
          process.kill(stale.pid, 0); // Check if alive
          process.kill(stale.pid, "SIGTERM"); // Kill orphan
          logger.warn("Killed orphan process", { pid: stale.pid, session: stale.id });
        } catch {
          // Already dead — expected
        }
      }
    }

    if (this.staleEntries.length > 0) {
      logger.info("Loaded stale session entries", { count: this.staleEntries.length });
    }

    // Start periodic sweep for exited sessions past TTL + old history files
    this.sweepTimer = setInterval(() => {
      this.sweepExited();
      this.commandHistory.sweep(7).catch(() => {});
    }, 60_000);
    // Don't keep process alive just for sweep
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  on(event: SessionManagerEvent, listener: (info: SessionInfo) => void): void {
    this.emitter.on(event, listener);
  }

  off(event: SessionManagerEvent, listener: (info: SessionInfo) => void): void {
    this.emitter.off(event, listener);
  }

  create(opts: Omit<TerminalSessionOptions, "id" | "idleTimeout" | "onExit">): TerminalSession {
    if (this.sessions.size >= this.config.maxSessions) {
      throw new Error(
        `Maximum sessions (${this.config.maxSessions}) reached. Close a session first.`
      );
    }

    const id = randomUUID().slice(0, 8);

    const session = new TerminalSession({
      ...opts,
      id,
      bufferSize: opts.bufferSize ?? this.config.bufferSize,
      idleTimeout: this.config.idleTimeout,
      onExit: (sessionId) => {
        logger.info("Session exited, cleaning up", { id: sessionId });
        this.persistState();
      },
    });

    this.sessions.set(id, session);

    // Wire up stream-json parsing for claude-agent sessions
    if (opts.tags?.includes("claude-agent")) {
      const parser = new StreamJsonParser();
      session.onData((data) => {
        const events = parser.feed(data);
        for (const event of events) {
          this.commandHistory.append(id, event);
          this.historyEmitter.emit("history", id, event);
        }
      });
    }

    session.onExit(() => {
      this.emitter.emit("sessionUpdated", session.getInfo());
    });

    this.emitter.emit("sessionCreated", session.getInfo());
    this.persistState();
    return session;
  }

  get(id: string): TerminalSession | undefined {
    return this.sessions.get(id);
  }

  getOrThrow(id: string): TerminalSession {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session "${id}" not found`);
    }
    return session;
  }

  list(): SessionInfo[] {
    const active = Array.from(this.sessions.values()).map((s) => s.getInfo());
    return [...active, ...this.staleEntries];
  }

  close(id: string): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session "${id}" not found`);
    }
    const info = session.getInfo();
    session.close();
    this.sessions.delete(id);
    this.emitter.emit("sessionClosed", { ...info, status: "exited" });
    this.persistState();
  }

  /** Close all sessions — for graceful shutdown */
  closeAll(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    for (const [id, session] of this.sessions) {
      try {
        session.close();
      } catch (err) {
        logger.error("Error closing session", { id, error: String(err) });
      }
    }
    this.sessions.clear();
  }

  /** List sessions filtered by tag */
  listByTag(tag: string): SessionInfo[] {
    return this.list().filter((s) => s.tags?.includes(tag));
  }

  /** Close all active sessions with a matching tag, returns count closed */
  closeByTag(tag: string): number {
    let count = 0;
    for (const [id, session] of this.sessions) {
      const info = session.getInfo();
      if (info.tags?.includes(tag)) {
        session.close();
        this.sessions.delete(id);
        this.emitter.emit("sessionClosed", { ...info, status: "exited" });
        count++;
      }
    }
    if (count > 0) {
      this.persistState();
    }
    return count;
  }

  /** Find an exited session by ID (active exited or stale entry) */
  findExited(id: string): SessionInfo | undefined {
    // Check active sessions first (exited but not yet swept)
    const active = this.sessions.get(id);
    if (active) {
      const info = active.getInfo();
      if (info.status === "exited") return info;
      return undefined; // Still running — can't revive
    }
    // Check stale entries
    return this.staleEntries.find((s) => s.id === id);
  }

  /** Remove a stale entry by ID (used after reviving or deleting ghost sessions) */
  removeStale(id: string): void {
    // Remove from stale entries
    const staleEntry = this.staleEntries.find((s) => s.id === id);
    this.staleEntries = this.staleEntries.filter((s) => s.id !== id);
    // Remove from active sessions if exited
    const session = this.sessions.get(id);
    if (session && session.getInfo().status === "exited") {
      session.close();
      this.sessions.delete(id);
      this.emitter.emit("sessionClosed", { ...session.getInfo(), status: "exited" });
    } else if (staleEntry) {
      // Pure stale entry — still emit so dashboard removes it from the list
      this.emitter.emit("sessionClosed", staleEntry);
    }
    this.persistState();
  }

  /** Clear persisted stale entries */
  async clearHistory(): Promise<void> {
    this.staleEntries = [];
    await clearState();
  }

  get count(): number {
    return this.sessions.size;
  }

  /** Get summary stats for all sessions */
  getStats(): { totalMemoryMB: number; sessions: Array<{ id: string; memoryMB: number | null }> } {
    const sessionStats: Array<{ id: string; memoryMB: number | null }> = [];
    let totalMemoryMB = 0;

    for (const session of this.sessions.values()) {
      const mb = session.getMemoryMB();
      sessionStats.push({ id: session.id, memoryMB: mb });
      if (mb !== null) totalMemoryMB += mb;
    }

    return { totalMemoryMB, sessions: sessionStats };
  }

  /** Remove exited sessions past their TTL */
  private sweepExited(): void {
    const now = Date.now();
    const ttl = this.config.exitedTtl;

    // Sweep stale entries
    const before = this.staleEntries.length;
    this.staleEntries = this.staleEntries.filter((s) => {
      if (!s.exitedAt) return false;
      return now - new Date(s.exitedAt).getTime() < ttl;
    });
    if (this.staleEntries.length < before) {
      logger.info("Swept stale entries", { removed: before - this.staleEntries.length });
    }

    // Sweep exited active sessions (kept around for inspection)
    for (const [id, session] of this.sessions) {
      const info = session.getInfo();
      if (info.status === "exited" && info.exitedAt) {
        if (now - new Date(info.exitedAt).getTime() >= ttl) {
          session.close();
          this.sessions.delete(id);
          this.emitter.emit("sessionClosed", { ...info, status: "exited" });
          logger.info("Auto-removed exited session past TTL", { id });
        }
      }
    }
  }

  /** Fire-and-forget persist of active session infos */
  private persistState(): void {
    const infos = Array.from(this.sessions.values()).map((s) => s.getInfo());
    saveState(infos).catch(() => {});
  }
}
