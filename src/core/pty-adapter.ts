/**
 * PTY abstraction layer — allows swapping between node-pty (Node.js) and Bun.spawn (Bun runtime).
 */

export interface PtyProcess {
  readonly pid: number;
  onData(cb: (data: string) => void): void;
  onExit(cb: (info: { exitCode: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export interface PtySpawnOptions {
  name?: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
}

export type PtySpawnFn = (
  command: string,
  args: string[],
  options: PtySpawnOptions,
) => PtyProcess;
