/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PtyProcess, PtySpawnFn, PtySpawnOptions } from "./pty-adapter.js";

/**
 * PTY adapter using Bun's native subprocess with TTY support.
 * Only works on POSIX systems (Linux, macOS) under the Bun runtime.
 *
 * Bun.spawn with `tty: true` allocates a real pseudo-terminal,
 * giving us the same capabilities as node-pty without native addons.
 *
 * This file is only imported when running under Bun — it is tree-shaken
 * away in the Node.js/npm build path.
 */

// Access Bun global without type dependency
const BunGlobal = (globalThis as any).Bun;

export const spawn: PtySpawnFn = (
  command: string,
  args: string[],
  options: PtySpawnOptions,
): PtyProcess => {
  const env: Record<string, string> = {
    ...options.env,
    TERM: options.name ?? "xterm-256color",
    COLUMNS: String(options.cols),
    LINES: String(options.rows),
  };

  const proc = BunGlobal.spawn([command, ...args], {
    cwd: options.cwd,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    tty: true,
    windowSize: {
      columns: options.cols,
      rows: options.rows,
    },
  });

  const dataCallbacks: Array<(data: string) => void> = [];
  const decoder = new TextDecoder();

  // Read stdout stream and dispatch to data callbacks
  const readStream = async (stream: ReadableStream<Uint8Array> | null) => {
    if (!stream) return;
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const cb of dataCallbacks) cb(text);
      }
    } catch {
      // Stream closed
    }
  };

  readStream(proc.stdout as ReadableStream<Uint8Array> | null);

  return {
    get pid() {
      return proc.pid;
    },
    onData(cb) {
      dataCallbacks.push(cb);
    },
    onExit(cb) {
      proc.exited.then((exitCode: number | null) => {
        cb({ exitCode: exitCode ?? 0 });
      });
    },
    write(data) {
      proc.stdin?.write(data);
    },
    resize(cols, rows) {
      // Bun exposes resize on the subprocess when tty: true
      if (typeof proc.resize === "function") {
        proc.resize({ columns: cols, rows });
      }
    },
    kill() {
      proc.kill();
    },
  };
};
