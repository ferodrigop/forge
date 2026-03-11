import { randomUUID, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve as resolvePath, sep as pathSep, join as joinPath, extname } from "node:path";
import { homedir } from "node:os";
import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { SessionManager } from "../core/session-manager.js";
import type { ForgeConfig } from "../core/types.js";
import { ClaudeChats } from "../core/claude-chats.js";
import { CodexChats } from "../core/codex-chats.js";
import { createServer as createMcpServer } from "../server.js";
import { WsHandler } from "./ws-handler.js";
import { DASHBOARD_HTML, DASHBOARD_HTML_LOCAL, LOGO_PNG_BASE64 } from "./dashboard-html.js";
export { DASHBOARD_HTML, DASHBOARD_HTML_LOCAL, LOGO_PNG_BASE64 };
import { logger } from "../utils/logger.js";

const MAX_BODY_BYTES = 1_048_576; // 1MB

export class DashboardServer {
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private wsHandler: WsHandler;
  private transports = new Map<string, StreamableHTTPServerTransport>();
  private claudeChats = new ClaudeChats();
  private codexChats = new CodexChats();

  constructor(
    private manager: SessionManager,
    private port: number,
    private config?: ForgeConfig,
    private vendorDir?: string,
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

          // Resolve agent shorthand to configured binary + default tags
          let command = opts.command || this.config?.shell || "/bin/sh";
          let tags = opts.tags;
          if (opts.agent === "claude") {
            command = this.config?.claudePath || "claude";
            tags = tags || ["claude-agent"];
          } else if (opts.agent === "codex") {
            command = this.config?.codexPath || "codex";
            tags = tags || ["codex-agent"];
          }

          const session = manager.create({
            command,
            args: opts.args,
            cwd: opts.cwd,
            name: opts.name,
            tags,
            cols: opts.cols,
            rows: opts.rows,
          });

          // Preserve agent sessions after exit (consistent with MCP spawn tools)
          if (opts.agent === "claude" || opts.agent === "codex") {
            session.preserveAfterExit();
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(session.getInfo()));
        } catch (err) {
          this.respondBodyError(res, err);
        }
        return;
      }

      // Close (delete) a session
      const deleteMatch = req.method === "DELETE" && pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (deleteMatch) {
        const sessionId = deleteMatch[1];
        const session = manager.get(sessionId);
        if (!session) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Session "${sessionId}" not found` }));
          return;
        }
        session.close();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ closed: true, id: sessionId }));
        return;
      }

      // Rename a session
      const renameMatch = req.method === "PATCH" && pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (renameMatch) {
        const sessionId = renameMatch[1];
        const session = manager.get(sessionId);
        if (!session) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Session "${sessionId}" not found` }));
          return;
        }
        try {
          const body = await this.readBody(req);
          const { name } = JSON.parse(body || "{}");
          if (name !== undefined) session.name = name;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(session.getInfo()));
        } catch (err) {
          this.respondBodyError(res, err);
        }
        return;
      }

      // Read session screen endpoint
      const screenMatch = req.method === "GET" && pathname.match(/^\/api\/sessions\/([^/]+)\/screen$/);
      if (screenMatch) {
        const sessionId = screenMatch[1];
        const session = manager.get(sessionId);
        if (!session) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Session "${sessionId}" not found` }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: sessionId, screen: session.readScreen() }));
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

      // Browse directories endpoint — for folder picker in New Terminal modal
      if (req.method === "GET" && pathname === "/api/browse") {
        try {
          const rawPath = parsedUrl.searchParams.get("path") || homedir();
          const targetPath = resolvePath(rawPath.replace(/^~/, homedir()));

          if (!existsSync(targetPath)) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Path does not exist", path: targetPath }));
            return;
          }

          const stat = statSync(targetPath);
          if (!stat.isDirectory()) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Path is not a directory", path: targetPath }));
            return;
          }

          const entries = readdirSync(targetPath, { withFileTypes: true });
          const dirs = entries
            .filter(e => e.isDirectory() && !e.name.startsWith("."))
            .map(e => e.name)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

          // Compute parent
          const parts = targetPath.split(pathSep);
          const parent = parts.length > 1 ? parts.slice(0, -1).join(pathSep) || "/" : null;

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ path: targetPath, parent, dirs }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
        return;
      }

      // Validate path exists endpoint
      if (req.method === "GET" && pathname === "/api/validate-path") {
        const rawPath = parsedUrl.searchParams.get("path") || "";
        const targetPath = resolvePath(rawPath.replace(/^~/, homedir()));
        const exists = existsSync(targetPath);
        const isDir = exists && statSync(targetPath).isDirectory();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ path: targetPath, exists, isDirectory: isDir }));
        return;
      }

      // ---- Git API endpoints for Code Review ----

      if (req.method === "GET" && pathname === "/api/git-status") {
        const cwd = parsedUrl.searchParams.get("cwd") || "";
        if (!cwd || !existsSync(cwd)) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Invalid cwd" })); return; }
        try {
          execFileSync("git", ["rev-parse", "--git-dir"], { cwd, encoding: "utf-8", timeout: 5000 });
        } catch { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not a git repository" })); return; }
        try {
          const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf-8", timeout: 5000 }).trim();
          let ahead = 0, behind = 0;
          try {
            const counts = execFileSync("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { cwd, encoding: "utf-8", timeout: 5000 }).trim();
            const parts = counts.split(/\s+/);
            ahead = parseInt(parts[0], 10) || 0;
            behind = parseInt(parts[1], 10) || 0;
          } catch { /* no upstream */ }
          const porcelain = execFileSync("git", ["status", "--porcelain=v1"], { cwd, encoding: "utf-8", timeout: 5000 });
          const files: Array<{ path: string; oldPath?: string; status: string; staged: boolean; indexStatus: string; workStatus: string }> = [];
          const statusMap: Record<string, string> = { M: "modified", A: "added", D: "deleted", R: "renamed", C: "copied", "?": "untracked" };
          for (const line of porcelain.split("\n")) {
            if (!line || line.length < 4) continue;
            const idx = line[0], wt = line[1];
            let fp = line.slice(3);
            let oldPath: string | undefined;
            // Handle renames "old -> new"
            const arrow = fp.indexOf(" -> ");
            if (arrow >= 0) { oldPath = fp.slice(0, arrow); fp = fp.slice(arrow + 4); }
            if (idx !== " " && idx !== "?") {
              files.push({ path: fp, oldPath, status: statusMap[idx] || "modified", staged: true, indexStatus: idx, workStatus: wt });
            }
            if (wt !== " " && idx !== "?") {
              files.push({ path: fp, oldPath, status: statusMap[wt] || "modified", staged: false, indexStatus: idx, workStatus: wt });
            }
            if (idx === "?") {
              files.push({ path: fp, status: "untracked", staged: false, indexStatus: idx, workStatus: wt });
            }
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ branch, ahead, behind, files }));
        } catch (e: any) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message || "git-status failed" })); }
        return;
      }

      if (req.method === "GET" && pathname === "/api/git-diff") {
        const cwd = parsedUrl.searchParams.get("cwd") || "";
        const file = parsedUrl.searchParams.get("file") || "";
        const staged = parsedUrl.searchParams.get("staged") === "true";
        const untracked = parsedUrl.searchParams.get("untracked") === "true";
        if (!cwd || !existsSync(cwd)) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Invalid cwd" })); return; }
        try {
          if (untracked && file) {
            // For untracked files, read the file content and format as all-added diff
            const { readFileSync } = await import("node:fs");
            const fullPath = resolvePath(cwd, file);
            const content = readFileSync(fullPath, "utf-8");
            const lines = content.split("\n");
            const diffLines = [`@@ -0,0 +1,${lines.length} @@`];
            for (const line of lines) { diffLines.push("+" + line); }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ diff: diffLines.join("\n") }));
          } else {
            const args = ["diff"];
            if (staged) args.push("--cached");
            if (file) { args.push("--"); args.push(file); }
            const diff = execFileSync("git", args, { cwd, encoding: "utf-8", timeout: 10000 });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ diff }));
          }
        } catch (e: any) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message || "git-diff failed" })); }
        return;
      }

      if (req.method === "POST" && pathname === "/api/git-stage") {
        const body = await this.readBody(req);
        const opts = JSON.parse(body);
        const { cwd, files, action } = opts as { cwd: string; files: string[]; action: "stage" | "unstage" };
        if (!cwd || !files?.length) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Missing cwd or files" })); return; }
        try {
          if (action === "unstage") {
            execFileSync("git", ["reset", "HEAD", "--", ...files], { cwd, encoding: "utf-8", timeout: 5000 });
          } else {
            execFileSync("git", ["add", "--", ...files], { cwd, encoding: "utf-8", timeout: 5000 });
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e: any) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message || "git-stage failed" })); }
        return;
      }

      if (req.method === "POST" && pathname === "/api/git-discard") {
        const body = await this.readBody(req);
        const opts = JSON.parse(body);
        const { cwd, files } = opts as { cwd: string; files: string[] };
        if (!cwd || !files?.length) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Missing cwd or files" })); return; }
        try {
          execFileSync("git", ["checkout", "--", ...files], { cwd, encoding: "utf-8", timeout: 5000 });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e: any) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message || "git-discard failed" })); }
        return;
      }

      if (req.method === "POST" && pathname === "/api/git-commit") {
        const body = await this.readBody(req);
        const opts = JSON.parse(body);
        const { cwd, message } = opts as { cwd: string; message: string };
        if (!cwd || !message?.trim()) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Missing cwd or message" })); return; }
        try {
          execFileSync("git", ["commit", "-m", message], { cwd, encoding: "utf-8", timeout: 10000 });
          const hash = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf-8", timeout: 5000 }).trim();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, hash, message }));
        } catch (e: any) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message || "git-commit failed" })); }
        return;
      }

      if (req.method === "POST" && pathname === "/api/git-stash") {
        const body = await this.readBody(req);
        const opts = JSON.parse(body);
        const { cwd, action } = opts as { cwd: string; action: "push" | "pop" | "list" };
        if (!cwd || !action) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Missing cwd or action" })); return; }
        try {
          if (action === "list") {
            const out = execFileSync("git", ["stash", "list"], { cwd, encoding: "utf-8", timeout: 5000 });
            const stashes = out.trim().split("\n").filter(Boolean);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, stashes }));
          } else {
            execFileSync("git", ["stash", action], { cwd, encoding: "utf-8", timeout: 10000 });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          }
        } catch (e: any) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message || "git-stash failed" })); }
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

      // Codex chat session endpoints
      if (req.method === "GET" && pathname === "/api/codex-chats") {
        const project = parsedUrl.searchParams.get("project") || undefined;
        const search = parsedUrl.searchParams.get("search") || undefined;
        const limit = parsedUrl.searchParams.has("limit") ? Number(parsedUrl.searchParams.get("limit")) : undefined;
        const offset = parsedUrl.searchParams.has("offset") ? Number(parsedUrl.searchParams.get("offset")) : undefined;
        const result = await this.codexChats.listSessions({ project, search, limit, offset });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      const codexChatIdMatch = pathname.match(/^\/api\/codex-chats\/([^/]+)$/);
      if (codexChatIdMatch) {
        const chatId = decodeURIComponent(codexChatIdMatch[1]);

        if (req.method === "GET") {
          const messages = await this.codexChats.getMessages(chatId);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ messages }));
          return;
        }

        if (req.method === "DELETE") {
          const deleted = await this.codexChats.deleteSession(chatId);
          res.writeHead(deleted ? 200 : 404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ deleted }));
          return;
        }
      }

      const codexContinueMatch = pathname.match(/^\/api\/codex-chats\/([^/]+)\/continue$/);
      if (codexContinueMatch && req.method === "POST") {
        const chatId = decodeURIComponent(codexContinueMatch[1]);
        try {
          const chatMeta = await this.codexChats.findSession(chatId);
          if (!chatMeta) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Codex session not found" }));
            return;
          }
          // Extract UUID from filename: rollout-<timestamp>-<uuid>.jsonl
          const uuidMatch = chatMeta.sessionId.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
          if (!uuidMatch) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Could not extract session UUID" }));
            return;
          }
          const codexPath = this.config?.codexPath || "codex";
          const session = this.manager.create({
            command: codexPath,
            args: ["resume", uuidMatch[1]],
            name: `codex: resume ${uuidMatch[1].slice(0, 8)}...`,
            tags: ["codex-agent"],
            cwd: chatMeta.fullPath || undefined,
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

      // Serve vendor files (offline frontend assets)
      if (req.method === "GET" && pathname.startsWith("/vendor/") && this.vendorDir) {
        const filename = pathname.slice("/vendor/".length);
        if (!filename || filename.includes("..") || filename.includes("/")) {
          res.writeHead(400);
          res.end();
          return;
        }
        try {
          const filePath = joinPath(this.vendorDir, filename);
          const content = readFileSync(filePath);
          const mimeTypes: Record<string, string> = { ".js": "application/javascript", ".css": "text/css" };
          res.writeHead(200, {
            "Content-Type": mimeTypes[extname(filename)] || "application/octet-stream",
            "Content-Length": String(content.length),
            "Cache-Control": "public, max-age=86400",
          });
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end();
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
      res.end(this.vendorDir ? DASHBOARD_HTML_LOCAL : DASHBOARD_HTML);
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
