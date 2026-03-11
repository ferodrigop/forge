import { join } from "node:path";
import { app } from "electron";
import { DesktopHtmlServer } from "./html-server.js";
import { DaemonBridge } from "./daemon-bridge.js";
import type { SessionManager } from "../../src/core/session-manager.js";

const DEFAULT_PORT = 3141;

export interface DaemonHandle {
  /** Port where the daemon API/WS lives (always 3141) */
  port: number;
  /** Port the BrowserWindow should load (may differ if serving own HTML) */
  dashboardPort: number;
  /** In-process SessionManager (only when inProcess=true) */
  manager: SessionManager | null;
  /** WebSocket bridge to external daemon (only when inProcess=false) */
  bridge: DaemonBridge | null;
  inProcess: boolean;
  stop: () => Promise<void>;
}

let activeDaemon: DaemonHandle | null = null;

function getForgeDistPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "forge-dist");
  }
  // __dirname = desktop/dist/main/ → go up 3 levels to repo root, then into dist/
  return join(__dirname, "..", "..", "..", "dist");
}

function getVendorDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "vendor");
  }
  return join(__dirname, "..", "..", "resources", "vendor");
}

async function detectExistingDaemon(): Promise<{ running: boolean; port: number }> {
  try {
    const res = await fetch(`http://127.0.0.1:${DEFAULT_PORT}/api/sessions`);
    if (res.ok) {
      return { running: true, port: DEFAULT_PORT };
    }
  } catch {
    // Not running
  }
  return { running: false, port: DEFAULT_PORT };
}

export async function createDaemon(): Promise<DaemonHandle> {
  const existing = await detectExistingDaemon();

  if (existing.running) {
    console.log(`[forge-desktop] Existing daemon on port ${existing.port} — serving own HTML`);

    // Start our own HTML server so the frontend has desktop-specific CSS
    const htmlServer = new DesktopHtmlServer();
    const htmlPort = await htmlServer.start();

    // Bridge to the daemon's WebSocket for session events
    const bridge = new DaemonBridge(existing.port);

    const handle: DaemonHandle = {
      port: existing.port,
      dashboardPort: htmlPort,
      manager: null,
      bridge,
      inProcess: false,
      stop: async () => {
        bridge.close();
        htmlServer.stop();
      },
    };
    activeDaemon = handle;
    return handle;
  }

  // No existing daemon — start in-process
  console.log("[forge-desktop] Starting Forge server in-process...");

  const forgeDist = getForgeDistPath();
  const { createServer } = await import(join(forgeDist, "server.js"));
  const { DashboardServer } = await import(join(forgeDist, "dashboard", "dashboard-server.js"));

  const config = {
    maxSessions: 10,
    idleTimeout: 1_800_000,
    bufferSize: 1_048_576,
    dashboard: true,
    dashboardPort: DEFAULT_PORT,
    shell: process.env.SHELL || "/bin/zsh",
    claudePath: "claude",
    codexPath: "codex",
    exitedTtl: 3_600_000,
  };

  const { manager } = createServer(config);
  await manager.init();

  const vendorDir = getVendorDir();
  const ds = new DashboardServer(manager, config.dashboardPort, config, vendorDir);
  await ds.start();

  console.log(`[forge-desktop] Forge server running on http://127.0.0.1:${config.dashboardPort}`);

  const handle: DaemonHandle = {
    port: config.dashboardPort,
    dashboardPort: config.dashboardPort, // same port when in-process
    manager,
    bridge: null,
    inProcess: true,
    stop: async () => {
      ds.stop();
      manager.closeAll();
      console.log("[forge-desktop] Forge server stopped");
    },
  };

  activeDaemon = handle;
  return handle;
}

export async function stopDaemon(): Promise<void> {
  if (activeDaemon) {
    await activeDaemon.stop();
  }
  activeDaemon = null;
}

export function getActiveDaemon(): DaemonHandle | null {
  return activeDaemon;
}
