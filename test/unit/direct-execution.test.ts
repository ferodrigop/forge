import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDirectExecution } from "../../src/utils/direct-execution.js";

let dir: string;
let realFile: string;
let linkFile: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "forge-direct-exec-"));
  realFile = join(dir, "cli.js");
  linkFile = join(dir, "forge-link");
  writeFileSync(realFile, "// cli\n");
  symlinkSync(realFile, linkFile);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// The suite creates a real symlink in beforeAll, which needs privileges on
// win32, so skip it there rather than flake on permission failures.
describe.skipIf(process.platform === "win32")("isDirectExecution", () => {
  it("is true when argv[1] is the module itself", () => {
    expect(isDirectExecution(pathToFileURL(realFile).href, realFile)).toBe(true);
  });

  it("is true when argv[1] is a symlink to the module (npm/bun global bin)", () => {
    // The regression this guards: `forge` on PATH is a symlink, so argv[1] and
    // import.meta.url differ as strings and the CLI silently exits 0.
    expect(isDirectExecution(pathToFileURL(realFile).href, linkFile)).toBe(true);
  });

  it("is false when imported by another entrypoint, e.g. a test runner", () => {
    expect(isDirectExecution(pathToFileURL(realFile).href, join(dir, "vitest.js"))).toBe(false);
  });

  it("is false when there is no argv[1]", () => {
    expect(isDirectExecution(pathToFileURL(realFile).href, undefined)).toBe(false);
  });

  it("is false for a non-file URL rather than throwing", () => {
    expect(isDirectExecution("https://example.com/cli.js", realFile)).toBe(false);
  });

  it("handles a module path that no longer exists without throwing", () => {
    const missing = join(dir, "gone.js");
    expect(isDirectExecution(pathToFileURL(missing).href, missing)).toBe(true);
  });
});
