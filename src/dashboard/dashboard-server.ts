import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import type { SessionManager } from "../core/session-manager.js";
import { WsHandler } from "./ws-handler.js";
import { DASHBOARD_HTML } from "./dashboard-html.js";
import { logger } from "../utils/logger.js";

export class DashboardServer {
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private wsHandler: WsHandler;

  constructor(private manager: SessionManager, private port: number) {
    this.wsHandler = new WsHandler(manager);

    this.httpServer = createHttpServer((req, res) => {
      if (req.method === "GET" && req.url === "/api/sessions") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(manager.list()));
        return;
      }

      // Serve dashboard HTML for all other routes
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(DASHBOARD_HTML);
    });

    this.wss = new WebSocketServer({ server: this.httpServer, path: "/ws" });
    this.wss.on("connection", (ws) => {
      this.wsHandler.handleConnection(ws);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.on("error", reject);
      this.httpServer.listen(this.port, "127.0.0.1", () => {
        logger.info("Dashboard running", { url: `http://127.0.0.1:${this.port}` });
        resolve();
      });
    });
  }

  stop(): void {
    this.wsHandler.closeAll();
    this.wss.close();
    this.httpServer.close();
    logger.info("Dashboard stopped");
  }
}
