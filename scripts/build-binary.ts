/**
 * Build script for standalone binary distribution.
 * Uses `bun build --compile` to produce a single executable with Bun runtime embedded.
 *
 * Usage:
 *   bun run scripts/build-binary.ts                          # build for current platform
 *   bun run scripts/build-binary.ts --target bun-darwin-arm64 # cross-compile
 *
 * Supported targets:
 *   bun-darwin-arm64, bun-darwin-x64, bun-linux-x64, bun-linux-arm64
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = import.meta.dirname ? join(import.meta.dirname, "..") : process.cwd();
const OUT_DIR = join(ROOT, "dist-bin");

// Parse --target argument
const targetIdx = process.argv.indexOf("--target");
const target = targetIdx !== -1 ? process.argv[targetIdx + 1] : undefined;

// Derive output name from target
const platformSuffix = target ? target.replace("bun-", "") : `${process.platform}-${process.arch}`;
const outfile = join(OUT_DIR, `forge-${platformSuffix}`);

await mkdir(OUT_DIR, { recursive: true });

// Build the compile command
const args = [
  "bun", "build",
  join(ROOT, "src/cli.ts"),
  "--compile",
  "--outfile", outfile,
  "--sourcemap=none",
  "--minify",
];

if (target) {
  args.push("--target", target);
}

console.log(`Building standalone binary: ${outfile}`);
if (target) console.log(`  Target: ${target}`);

const proc = Bun.spawn(args, {
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
    // Ensure the Bun PTY adapter is selected at bundle time
    FORGE_RUNTIME: "bun",
  },
});

const exitCode = await proc.exited;
if (exitCode !== 0) {
  console.error(`Build failed with exit code ${exitCode}`);
  process.exit(exitCode);
}

console.log(`\nBinary built successfully: ${outfile}`);
