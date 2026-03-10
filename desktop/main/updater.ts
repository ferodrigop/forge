/**
 * Auto-updater using electron-updater with GitHub Releases.
 * Phase 6 — placeholder for now, activated when code signing is set up.
 */

export async function setupAutoUpdater(): Promise<void> {
  // Only run in packaged builds
  const { app } = await import("electron");
  if (!app.isPackaged) return;

  try {
    const { autoUpdater } = await import("electron-updater");
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("update-available", (info) => {
      console.log("[forge-desktop] Update available:", info.version);
    });

    autoUpdater.on("update-downloaded", (info) => {
      console.log("[forge-desktop] Update downloaded:", info.version);
      // Prompt will happen on next quit
    });

    autoUpdater.on("error", (err) => {
      console.error("[forge-desktop] Auto-updater error:", err);
    });

    await autoUpdater.checkForUpdates();
  } catch (err) {
    // electron-updater may not be available in dev
    console.log("[forge-desktop] Auto-updater not available:", err);
  }
}
