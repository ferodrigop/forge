import { Notification } from "electron";

type SessionInfo = { id: string; name?: string; status: string; tags?: string[] };
type EventSource = {
  on(event: string, fn: (info: SessionInfo) => void): void;
  off(event: string, fn: (info: SessionInfo) => void): void;
};

let listeners: { event: string; fn: (info: SessionInfo) => void }[] = [];
let activeSource: EventSource | null = null;

/**
 * Works with both SessionManager (in-process) and DaemonBridge (external).
 * Both expose the same .on/.off interface for session events.
 */
export function setupNotifications(source: EventSource | null): void {
  if (!source) return;
  activeSource = source;

  const onCreated = (info: SessionInfo) => {
    if (!Notification.isSupported()) return;
    new Notification({
      title: "Forge: Session Created",
      body: info.name || info.id.slice(0, 8),
      silent: true,
    }).show();
  };

  const onClosed = (info: SessionInfo) => {
    if (!Notification.isSupported()) return;
    new Notification({
      title: "Forge: Session Exited",
      body: info.name || info.id.slice(0, 8),
      silent: false,
    }).show();
  };

  source.on("sessionCreated", onCreated);
  source.on("sessionClosed", onClosed);

  listeners = [
    { event: "sessionCreated", fn: onCreated },
    { event: "sessionClosed", fn: onClosed },
  ];
}

export function teardownNotifications(): void {
  if (activeSource) {
    for (const { event, fn } of listeners) {
      activeSource.off(event, fn);
    }
  }
  listeners = [];
  activeSource = null;
}
