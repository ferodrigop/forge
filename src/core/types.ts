export interface ForgeConfig {
  maxSessions: number;
  idleTimeout: number;
  bufferSize: number;
  dashboard: boolean;
  dashboardPort: number;
  shell: string;
  claudePath: string;
  codexPath: string;
  geminiPath: string;
  claudeDefaultModel?: string;
  codexDefaultModel?: string;
  geminiDefaultModel?: string;
  cursorPath: string;
  windsurfPath: string;
  copilotPath: string;
  deepAgentsPath: string;
  authToken?: string;
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
  claudeState?: "blocked";
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
  codexPath: process.env.FORGE_CODEX_PATH || "codex",
  geminiPath: process.env.FORGE_GEMINI_PATH || "gemini",
  claudeDefaultModel: process.env.FORGE_CLAUDE_DEFAULT_MODEL,
  codexDefaultModel: process.env.FORGE_CODEX_DEFAULT_MODEL,
  geminiDefaultModel: process.env.FORGE_GEMINI_DEFAULT_MODEL,
  cursorPath: process.env.FORGE_CURSOR_PATH || "cursor",
  windsurfPath: process.env.FORGE_WINDSURF_PATH || "windsurf",
  copilotPath: process.env.FORGE_COPILOT_PATH || "copilot",
  deepAgentsPath: process.env.FORGE_DEEP_AGENTS_PATH || "deep-agents",
  authToken: process.env.FORGE_AUTH_TOKEN,
  exitedTtl: 3_600_000, // 1 hour
};
