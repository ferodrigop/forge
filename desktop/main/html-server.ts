import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { app } from "electron";
import { DASHBOARD_HTML_LOCAL, LOGO_PNG_BASE64 } from "../../src/dashboard/dashboard-html.js";

const MIME_TYPES: Record<string, string> = {
  ".js": "application/javascript",
  ".css": "text/css",
};

/**
 * Minimal HTTP server that serves the dashboard HTML, logo, and vendor assets.
 * Used when an external daemon is already running — we serve our own
 * (desktop-aware) frontend while the API/WS traffic goes to the daemon.
 * Vendor files are served locally for offline support.
 */
export class DesktopHtmlServer {
  private server: HttpServer;
  private _port = 0;
  private vendorDir: string;

  constructor() {
    this.vendorDir = this.getVendorDir();

    this.server = createHttpServer((req, res) => {
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

      // Serve vendor files
      if (req.method === "GET" && req.url?.startsWith("/vendor/")) {
        const filename = req.url.slice("/vendor/".length);
        // Prevent path traversal
        if (filename.includes("..") || filename.includes("/")) {
          res.writeHead(400);
          res.end();
          return;
        }
        try {
          const filePath = join(this.vendorDir, filename);
          const content = readFileSync(filePath);
          const ext = extname(filename);
          res.writeHead(200, {
            "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
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

      // Serve dashboard HTML for everything else
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": [
          "default-src 'self' 'unsafe-inline' http://127.0.0.1:*",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "connect-src http://127.0.0.1:* ws://127.0.0.1:*",
          "img-src 'self' data: http://127.0.0.1:*",
        ].join("; "),
      });
      res.end(DASHBOARD_HTML_LOCAL);
    });
  }

  private getVendorDir(): string {
    if (app.isPackaged) {
      return join(process.resourcesPath, "vendor");
    }
    return join(__dirname, "..", "..", "resources", "vendor");
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
