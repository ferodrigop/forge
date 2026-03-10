import { app } from "electron";

/**
 * Configure auto-launch at login.
 * On macOS, this uses the system's login items API.
 * The setting is toggled via the tray menu.
 */
export function setupAutoLaunch(): void {
  // Read current setting — no-op on first launch.
  // The actual toggle happens in tray.ts via app.setLoginItemSettings().
  const settings = app.getLoginItemSettings();
  if (settings.openAtLogin) {
    // Ensure args for hidden launch (start minimized to tray)
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
    });
  }
}
