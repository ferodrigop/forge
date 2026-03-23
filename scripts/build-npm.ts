/**
 * Build script for npm distribution (replaces tsup).
 * Produces ESM bundles targeting Node.js with node-pty as external.
 *
 * Usage: bun run scripts/build-npm.ts
 */
import { rm, chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = import.meta.dirname ? join(import.meta.dirname, "..") : process.cwd();
const DIST = join(ROOT, "dist");

// Clean output directory
await rm(DIST, { recursive: true, force: true });

// Build all three entry points
const result = await Bun.build({
  entrypoints: [
    join(ROOT, "src/cli.ts"),
    join(ROOT, "src/server.ts"),
    join(ROOT, "src/dashboard/dashboard-server.ts"),
  ],
  outdir: DIST,
  target: "node",
  format: "esm",
  sourcemap: "external",
  external: ["node-pty"],
  splitting: true,
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Add shebang to cli.js and make it executable
const cliPath = join(DIST, "cli.js");
const cliContent = await readFile(cliPath, "utf-8");
if (!cliContent.startsWith("#!")) {
  await writeFile(cliPath, `#!/usr/bin/env node\n${cliContent}`);
}
await chmod(cliPath, 0o755);

console.log(`Built ${result.outputs.length} files to ${DIST}`);
for (const output of result.outputs) {
  console.log(`  ${output.path}`);
}
