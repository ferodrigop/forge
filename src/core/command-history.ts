import { join } from "node:path";
import { homedir } from "node:os";
import { readFile, writeFile, mkdir, unlink, readdir, stat } from "node:fs/promises";
import { logger } from "../utils/logger.js";
import type { HistoryEvent } from "./stream-json-parser.js";

function getHistoryDir(): string {
  return join(homedir(), ".forge", "history");
}

function getHistoryFile(sessionId: string): string {
  return join(getHistoryDir(), `${sessionId}.jsonl`);
}

export class CommandHistory {
  private writeQueues = new Map<string, Promise<void>>();

  /** Append a history event (fire-and-forget, ordered per session) */
  append(sessionId: string, event: HistoryEvent): void {
    const line = JSON.stringify(event) + "\n";
    const filePath = getHistoryFile(sessionId);

    // Chain writes per session to guarantee order
    const prev = this.writeQueues.get(sessionId) ?? Promise.resolve();
    const next = prev
      .then(() => mkdir(getHistoryDir(), { recursive: true }))
      .then(() => writeFile(filePath, line, { flag: "a" }))
      .catch((err) => logger.error("Failed to append history", { sessionId, error: String(err) }));

    this.writeQueues.set(sessionId, next);
  }

  /** Read all history events for a session */
  async getHistory(sessionId: string): Promise<HistoryEvent[]> {
    try {
      const raw = await readFile(getHistoryFile(sessionId), "utf-8");
      const events: HistoryEvent[] = [];
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed) as HistoryEvent);
        } catch {
          // skip malformed lines
        }
      }
      return events;
    } catch {
      return [];
    }
  }

  /** Delete history file for a session */
  async deleteHistory(sessionId: string): Promise<void> {
    try {
      await unlink(getHistoryFile(sessionId));
    } catch {
      // file may not exist
    }
  }

  /** Remove history files older than maxAgeDays */
  async sweep(maxAgeDays: number): Promise<void> {
    try {
      const dir = getHistoryDir();
      const files = await readdir(dir);
      const cutoff = Date.now() - maxAgeDays * 86_400_000;

      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        try {
          const filePath = join(dir, file);
          const st = await stat(filePath);
          if (st.mtimeMs < cutoff) {
            await unlink(filePath);
            logger.info("Swept old history file", { file });
          }
        } catch {
          // skip individual file errors
        }
      }
    } catch {
      // history dir may not exist yet
    }
  }
}
