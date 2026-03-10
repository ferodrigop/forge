import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { join } from "node:path";
import { app } from "electron";

/**
 * Minimal HTTP server that serves only the dashboard HTML and logo.
 * Used when an external daemon is already running — we serve our own
 * (desktop-aware) frontend while the API/WS traffic goes to the daemon.
 */
export class DesktopHtmlServer {
  private server: HttpServer;
  private _port = 0;

  constructor() {
    this.server = createHttpServer(async (req, res) => {
      if (req.method === "GET" && req.url === "/logo.png") {
        const { LOGO_PNG_BASE64 } = await this.loadDashboardModule();
        const buf = Buffer.from(LOGO_PNG_BASE64, "base64");
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Content-Length": String(buf.length),
          "Cache-Control": "public, max-age=86400",
        });
        res.end(buf);
        return;
      }

      // Serve dashboard HTML for everything else
      const { DASHBOARD_HTML } = await this.loadDashboardModule();
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": [
          "default-src 'self' 'unsafe-inline' http://127.0.0.1:*",
          "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
          "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
          "connect-src http://127.0.0.1:* ws://127.0.0.1:*",
          "img-src 'self' data: http://127.0.0.1:*",
        ].join("; "),
      });
      res.end(DASHBOARD_HTML);
    });
  }

  private async loadDashboardModule() {
    const forgeDist = app.isPackaged
      ? join(process.resourcesPath, "forge-dist")
      : join(__dirname, "..", "..", "..", "dist");
    return import(join(forgeDist, "dashboard", "dashboard-server.js"));
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.on("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server.address();
        this._port = typeof addr === "object" && addr ? addr.port : 0;
        console.log(`[forge-desktop] HTML server on http://127.0.0.1:${this._port}`);
        resolve(this._port);
      });
    });
  }

  get port(): number {
    return this._port;
  }

  stop(): void {
    this.server.close();
  }
}
