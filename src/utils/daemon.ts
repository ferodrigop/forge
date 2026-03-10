import { readFile, writeFile, mkdir, unlink, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

export const FORGE_DIR = join(homedir(), ".forge");
export const PID_FILE = join(FORGE_DIR, "daemon.pid");
export const LOCK_FILE = join(FORGE_DIR, "daemon.lock");
export const DEFAULT_PORT = 3141;

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readPid(): Promise<number | null> {
  try {
    const raw = await readFile(PID_FILE, "utf-8");
    const pid = parseInt(raw.trim(), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function writeDaemonFiles(pid: number): Promise<void> {
  await mkdir(FORGE_DIR, { recursive: true });
  await writeFile(PID_FILE, String(pid));
  await writeFile(LOCK_FILE, String(pid));
}

export async function cleanDaemonFiles(): Promise<void> {
  for (const f of [PID_FILE, LOCK_FILE]) {
    try {
      await unlink(f);
    } catch {
      // Already gone
    }
  }
}

export async function getPortPid(port: number): Promise<number | null> {
  try {
    const out = execFileSync("lsof", ["-i", `:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf-8" });
    const pid = parseInt(out.trim().split("\n")[0], 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export async function getDaemonStatus(): Promise<{ running: boolean; pid?: number }> {
  const pid = await readPid();
  if (pid && isProcessAlive(pid)) {
    return { running: true, pid };
  }
  // Stale PID file — clean up
  if (pid) await cleanDaemonFiles();
  return { running: false };
}
