import { randomUUID } from "node:crypto";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { SessionManager } from "../core/session-manager.js";
import type { ForgeConfig } from "../core/types.js";
import { createServer as createMcpServer } from "../server.js";
import { WsHandler } from "./ws-handler.js";
import { DASHBOARD_HTML } from "./dashboard-html.js";
import { logger } from "../utils/logger.js";

export class DashboardServer {
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private wsHandler: WsHandler;
  private transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(
    private manager: SessionManager,
    private port: number,
    private config?: ForgeConfig,
  ) {
    this.wsHandler = new WsHandler(manager);

    this.httpServer = createHttpServer(async (req, res) => {
      // MCP endpoint — handle POST, GET, DELETE on /mcp
      if (req.url === "/mcp" && this.config) {
        await this.handleMcp(req, res);
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

  private async handleMcp(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      if (req.method === "POST") {
        // Parse body
        const body = await new Promise<string>((resolve, reject) => {
          let data = "";
          req.on("data", (chunk) => { data += chunk; });
          req.on("end", () => resolve(data));
          req.on("error", reject);
        });
        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(body);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
          return;
        }

        if (sessionId && this.transports.has(sessionId)) {
          // Reuse existing transport
          const transport = this.transports.get(sessionId)!;
          await transport.handleRequest(req, res, parsedBody);
          return;
        }

        if (!sessionId && isInitializeRequest(parsedBody)) {
          // New MCP session — create transport + server
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              logger.info("MCP session initialized", { sessionId: sid });
              this.transports.set(sid, transport);
            },
          });

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && this.transports.has(sid)) {
              this.transports.delete(sid);
              logger.info("MCP session closed", { sessionId: sid });
            }
          };

          // Create a new McpServer sharing our existing SessionManager
          const { server } = createMcpServer(this.config!, this.manager);
          await server.connect(transport);
          await transport.handleRequest(req, res, parsedBody);
          return;
        }

        // Bad request — no session ID on a non-init request
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID provided" },
          id: null,
        }));
        return;
      }

      if (req.method === "GET") {
        // SSE stream for server notifications
        if (!sessionId || !this.transports.has(sessionId)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Invalid or missing session ID" }, id: null }));
          return;
        }
        const transport = this.transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      if (req.method === "DELETE") {
        if (!sessionId || !this.transports.has(sessionId)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Invalid or missing session ID" }, id: null }));
          return;
        }
        const transport = this.transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }));
    } catch (err) {
      logger.error("MCP transport error", { error: String(err) });
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }));
      }
    }
  }

  async start(): Promise<void> {
    if (this.config) {
      logger.info("MCP HTTP transport ready at /mcp (stateful, per-session)");
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
    // Close all MCP transports
    for (const [sid, transport] of this.transports) {
      transport.close().catch(() => {});
      logger.info("Closed MCP session", { sessionId: sid });
    }
    this.transports.clear();
    this.wss.close();
    this.httpServer.close();
    logger.info("Dashboard stopped");
  }
}
