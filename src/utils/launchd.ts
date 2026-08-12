/**
 * launchd integration — keeps the daemon alive across reboots and crashes.
 *
 * The LaunchAgent runs `forge start` in the FOREGROUND. `-d` forks a child and
 * lets the parent exit, which launchd reads as a crash and respawns forever.
 *
 * KeepAlive is `{ SuccessfulExit: false }`, not `true`, so the two lifecycles
 * compose: `forge stop` sends SIGTERM, the handler exits 0, and launchd leaves
 * it down. A crash (nonzero status or signal death) still gets restarted.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { DEFAULT_PORT } from "./daemon.js";

export const LAUNCHD_LABEL = "dev.forgemcp.daemon";

export function plistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}

export function logDir(): string {
  return join(homedir(), "Library", "Logs", "forge");
}

function guiTarget(): string {
  return `gui/${process.getuid?.() ?? 0}/${LAUNCHD_LABEL}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * How to re-invoke this same forge from launchd. Under a compiled binary
 * (build:binary) argv[1] is not a script, so exec the binary directly.
 */
export function resolveProgramArguments(
  execPath: string = process.execPath,
  scriptPath: string | undefined = process.argv[1],
): string[] {
  const isNodeHost = /\bnode(\.exe)?$/.test(execPath) || /\bbun$/.test(execPath);
  return isNodeHost && scriptPath ? [execPath, scriptPath, "start"] : [execPath, "start"];
}

export interface PlistOptions {
  programArguments: string[];
  /** Login PATH — launchd's default is minimal and PTY sessions inherit it. */
  path: string;
  home: string;
  logDirectory: string;
  port?: number;
}

export function generatePlist(opts: PlistOptions): string {
  const args = [...opts.programArguments];
  if (opts.port && opts.port !== DEFAULT_PORT) {
    args.push("--port", String(opts.port));
  }
  const argXml = args.map((a) => `    <string>${escapeXml(a)}</string>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>

  <!-- Managed by \`forge load\`. Edits are lost on the next \`forge load\`. -->
  <key>ProgramArguments</key>
  <array>
${argXml}
  </array>

  <key>RunAtLoad</key>
  <true/>
  <!-- Restart on crash, but let \`forge stop\` (clean exit 0) stay stopped. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>

  <!-- Forge hosts interactive PTYs; Background would get CPU-throttled. -->
  <key>ProcessType</key>
  <string>Interactive</string>

  <key>WorkingDirectory</key>
  <string>${escapeXml(opts.home)}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${escapeXml(opts.home)}</string>
    <key>PATH</key>
    <string>${escapeXml(opts.path)}</string>
    <!-- Marks the launchd-owned invocation so \`start\` runs the server here
         instead of recursing into \`launchctl kickstart\`. -->
    <key>FORGE_LAUNCHD</key>
    <string>1</string>
  </dict>

  <key>StandardOutPath</key>
  <string>${escapeXml(join(opts.logDirectory, "daemon.out.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(opts.logDirectory, "daemon.err.log"))}</string>
</dict>
</plist>
`;
}

export function isSupported(): boolean {
  return process.platform === "darwin";
}

/** True when launchd currently has the agent bootstrapped. */
export function isLoaded(): boolean {
  try {
    execFileSync("launchctl", ["print", guiTarget()], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Write the plist and bootstrap it. Idempotent — re-loads if already loaded. */
export function load(port: number = DEFAULT_PORT): { path: string; reloaded: boolean } {
  const dir = logDir();
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });

  const target = plistPath();
  writeFileSync(
    target,
    generatePlist({
      programArguments: resolveProgramArguments(),
      path: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
      home: homedir(),
      logDirectory: dir,
      port,
    }),
  );

  const reloaded = isLoaded();
  if (reloaded) bootout();
  execFileSync("launchctl", ["bootstrap", `gui/${process.getuid?.() ?? 0}`, target], { stdio: "pipe" });
  return { path: target, reloaded };
}

/** Bootout the agent. Returns false when it was not loaded. */
export function bootout(): boolean {
  try {
    execFileSync("launchctl", ["bootout", guiTarget()], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Bootout AND delete the plist — leaving the file behind would let launchd
 * re-load it at the next login, quietly undoing the unload.
 */
export function unload(): { wasLoaded: boolean; removedPlist: boolean } {
  const wasLoaded = bootout();
  let removedPlist = false;
  const target = plistPath();
  if (existsSync(target)) {
    unlinkSync(target);
    removedPlist = true;
  }
  return { wasLoaded, removedPlist };
}

/** Ask launchd to (re)start the job, so launchd stays the owner. */
export function kickstart(): void {
  execFileSync("launchctl", ["kickstart", guiTarget()], { stdio: "pipe" });
}
