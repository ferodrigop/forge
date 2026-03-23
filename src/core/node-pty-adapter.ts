import * as pty from "node-pty";
import type { PtyProcess, PtySpawnFn, PtySpawnOptions } from "./pty-adapter.js";

export const spawn: PtySpawnFn = (
  command: string,
  args: string[],
  options: PtySpawnOptions,
): PtyProcess => {
  const proc = pty.spawn(command, args, {
    name: options.name ?? "xterm-256color",
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env: options.env,
  });

  return {
    get pid() {
      return proc.pid;
    },
    onData(cb) {
      proc.onData(cb);
    },
    onExit(cb) {
      proc.onExit(cb);
    },
    write(data) {
      proc.write(data);
    },
    resize(cols, rows) {
      proc.resize(cols, rows);
    },
    kill() {
      proc.kill();
    },
  };
};
