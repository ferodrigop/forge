import type { WebSocket } from "ws";
import type { SessionManager } from "../core/session-manager.js";
import type { SessionInfo } from "../core/types.js";
import type { HistoryEvent } from "../core/stream-json-parser.js";
import { logger } from "../utils/logger.js";

interface ClientState {
  ws: WebSocket;
  subscribedSessionId: string | null;
  unsubscribeData: (() => void) | null;
  unsubscribeExit: (() => void) | null;
}

export class WsHandler {
  private clients = new Set<ClientState>();
  private manager: SessionManager;
  private statsTimer: ReturnType<typeof setInterval> | null = null;

  constructor(manager: SessionManager) {
    this.manager = manager;

    manager.on("sessionCreated", (info) => {
      this.broadcast({ type: "sessionCreated", session: info });
    });

    manager.on("sessionClosed", (info) => {
      this.broadcast({ type: "sessionClosed", session: info });
    });

    manager.on("sessionUpdated", (info) => {
      this.broadcast({ type: "sessionUpdated", session: info });
    });

    // Broadcast live history events for claude-agent sessions
    manager.onHistoryEvent((sessionId: string, event: HistoryEvent) => {
      this.broadcast({ type: "history_event", sessionId, event });
    });

    // Broadcast stats every 5 seconds
    this.statsTimer = setInterval(() => this.broadcastStats(), 5_000);
    if (this.statsTimer.unref) this.statsTimer.unref();
  }

  handleConnection(ws: WebSocket): void {
    const client: ClientState = {
      ws,
      subscribedSessionId: null,
      unsubscribeData: null,
      unsubscribeExit: null,
    };

    this.clients.add(client);
    logger.debug("Dashboard client connected", { clients: this.clients.size });

    ws.on("message", (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        this.send(ws, { type: "error", message: "Invalid JSON" });
        return;
      }
      this.handleMessage(client, msg);
    });

    ws.on("close", () => {
      this.cleanupClient(client);
      this.clients.delete(client);
      logger.debug("Dashboard client disconnected", { clients: this.clients.size });
    });
  }

  private handleMessage(client: ClientState, msg: Record<string, unknown>): void {
    switch (msg.type) {
      case "list":
        this.send(client.ws, { type: "sessions", sessions: this.manager.list() });
        break;

      case "subscribe":
        this.subscribe(client, String(msg.sessionId));
        break;

      case "unsubscribe":
        this.cleanupSubscription(client);
        break;

      case "input": {
        const session = this.manager.get(String(msg.sessionId));
        if (session && session.status === "running") {
          try {
            session.write(String(msg.data));
          } catch {
            // Session may have exited between check and write
          }
        }
        break;
      }

      case "resize": {
        const session = this.manager.get(String(msg.sessionId));
        if (session && session.status === "running") {
          try {
            session.resize(Number(msg.cols) || 120, Number(msg.rows) || 24);
          } catch {
            // Session may have exited
          }
        }
        break;
      }

      case "close": {
        const sessionId = String(msg.sessionId);
        try {
          this.manager.close(sessionId);
          logger.info("Session closed via dashboard", { id: sessionId });
        } catch (err) {
          this.send(client.ws, { type: "error", message: `Failed to close session: ${(err as Error).message}` });
        }
        break;
      }

      case "get_history": {
        const sid = String(msg.sessionId);
        this.manager.commandHistory.getHistory(sid).then((events) => {
          this.send(client.ws, { type: "history", sessionId: sid, events });
        }).catch(() => {
          this.send(client.ws, { type: "history", sessionId: sid, events: [] });
        });
        break;
      }

      default:
        this.send(client.ws, { type: "error", message: `Unknown message type: ${msg.type}` });
    }
  }

  private subscribe(client: ClientState, sessionId: string): void {
    // Clean up previous subscription
    this.cleanupSubscription(client);

    const session = this.manager.get(sessionId);
    if (!session) {
      this.send(client.ws, { type: "error", message: `Session "${sessionId}" not found` });
      return;
    }

    client.subscribedSessionId = sessionId;

    // Send backlog first
    const backlog = session.readFullBuffer();
    if (backlog) {
      this.send(client.ws, { type: "output", sessionId, data: backlog });
    }

    // Register live data listener — both in same tick, no race
    client.unsubscribeData = session.onData((data) => {
      this.send(client.ws, { type: "output", sessionId, data });
    });

    client.unsubscribeExit = session.onExit(() => {
      this.send(client.ws, {
        type: "sessionUpdated",
        session: session.getInfo(),
      });
    });
  }

  private cleanupSubscription(client: ClientState): void {
    client.unsubscribeData?.();
    client.unsubscribeExit?.();
    client.unsubscribeData = null;
    client.unsubscribeExit = null;
    client.subscribedSessionId = null;
  }

  private cleanupClient(client: ClientState): void {
    this.cleanupSubscription(client);
  }

  private send(ws: WebSocket, data: unknown): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  private broadcast(data: unknown): void {
    const json = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(json);
      }
    }
  }

  private broadcastStats(): void {
    if (this.clients.size === 0) return;
    const stats = this.manager.getStats();
    // Include token usage per session for live dashboard updates
    const sessionsWithTokens = stats.sessions.map((s) => {
      const session = this.manager.get(s.id);
      return {
        ...s,
        tokenUsage: session?.getStats() ?? null,
      };
    });
    this.broadcast({
      type: "stats",
      totalMemoryMB: stats.totalMemoryMB,
      sessions: sessionsWithTokens,
    });
  }

  closeAll(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    for (const client of this.clients) {
      client.ws.close();
    }
    this.clients.clear();
  }
}
