import { DEFAULT_CONFIG, type ForgeConfig } from "../core/types.js";

function intArg(args: string[], flag: string): number | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  const val = parseInt(args[idx + 1], 10);
  return Number.isNaN(val) ? undefined : val;
}

function boolArg(args: string[], flag: string): boolean | undefined {
  return args.includes(flag) ? true : undefined;
}

function strArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function envInt(name: string): number | undefined {
  const val = process.env[name];
  if (!val) return undefined;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? undefined : n;
}

function envBool(name: string): boolean | undefined {
  const val = process.env[name];
  if (!val) return undefined;
  return val === "true" || val === "1";
}

export function parseConfig(argv: string[] = process.argv.slice(2)): ForgeConfig {
  return {
    maxSessions:
      intArg(argv, "--max-sessions") ??
      envInt("FORGE_MAX_SESSIONS") ??
      DEFAULT_CONFIG.maxSessions,
    idleTimeout:
      intArg(argv, "--idle-timeout") ??
      envInt("FORGE_IDLE_TIMEOUT") ??
      DEFAULT_CONFIG.idleTimeout,
    bufferSize:
      intArg(argv, "--buffer-size") ??
      envInt("FORGE_BUFFER_SIZE") ??
      DEFAULT_CONFIG.bufferSize,
    dashboard:
      boolArg(argv, "--dashboard") ??
      envBool("FORGE_DASHBOARD") ??
      DEFAULT_CONFIG.dashboard,
    dashboardPort:
      intArg(argv, "--port") ??
      envInt("FORGE_DASHBOARD_PORT") ??
      DEFAULT_CONFIG.dashboardPort,
    shell:
      strArg(argv, "--shell") ??
      process.env.SHELL ??
      DEFAULT_CONFIG.shell,
    claudePath:
      strArg(argv, "--claude-path") ??
      process.env.FORGE_CLAUDE_PATH ??
      DEFAULT_CONFIG.claudePath,
    exitedTtl:
      intArg(argv, "--exited-ttl") ??
      envInt("FORGE_EXITED_TTL") ??
      DEFAULT_CONFIG.exitedTtl,
  };
}
