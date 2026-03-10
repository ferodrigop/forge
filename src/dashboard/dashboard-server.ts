import { randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { SessionManager } from "../core/session-manager.js";
import type { ForgeConfig } from "../core/types.js";
import { ClaudeChats } from "../core/claude-chats.js";
import { createServer as createMcpServer } from "../server.js";
import { WsHandler } from "./ws-handler.js";
import { DASHBOARD_HTML, LOGO_PNG_BASE64 } from "./dashboard-html.js";
import { logger } from "../utils/logger.js";

const MAX_BODY_BYTES = 1_048_576; // 1MB

export class DashboardServer {
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private wsHandler: WsHandler;
  private transports = new Map<string, StreamableHTTPServerTransport>();
  private claudeChats = new ClaudeChats();

  constructor(
    private manager: SessionManager,
    private port: number,
    private config?: ForgeConfig,
  ) {
    this.wsHandler = new WsHandler(manager);

    this.httpServer = createHttpServer(async (req, res) => {
      const parsedUrl = new URL(req.url || "/", `http://127.0.0.1:${this.port}`);
      const pathname = parsedUrl.pathname;

      // DNS rebinding protection: reject cross-origin requests to API/MCP endpoints
      const protectedPath = pathname === "/mcp" || pathname.startsWith("/api/");
      if (protectedPath && !this.isLocalOrigin(req)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden: invalid origin" }));
        return;
      }
      if (protectedPath && !this.isAuthorized(req)) {
        this.respondUnauthorized(res);
        return;
      }

      // MCP endpoint — handle POST, GET, DELETE on /mcp
      if (pathname === "/mcp" && this.config) {
        await this.handleMcp(req, res);
        return;
      }

      if (req.method === "GET" && pathname === "/api/sessions") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(manager.list()));
        return;
      }

      if (req.method === "POST" && pathname === "/api/sessions") {
        try {
          const body = await this.readBody(req);
          const opts = body ? JSON.parse(body) : {};
          const session = manager.create({
            command: opts.command || this.config?.shell || "/bin/sh",
            args: opts.args,
            cwd: opts.cwd,
            name: opts.name,
            tags: opts.tags,
            cols: opts.cols,
            rows: opts.rows,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(session.getInfo()));
        } catch (err) {
          this.respondBodyError(res, err);
        }
        return;
      }

      // Write to session endpoint
      const writeMatch = req.method === "POST" && pathname.match(/^\/api\/sessions\/([^/]+)\/write$/);
      if (writeMatch) {
        try {
          const sessionId = writeMatch[1];
          const body = await this.readBody(req);
          const opts = body ? JSON.parse(body) : {};
          const session = manager.getOrThrow(sessionId);
          const input = opts.newline === false ? opts.input : (opts.input || "") + "\n";
          session.write(input);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ sent: input.length }));
        } catch (err) {
          this.respondBodyError(res, err);
        }
        return;
      }

      // Session history endpoint
      const historyMatch = req.method === "GET" && pathname.match(/^\/api\/sessions\/([^/]+)\/history$/);
      if (historyMatch) {
        const sessionId = historyMatch[1];
        const events = await manager.commandHistory.getHistory(sessionId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(events));
        return;
      }

      // Chat session endpoints
      if (req.method === "GET" && pathname === "/api/chats") {
        const project = parsedUrl.searchParams.get("project") || undefined;
        const search = parsedUrl.searchParams.get("search") || undefined;
        const limit = parsedUrl.searchParams.has("limit") ? Number(parsedUrl.searchParams.get("limit")) : undefined;
        const offset = parsedUrl.searchParams.has("offset") ? Number(parsedUrl.searchParams.get("offset")) : undefined;
        const result = await this.claudeChats.listSessions({ project, search, limit, offset });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      const chatIdMatch = pathname.match(/^\/api\/chats\/([^/]+)$/);
      if (chatIdMatch) {
        const chatId = chatIdMatch[1];

        if (req.method === "GET") {
          const messages = await this.claudeChats.getMessages(chatId);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ messages }));
          return;
        }

        if (req.method === "DELETE") {
          const deleted = await this.claudeChats.deleteSession(chatId);
          res.writeHead(deleted ? 200 : 404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ deleted }));
          return;
        }
      }

      const continueMatch = pathname.match(/^\/api\/chats\/([^/]+)\/continue$/);
      if (continueMatch && req.method === "POST") {
        const chatId = continueMatch[1];
        try {
          // Look up the chat's project path so we resume in the correct cwd
          const chatMeta = await this.claudeChats.findSession(chatId);
          if (!chatMeta?.fullPath || !existsSync(chatMeta.fullPath)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Project directory not found for this chat" }));
            return;
          }
          const session = this.manager.create({
            command: this.config?.claudePath || "claude",
            args: ["--resume", chatId],
            name: `claude: continue ${chatId.slice(0, 8)}...`,
            tags: ["claude-agent"],
            cwd: chatMeta.fullPath,
          });
          session.preserveAfterExit();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(session.getInfo()));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
        return;
      }

      // Serve logo PNG
      if (req.method === "GET" && req.url === "/logo.png") {
        const buf = Buffer.from(LOGO_PNG_BASE64, "base64");
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Content-Length": String(buf.length),
          "Cache-Control": "public, max-age=86400",
        });
        res.end(buf);
        return;
      }

      // Serve dashboard HTML for all other routes
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(DASHBOARD_HTML);
    });

    this.wss = new WebSocketServer({ server: this.httpServer, path: "/ws", maxPayload: MAX_BODY_BYTES });
    this.wss.on("connection", (ws, req) => {
      if (!this.isLocalOrigin(req)) {
        ws.close(1008, "Forbidden: invalid origin");
        return;
      }
      if (!this.isAuthorized(req)) {
        ws.close(1008, "Unauthorized");
        return;
      }
      this.wsHandler.handleConnection(ws);
    });
  }

  private async handleMcp(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      if (req.method === "POST") {
        // Parse body
        const body = await this.readBody(req);
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

        if (isInitializeRequest(parsedBody)) {
          // New or re-initialization — create transport + server
          // Clean up stale session if present
          if (sessionId && this.transports.has(sessionId)) {
            const old = this.transports.get(sessionId)!;
            await old.close().catch(() => {});
            this.transports.delete(sessionId);
            logger.info("Cleaned up stale MCP session for re-init", { sessionId });
          }

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

        if (sessionId) {
          // Session ID present but not found — stale session, tell client to re-initialize
          logger.warn("MCP request with stale session ID", { sessionId });
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32001, message: "Session not found" },
            id: null,
          }));
          return;
        }

        // No session ID and not an init request
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: Mcp-Session-Id header is required" },
          id: null,
        }));
        return;
      }

      if (req.method === "GET") {
        // SSE stream for server notifications
        if (!sessionId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request: Mcp-Session-Id header is required" }, id: null }));
          return;
        }
        if (!this.transports.has(sessionId)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null }));
          return;
        }
        const transport = this.transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      if (req.method === "DELETE") {
        if (!sessionId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request: Mcp-Session-Id header is required" }, id: null }));
          return;
        }
        if (!this.transports.has(sessionId)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null }));
          return;
        }
        const transport = this.transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }));
    } catch (err) {
      if ((err as Error).message === "PAYLOAD_TOO_LARGE") {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Payload too large" }, id: null }));
        return;
      }
      logger.error("MCP transport error", { error: String(err) });
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }));
      }
    }
  }

  /** DNS rebinding protection: only allow requests from localhost origins */
  private isLocalOrigin(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    // No Origin header = non-browser request (curl, MCP client, etc.) — allow
    if (!origin) return true;
    try {
      const url = new URL(origin);
      const host = url.hostname;
      return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === `[::1]`;
    } catch {
      return false;
    }
  }

  private isAuthorized(req: IncomingMessage): boolean {
    const token = this.config?.authToken;
    if (!token) return true;
    const parsedUrl = new URL(req.url || "/", `http://127.0.0.1:${this.port}`);
    const queryToken = parsedUrl.searchParams.get("token");
    if (queryToken && this.safeEqual(queryToken, token)) return true;
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;
    const provided = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : authHeader;
    return this.safeEqual(provided, token);
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      timingSafeEqual(bufB, bufB); // constant-time even on length mismatch
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }

  private respondUnauthorized(res: ServerResponse): void {
    res.writeHead(401, {
      "Content-Type": "application/json",
      "WWW-Authenticate": "Bearer",
    });
    res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  private respondBodyError(res: ServerResponse, err: unknown): void {
    const message = (err as Error).message;
    if (message === "PAYLOAD_TOO_LARGE") {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload too large" }));
      return;
    }
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }

  private async readBody(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<string> {
    return new Promise((resolve, reject) => {
      let total = 0;
      let data = "";
      req.on("data", (chunk: Buffer | string) => {
        const size = typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
        total += size;
        if (total > maxBytes) {
          reject(new Error("PAYLOAD_TOO_LARGE"));
          req.destroy();
          return;
        }
        data += chunk.toString();
      });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
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
