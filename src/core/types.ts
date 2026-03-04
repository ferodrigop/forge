export interface ForgeConfig {
  maxSessions: number;
  idleTimeout: number;
  bufferSize: number;
  dashboard: boolean;
  dashboardPort: number;
  shell: string;
  claudePath: string;
  exitedTtl: number;
}

export interface SessionInfo {
  id: string;
  pid: number;
  command: string;
  cwd: string;
  cols: number;
  rows: number;
  status: SessionStatus;
  createdAt: string;
  lastActivityAt: string;
  name?: string;
  tags?: string[];
  exitedAt?: string;
  memoryMB?: number | null;
  tokenUsage?: {
    totalBytesWritten: number;
    totalBytesRead: number;
    estimatedTokens: number;
  };
}

export type SessionStatus = "running" | "exited";

export interface ReadResult {
  data: string;
  droppedBytes: number;
}

export const DEFAULT_CONFIG: ForgeConfig = {
  maxSessions: 10,
  idleTimeout: 1_800_000, // 30 minutes
  bufferSize: 1_048_576, // 1MB
  dashboard: false,
  dashboardPort: 3141,
  shell: process.env.SHELL || "/bin/bash",
  claudePath: process.env.FORGE_CLAUDE_PATH || "claude",
  exitedTtl: 3_600_000, // 1 hour
};
