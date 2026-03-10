import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["main/index.ts", "main/preload.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist/main",
  sourcemap: true,
  dts: false,
  external: ["electron", "electron-store", "ws"],
  // The forge core is consumed from the parent's built dist/
  noExternal: [],
});
