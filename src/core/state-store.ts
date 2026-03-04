import { join } from "node:path";
import { homedir } from "node:os";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { logger } from "../utils/logger.js";
import type { SessionInfo } from "./types.js";

function getStateDir(): string {
  return join(homedir(), ".forge");
}

function getStateFile(): string {
  return join(getStateDir(), "sessions.json");
}

export async function loadState(): Promise<SessionInfo[]> {
  try {
    const raw = await readFile(getStateFile(), "utf-8");
    return JSON.parse(raw) as SessionInfo[];
  } catch {
    return [];
  }
}

export async function saveState(sessions: SessionInfo[]): Promise<void> {
  try {
    const dir = getStateDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "sessions.json"), JSON.stringify(sessions, null, 2));
  } catch (err) {
    logger.error("Failed to save state", { error: String(err) });
  }
}

export async function clearState(): Promise<void> {
  try {
    const dir = getStateDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "sessions.json"), "[]");
  } catch (err) {
    logger.error("Failed to clear state", { error: String(err) });
  }
}
