import { EventEmitter } from "node:events";
import WebSocket from "ws";

type SessionInfo = { id: string; name?: string; status: string; tags?: string[] };

/**
 * WebSocket client that connects to an existing Forge daemon
 * and relays session events. Provides the same event interface
 * as SessionManager so tray/notifications work transparently.
 */
export class DaemonBridge extends EventEmitter {
  private ws: WebSocket | null = null;
  private _sessions: SessionInfo[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private daemonPort: number) {
    super();
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;

    const url = `ws://127.0.0.1:${this.daemonPort}/ws`;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[forge-desktop] Bridge connected to daemon");
      // Request initial session list
      this.ws!.send(JSON.stringify({ type: "list" }));
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch {
        // Ignore parse errors
      }
    });

    this.ws.on("close", () => {
      if (!this.closed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    });

    this.ws.on("error", () => {
      this.ws?.close();
    });
  }

  private handleMessage(msg: { type: string; sessions?: SessionInfo[]; session?: SessionInfo }): void {
    switch (msg.type) {
      case "sessions":
        this._sessions = msg.sessions || [];
        break;
      case "sessionCreated":
        if (msg.session) {
          this._sessions = [...this._sessions, msg.session];
          this.emit("sessionCreated", msg.session);
        }
        break;
      case "sessionClosed":
        if (msg.session) {
          this._sessions = this._sessions.filter((s) => s.id !== msg.session!.id);
          this.emit("sessionClosed", msg.session);
        }
        break;
      case "sessionUpdated":
        if (msg.session) {
          this._sessions = this._sessions.map((s) =>
            s.id === msg.session!.id ? msg.session! : s,
          );
          this.emit("sessionUpdated", msg.session);
        }
        break;
    }
  }

  list(): SessionInfo[] {
    return this._sessions;
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
