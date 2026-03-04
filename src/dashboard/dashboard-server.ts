import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionManager } from "../core/session-manager.js";
import { WsHandler } from "./ws-handler.js";
import { DASHBOARD_HTML } from "./dashboard-html.js";
import { logger } from "../utils/logger.js";

export class DashboardServer {
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private wsHandler: WsHandler;
  private mcpTransport: StreamableHTTPServerTransport | null = null;

  constructor(
    private manager: SessionManager,
    private port: number,
    private mcpServer?: McpServer,
  ) {
    this.wsHandler = new WsHandler(manager);

    this.httpServer = createHttpServer(async (req, res) => {
      // MCP endpoint — handle POST, GET, DELETE on /mcp
      if (req.url === "/mcp" && this.mcpTransport) {
        try {
          await this.mcpTransport.handleRequest(req, res);
        } catch (err) {
          logger.error("MCP transport error", { error: String(err) });
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal server error" }));
          }
        }
        return;
      }

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
    // Set up MCP over HTTP if an McpServer was provided
    if (this.mcpServer) {
      this.mcpTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless — any client can call any tool
      });
      await this.mcpServer.connect(this.mcpTransport);
      logger.info("MCP HTTP transport ready at /mcp");
    }

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
    if (this.mcpTransport) {
      this.mcpTransport.close().catch(() => {});
    }
    this.wss.close();
    this.httpServer.close();
    logger.info("Dashboard stopped");
  }
}
