import { Tray, Menu, nativeImage, app } from "electron";
import { join } from "node:path";
import { restoreWindow } from "./window.js";
import type { DaemonHandle } from "./daemon.js";

// __dirname is available natively in CJS (tsup bundles as CJS for Electron)

let tray: Tray | null = null;

function getTrayIcon(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "tray-icon.png");
  }
  return join(__dirname, "..", "..", "resources", "tray-icon.png");
}

export function createTray(daemon: DaemonHandle): void {
  const iconPath = getTrayIcon();
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip("Forge Terminal MCP");

  const updateMenu = () => {
    let sessionCount = 0;

    // Works with both in-process manager and remote bridge
    if (daemon.inProcess && daemon.manager) {
      try {
        sessionCount = daemon.manager.list().filter((s: { status: string }) => s.status === "running").length;
      } catch { /* not ready */ }
    } else if (daemon.bridge) {
      sessionCount = daemon.bridge.list().filter((s) => s.status === "running").length;
    }

    const menu = Menu.buildFromTemplate([
      {
        label: "Show Dashboard",
        click: () => restoreWindow(),
      },
      {
        label: `${sessionCount} session${sessionCount !== 1 ? "s" : ""} running`,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "New Terminal",
        click: async () => {
          try {
            await fetch(`http://127.0.0.1:${daemon.port}/api/sessions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            restoreWindow();
          } catch { /* best effort */ }
        },
      },
      { type: "separator" },
      {
        label: "Start at Login",
        type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        click: (menuItem) => {
          app.setLoginItemSettings({ openAtLogin: menuItem.checked });
        },
      },
      { type: "separator" },
      {
        label: "Quit Forge",
        click: () => {
          globalThis.__forgeQuitting = true;
          app.quit();
        },
      },
    ]);

    tray?.setContextMenu(menu);
  };

  updateMenu();
  setInterval(updateMenu, 5000);

  tray.on("click", () => {
    restoreWindow();
  });
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
