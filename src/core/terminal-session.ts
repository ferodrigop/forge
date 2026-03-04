import * as pty from "node-pty";
import { Terminal } from "@xterm/headless";
import { RingBuffer } from "./ring-buffer.js";
import { logger } from "../utils/logger.js";
import type { SessionInfo, SessionStatus } from "./types.js";

export interface TerminalSessionOptions {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  bufferSize?: number;
  idleTimeout?: number;
  onExit?: (id: string, exitCode: number) => void;
}

export class TerminalSession {
  readonly id: string;
  readonly command: string;
  readonly cwd: string;
  readonly createdAt: Date;

  private ptyProcess: pty.IPty;
  private xterm: Terminal;
  private ringBuffer: RingBuffer;
  private _status: SessionStatus = "running";
  private _exitCode: number | undefined;
  private lastActivityAt: Date;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimeout: number;
  private onExitCallback?: (id: string, exitCode: number) => void;
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(id: string, exitCode: number) => void> = [];

  constructor(opts: TerminalSessionOptions) {
    this.id = opts.id;
    this.command = opts.command;
    this.cwd = opts.cwd || process.cwd();
    this.createdAt = new Date();
    this.lastActivityAt = new Date();
    this.idleTimeout = opts.idleTimeout ?? 1_800_000;
    this.onExitCallback = opts.onExit;

    const cols = opts.cols ?? 120;
    const rows = opts.rows ?? 24;

    this.ringBuffer = new RingBuffer(opts.bufferSize ?? 1_048_576);
    this.ringBuffer.addConsumer("mcp"); // default consumer for Claude

    this.xterm = new Terminal({ cols, rows, scrollback: 1000, allowProposedApi: true });

    this.ptyProcess = pty.spawn(opts.command, opts.args ?? [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: this.cwd,
      env: { ...process.env, ...opts.env } as Record<string, string>,
    });

    this.ptyProcess.onData((data: string) => {
      this.lastActivityAt = new Date();
      this.ringBuffer.write(data);
      this.xterm.write(data);
      this.resetIdleTimer();
      for (const fn of this.dataListeners) fn(data);
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this._status = "exited";
      this._exitCode = exitCode;
      this.clearIdleTimer();
      logger.info("Session exited", { id: this.id, exitCode });
      this.onExitCallback?.(this.id, exitCode);
      for (const fn of this.exitListeners) fn(this.id, exitCode);
    });

    this.resetIdleTimer();
    logger.info("Session created", { id: this.id, command: opts.command, pid: this.ptyProcess.pid });
  }

  get status(): SessionStatus {
    return this._status;
  }

  get exitCode(): number | undefined {
    return this._exitCode;
  }

  get pid(): number {
    return this.ptyProcess.pid;
  }

  get cols(): number {
    return this.xterm.cols;
  }

  get rows(): number {
    return this.xterm.rows;
  }

  /** Send input to the PTY */
  write(data: string): void {
    if (this._status !== "running") {
      throw new Error(`Session ${this.id} is not running`);
    }
    this.lastActivityAt = new Date();
    this.ptyProcess.write(data);
    this.resetIdleTimer();
  }

  /** Incremental read — only new output since last read for this consumer */
  read(consumerId = "mcp"): { data: string; droppedBytes: number } {
    return this.ringBuffer.read(consumerId);
  }

  /** Get rendered terminal screen (no ANSI codes) */
  readScreen(): string {
    const buffer = this.xterm.buffer.active;
    const lines: string[] = [];

    for (let i = 0; i < this.xterm.rows; i++) {
      const line = buffer.getLine(i + buffer.viewportY);
      lines.push(line ? line.translateToString(true) : "");
    }

    // Trim trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }

    return lines.join("\n");
  }

  /** Resize the PTY and headless terminal */
  resize(cols: number, rows: number): void {
    if (this._status !== "running") {
      throw new Error(`Session ${this.id} is not running`);
    }
    this.ptyProcess.resize(cols, rows);
    this.xterm.resize(cols, rows);
  }

  /** Add a ring buffer consumer (for dashboard WebSocket connections etc.) */
  addConsumer(id: string): void {
    this.ringBuffer.addConsumer(id);
  }

  /** Remove a ring buffer consumer */
  removeConsumer(id: string): void {
    this.ringBuffer.removeConsumer(id);
  }

  /** Register a listener for PTY output data. Returns unsubscribe function. */
  onData(fn: (data: string) => void): () => void {
    this.dataListeners.push(fn);
    return () => {
      const idx = this.dataListeners.indexOf(fn);
      if (idx >= 0) this.dataListeners.splice(idx, 1);
    };
  }

  /** Register a listener for session exit. Returns unsubscribe function. */
  onExit(fn: (id: string, exitCode: number) => void): () => void {
    this.exitListeners.push(fn);
    return () => {
      const idx = this.exitListeners.indexOf(fn);
      if (idx >= 0) this.exitListeners.splice(idx, 1);
    };
  }

  /** Read all data currently in the ring buffer (for backlog on subscribe) */
  readFullBuffer(): string {
    return this.ringBuffer.readAll();
  }

  /** Kill the PTY process and clean up */
  close(): void {
    this.clearIdleTimer();
    if (this._status === "running") {
      try {
        this.ptyProcess.kill();
      } catch {
        // Already dead
      }
    }
    this.xterm.dispose();
    this._status = "exited";
    logger.info("Session closed", { id: this.id });
  }

  /** Get session info for list/status responses */
  getInfo(): SessionInfo {
    return {
      id: this.id,
      pid: this.pid,
      command: this.command,
      cwd: this.cwd,
      cols: this.cols,
      rows: this.rows,
      status: this._status,
      createdAt: this.createdAt.toISOString(),
      lastActivityAt: this.lastActivityAt.toISOString(),
    };
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    if (this.idleTimeout > 0 && this._status === "running") {
      this.idleTimer = setTimeout(() => {
        logger.warn("Session idle timeout", { id: this.id });
        this.close();
      }, this.idleTimeout);
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}
