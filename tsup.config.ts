import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    target: "node18",
    outDir: "dist",
    clean: true,
    sourcemap: true,
    dts: false,
    banner: { js: "#!/usr/bin/env node" },
    external: ["node-pty"],
    noExternal: ["@xterm/headless"],
  },
  {
    entry: ["src/server.ts"],
    format: ["esm"],
    target: "node18",
    outDir: "dist",
    sourcemap: true,
    dts: false,
    external: ["node-pty"],
    noExternal: ["@xterm/headless"],
  },
  {
    entry: ["src/dashboard/dashboard-server.ts"],
    format: ["esm"],
    target: "node18",
    outDir: "dist/dashboard",
    sourcemap: true,
    dts: false,
    external: ["node-pty"],
    noExternal: ["@xterm/headless"],
  },
]);
