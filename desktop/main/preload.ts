import { contextBridge } from "electron";

// Traffic light geometry (macOS)
// 3 circles: 12px diameter, 8px gap between them
// Layout: [x] [12] [8] [12] [8] [12] = x + 52
const TRAFFIC_LIGHT_X = 16;
const TRAFFIC_LIGHT_WIDTH = 52; // 3×12 + 2×8
const TRAFFIC_LIGHT_GAP = 12; // breathing room after last circle

contextBridge.exposeInMainWorld("forgeDesktop", {
  isDesktop: true,
  platform: process.platform,
  /** Pixels from left edge to clear traffic lights + gap */
  trafficLightClearance: TRAFFIC_LIGHT_X + TRAFFIC_LIGHT_WIDTH + TRAFFIC_LIGHT_GAP,
});
