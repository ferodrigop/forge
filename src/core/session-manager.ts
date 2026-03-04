import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { TerminalSession, type TerminalSessionOptions } from "./terminal-session.js";
import type { ForgeConfig, SessionInfo } from "./types.js";
import { loadState, saveState, clearState } from "./state-store.js";
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

  constructor(config: ForgeConfig) {
    this.config = config;
  }

  /** Load persisted session metadata (marks all as exited) */
  async init(): Promise<void> {
    const persisted = await loadState();
    this.staleEntries = persisted.map((s) => ({ ...s, status: "exited" as const }));
    if (this.staleEntries.length > 0) {
      logger.info("Loaded stale session entries", { count: this.staleEntries.length });
    }
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
    for (const [id, session] of this.sessions) {
      try {
        session.close();
      } catch (err) {
        logger.error("Error closing session", { id, error: String(err) });
      }
    }
    this.sessions.clear();
  }

  /** Clear persisted stale entries */
  async clearHistory(): Promise<void> {
    this.staleEntries = [];
    await clearState();
  }

  get count(): number {
    return this.sessions.size;
  }

  /** Fire-and-forget persist of active session infos */
  private persistState(): void {
    const infos = Array.from(this.sessions.values()).map((s) => s.getInfo());
    saveState(infos).catch(() => {});
  }
}
