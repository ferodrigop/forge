import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function toRealPath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/**
 * True when this module is the process entrypoint (as opposed to imported by a
 * test or another module).
 *
 * Compares *real* paths on both sides. npm and bun install the CLI as a symlink
 * in their global bin, so `process.argv[1]` is the symlink while
 * `import.meta.url` is already symlink-resolved by Node. Comparing them as
 * strings makes this false for every installed copy, which silently turns the
 * whole CLI into a no-op that exits 0.
 */
export function isDirectExecution(
  metaUrl: string,
  argv1: string | undefined = process.argv[1],
): boolean {
  if (!argv1) return false;
  let modulePath: string;
  try {
    modulePath = fileURLToPath(metaUrl);
  } catch {
    return false;
  }
  return toRealPath(modulePath) === toRealPath(argv1);
}
