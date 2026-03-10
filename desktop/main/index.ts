import { app, BrowserWindow } from "electron";
import { createDaemon, stopDaemon } from "./daemon.js";
import { createWindow, restoreWindow } from "./window.js";
import { createTray, destroyTray } from "./tray.js";
import { setupMenu } from "./menu.js";
import { setupNotifications, teardownNotifications } from "./notifications.js";
import { setupAutoLaunch } from "./auto-launch.js";

// Prevent multiple instances (skip if lock is stale from a killed process)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.log("[forge-desktop] Another instance is running, quitting");
  app.quit();
}

app.on("second-instance", () => {
  restoreWindow();
});

app.whenReady().then(async () => {
  const daemon = await createDaemon();

  setupMenu();

  // Load dashboard from dashboardPort; if external daemon, pass daemonPort for API/WS
  const daemonPort = daemon.dashboardPort !== daemon.port ? daemon.port : undefined;
  createWindow(daemon.dashboardPort, daemonPort);

  createTray(daemon);

  // Notifications work with either in-process manager or remote bridge
  setupNotifications(daemon.manager || daemon.bridge);

  setupAutoLaunch();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(daemon.dashboardPort, daemonPort);
    } else {
      restoreWindow();
    }
  });
});

// macOS: hide to tray instead of quitting
app.on("window-all-closed", () => {
  // Don't quit — keep running in tray
});

app.on("before-quit", async () => {
  globalThis.__forgeQuitting = true;
  teardownNotifications();
  destroyTray();
  await stopDaemon();
});
