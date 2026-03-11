import { BrowserWindow, nativeImage, screen, shell, app } from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { LOGO_PNG_BASE64 } from "./logo.js";
// __dirname is available natively in CJS (tsup bundles as CJS for Electron)

const WINDOW_STATE_FILE = join(homedir(), ".forge", "window-state.json");

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

let mainWindow: BrowserWindow | null = null;

async function loadWindowState(): Promise<WindowState> {
  try {
    const raw = await readFile(WINDOW_STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { width: 1200, height: 800, isMaximized: false };
  }
}

async function saveWindowState(win: BrowserWindow): Promise<void> {
  const bounds = win.getBounds();
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: win.isMaximized(),
  };
  try {
    await mkdir(join(homedir(), ".forge"), { recursive: true });
    await writeFile(WINDOW_STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Non-critical
  }
}

/**
 * @param dashboardPort - Port serving the dashboard HTML
 * @param daemonPort - Port of the daemon API/WS (if different from dashboardPort)
 */
export function createWindow(dashboardPort: number, daemonPort?: number): BrowserWindow {
  const appIcon = nativeImage.createFromBuffer(Buffer.from(LOGO_PNG_BASE64, "base64"));

  const win = new BrowserWindow({
    icon: appIcon,
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 10 },
    backgroundColor: "#1a1b26",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Allow cross-origin requests when HTML server and daemon are on different ports.
      // Safe because both are localhost-only and we control both servers.
      webSecurity: !daemonPort,
    },
    show: false,
  });

  // --- Security: restrict navigation to localhost only ---
  win.webContents.on("will-navigate", (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  // Open external links in default browser, deny new Electron windows
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        shell.openExternal(url);
      }
    } catch {
      // Ignore invalid URLs
    }
    return { action: "deny" };
  });

  // Deny all permission requests (camera, microphone, geolocation, etc.)
  win.webContents.session.setPermissionRequestHandler((_wc, _perm, callback) => {
    callback(false);
  });

  // Disable devtools in packaged builds
  if (app.isPackaged) {
    win.webContents.on("devtools-opened", () => {
      win.webContents.closeDevTools();
    });
  }

  // Restore saved window state
  loadWindowState().then((state) => {
    if (state.x !== undefined && state.y !== undefined) {
      const displays = screen.getAllDisplays();
      const onScreen = displays.some((d) => {
        const b = d.bounds;
        return state.x! >= b.x && state.x! < b.x + b.width && state.y! >= b.y && state.y! < b.y + b.height;
      });
      if (onScreen) {
        win.setBounds({ x: state.x, y: state.y, width: state.width, height: state.height });
      } else {
        win.setSize(state.width, state.height);
        win.center();
      }
    } else {
      win.setSize(state.width, state.height);
      win.center();
    }
    if (state.isMaximized) win.maximize();
  });

  // Build URL with optional daemonPort query param
  let url = `http://127.0.0.1:${dashboardPort}`;
  if (daemonPort) {
    url += `?daemonPort=${daemonPort}`;
  }
  win.loadURL(url);

  win.once("ready-to-show", () => {
    win.show();
  });

  // Save state on move/resize (debounced)
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(win), 500);
  };
  win.on("resize", debouncedSave);
  win.on("move", debouncedSave);

  // Hide instead of close (tray behavior)
  win.on("close", (e) => {
    if (!globalThis.__forgeQuitting) {
      e.preventDefault();
      win.hide();
    } else {
      saveWindowState(win);
    }
  });

  mainWindow = win;
  return win;
}

export function getWindow(): BrowserWindow | null {
  return mainWindow;
}

export function restoreWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

// Global flag for quit behavior
declare global {
  var __forgeQuitting: boolean;
}
globalThis.__forgeQuitting = false;
