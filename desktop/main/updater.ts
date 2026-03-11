/**
 * Auto-updater using electron-updater with GitHub Releases.
 * Checks for updates on launch, downloads silently, notifies user when ready.
 */

export async function setupAutoUpdater(): Promise<void> {
  const { app } = await import("electron");
  if (!app.isPackaged) return;

  try {
    const { autoUpdater } = await import("electron-updater");
    const { Notification } = await import("electron");

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("update-available", (info) => {
      console.log("[forge-desktop] Update available:", info.version);
    });

    autoUpdater.on("update-downloaded", (info) => {
      console.log("[forge-desktop] Update downloaded:", info.version);

      if (Notification.isSupported()) {
        const notification = new Notification({
          title: "Forge Update Ready",
          body: `v${info.version} will be installed on next restart.`,
        });
        notification.on("click", () => {
          autoUpdater.quitAndInstall();
        });
        notification.show();
      }
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
