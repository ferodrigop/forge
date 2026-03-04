import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { TerminalSession, type TerminalSessionOptions } from "./terminal-session.js";
import type { ForgeConfig, SessionInfo } from "./types.js";
import { logger } from "../utils/logger.js";

export type SessionManagerEvent =
  | "sessionCreated"
  | "sessionClosed"
  | "sessionUpdated";

export class SessionManager {
  private sessions = new Map<string, TerminalSession>();
  private config: ForgeConfig;
  private emitter = new EventEmitter();

  constructor(config: ForgeConfig) {
    this.config = config;
  }

  on(event: SessionManagerEvent, listener: (info: SessionInfo) => void): void {
    this.emitter.on(event, listener);
  }

  off(event: SessionManagerEvent, listener: (info: SessionInfo) => void): void {
    this.emitter.off(event, listener);
  }

  create(opts: Omit<TerminalSessionOptions, "id" | "bufferSize" | "idleTimeout" | "onExit">): TerminalSession {
    if (this.sessions.size >= this.config.maxSessions) {
      throw new Error(
        `Maximum sessions (${this.config.maxSessions}) reached. Close a session first.`
      );
    }

    const id = randomUUID().slice(0, 8);

    const session = new TerminalSession({
      ...opts,
      id,
      bufferSize: this.config.bufferSize,
      idleTimeout: this.config.idleTimeout,
      onExit: (sessionId) => {
        logger.info("Session exited, cleaning up", { id: sessionId });
      },
    });

    this.sessions.set(id, session);

    session.onExit(() => {
      this.emitter.emit("sessionUpdated", session.getInfo());
    });

    this.emitter.emit("sessionCreated", session.getInfo());
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
    return Array.from(this.sessions.values()).map((s) => s.getInfo());
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

  get count(): number {
    return this.sessions.size;
  }
}
