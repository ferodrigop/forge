import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { createServer } from "./server.js";
import { ConfigManager } from "./utils/config.js";
import { logger, setLogLevel } from "./utils/logger.js";
import {
  DEFAULT_PORT,
  readPid,
  isProcessAlive,
  writeDaemonFiles,
  cleanDaemonFiles,
  getPortPid,
  getDaemonStatus,
} from "./utils/daemon.js";

// ─── Subcommands ───────────────────────────────────────────────

async function cmdStart(args: string[]): Promise<void> {
  const detached = args.includes("-d") || args.includes("--detach");

  if (args.includes("--verbose")) {
    setLogLevel("debug");
  }

  // Check if already running (PID file or port occupied)
  const status = await getDaemonStatus();
  if (status.running) {
    process.stderr.write(`Forge daemon already running (PID ${status.pid}) at http://127.0.0.1:${DEFAULT_PORT}\n`);
    process.exit(0);
  }

  // Parse config early to get the actual port
  const configManager = new ConfigManager(args);
  const config = configManager.config;
  config.dashboard = true;
  const port = config.dashboardPort;

  // Also check if the port is occupied (e.g. old stdio-mode Forge with no PID file)
  const portPid = await getPortPid(port);
  if (portPid) {
    process.stderr.write(
      `Port ${port} already in use by PID ${portPid}.\n` +
      `Kill it first: kill ${portPid}\n` +
      `Or use a different port: forge start --port ${port + 1}\n`,
    );
    process.exit(1);
  }

  if (detached) {
    // Fork detached child
    const child = spawn(process.argv[0], [process.argv[1], "start", ...args.filter((a) => a !== "-d" && a !== "--detach")], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, FORGE_DAEMON: "1" },
    });
    child.unref();

    // Wait briefly for startup
    await new Promise((r) => setTimeout(r, 500));
    const newStatus = await getDaemonStatus();
    if (newStatus.running) {
      process.stderr.write(`Forge daemon started (PID ${newStatus.pid}) at http://127.0.0.1:${DEFAULT_PORT}\n`);
    } else {
      process.stderr.write("Forge daemon failed to start. Check logs.\n");
      process.exit(1);
    }
    return;
  }

  // Run in foreground
  logger.info("Starting forge daemon", {
    port: config.dashboardPort,
    maxSessions: config.maxSessions,
  });

  const { manager } = createServer(configManager);
  await manager.init();

  const { DashboardServer } = await import("./dashboard/dashboard-server.js");
  const ds = new DashboardServer(manager, config.dashboardPort, configManager);
  await ds.start();

  // Start watching settings file for hot-reload
  configManager.startWatching();
  configManager.on("changed", (newConfig) => {
    manager.updateConfig(newConfig);
    logger.info("Config hot-reloaded", { maxSessions: newConfig.maxSessions, idleTimeout: newConfig.idleTimeout });
  });

  // Write PID/lock files
  await writeDaemonFiles(process.pid);
  logger.info("Forge daemon running", {
    pid: process.pid,
    url: `http://127.0.0.1:${config.dashboardPort}`,
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down daemon...");
    configManager.stopWatching();
    ds.stop();
    manager.closeAll();
    await cleanDaemonFiles();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function cmdStop(): Promise<void> {
  let status = await getDaemonStatus();
  // Fallback: check port if no PID file (e.g. old stdio-mode Forge)
  if (!status.running) {
    const portPid = await getPortPid(DEFAULT_PORT);
    if (portPid) {
      status = { running: true, pid: portPid };
    }
  }
  if (!status.running || !status.pid) {
    process.stderr.write("Forge daemon is not running.\n");
    process.exit(0);
  }

  process.stderr.write(`Stopping forge daemon (PID ${status.pid})...\n`);
  try {
    process.kill(status.pid, "SIGTERM");
  } catch {
    process.stderr.write("Process already dead.\n");
    await cleanDaemonFiles();
    return;
  }

  // Wait up to 5s for graceful shutdown
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(status.pid)) {
      process.stderr.write("Forge daemon stopped.\n");
      await cleanDaemonFiles();
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // Force kill
  try {
    process.kill(status.pid, "SIGKILL");
  } catch {
    // Already dead
  }
  await cleanDaemonFiles();
  process.stderr.write("Forge daemon force-killed.\n");
}

async function cmdStatus(): Promise<void> {
  const status = await getDaemonStatus();
  if (!status.running) {
    process.stderr.write("Forge daemon: stopped\n");
    process.exit(1);
  }

  // Try to fetch health from the running daemon
  try {
    const res = await fetch(`http://127.0.0.1:${DEFAULT_PORT}/api/sessions`);
    const sessions = (await res.json()) as Array<{ id: string; status: string }>;
    const running = sessions.filter((s) => s.status === "running").length;
    const exited = sessions.length - running;
    process.stderr.write(
      `Forge daemon: running (PID ${status.pid})\n` +
        `  URL: http://127.0.0.1:${DEFAULT_PORT}\n` +
        `  Sessions: ${running} running, ${exited} exited\n`,
    );
  } catch {
    process.stderr.write(`Forge daemon: running (PID ${status.pid})\n  URL: http://127.0.0.1:${DEFAULT_PORT}\n`);
  }
}

// ─── Agent registration helpers ───────────────────────────────

type AgentDef = {
  name: string;
  description: string;
  register: (mcpUrl: string, force?: boolean) => void;
};

function cliIsAvailable(bin: string): boolean {
  try {
    execFileSync(bin, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function mergeJsonConfig(filePath: string, rootKey: string, serverName: string, entry: Record<string, unknown>, force = false): void {
  let config: Record<string, unknown> = {};
  if (existsSync(filePath)) {
    try {
      config = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      process.stderr.write(`Warning: could not parse ${filePath}, skipping.\n`);
      return;
    }
  } else {
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
  }

  const servers = (config[rootKey] ?? {}) as Record<string, unknown>;
  if (servers[serverName] && !force) {
    process.stderr.write(`Forge already registered in ${filePath}\n`);
    return;
  }

  servers[serverName] = entry;
  config[rootKey] = servers;
  writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
  process.stderr.write(`Wrote forge config to ${filePath}\n`);
}

function registerViaCli(bin: string, listArgs: string[], addArgs: string[], notFoundUrl: string, force = false): void {
  // Check if already registered (skip when --force)
  if (!force) {
    try {
      const listing = execFileSync(bin, listArgs, { encoding: "utf-8" });
      if (listing.includes("forge")) {
        process.stderr.write(`Forge already registered with ${bin}.\n`);
        return;
      }
    } catch {
      // list failed — will be caught below in add
    }
  }

  try {
    execFileSync(bin, addArgs, { stdio: "inherit" });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      process.stderr.write(`Error: '${bin}' CLI not found. Install it first:\n  ${notFoundUrl}\n`);
    } else {
      process.stderr.write(
        `Error registering Forge with ${bin}.\n` +
        `  Command: ${bin} ${addArgs.join(" ")}\n` +
        `  This may indicate a CLI version mismatch. Check: ${bin} --version\n` +
        `  ${err}\n`,
      );
    }
    process.exit(1);
  }
}

/**
 * Walk from `startDir` up to the filesystem root, collecting every `.mcp.json` found.
 * Stops early once it reaches the user's home directory (inclusive).
 */
export function discoverMcpJsonFiles(startDir: string = process.cwd()): string[] {
  const found: string[] = [];
  const home = homedir();
  let dir = resolve(startDir);

  while (true) {
    const candidate = join(dir, ".mcp.json");
    if (existsSync(candidate)) {
      found.push(candidate);
    }
    // Stop after checking home directory (don't go above it)
    if (dir === home) break;
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  return found;
}

export function registerMcpJsonFile(filePath: string, mcpUrl: string): void {
  mergeJsonConfig(filePath, "mcpServers", "forge", { type: "http", url: mcpUrl });
}

const AGENTS: AgentDef[] = [
  {
    name: "claude-code",
    description: "Claude Code",
    register(mcpUrl, force) {
      registerViaCli(
        "claude",
        ["mcp", "list"],
        ["mcp", "add", "--transport", "http", "forge", mcpUrl],
        "https://docs.anthropic.com/en/docs/claude-code",
        force,
      );
    },
  },
  {
    name: "gemini-cli",
    description: "Gemini CLI",
    register(mcpUrl, force) {
      registerViaCli(
        "gemini",
        ["mcp", "list"],
        ["mcp", "add", "--transport", "http", "forge", mcpUrl],
        "https://github.com/google-gemini/gemini-cli",
        force,
      );
    },
  },
  {
    name: "codex-cli",
    description: "Codex CLI (OpenAI)",
    register(mcpUrl, force) {
      registerViaCli(
        "codex",
        ["mcp", "list"],
        ["mcp", "add", "forge", "--url", mcpUrl],
        "https://github.com/openai/codex",
        force,
      );
    },
  },
  {
    name: "cursor",
    description: "Cursor",
    register(mcpUrl, force) {
      mergeJsonConfig(
        join(homedir(), ".cursor", "mcp.json"),
        "mcpServers",
        "forge",
        { url: mcpUrl },
        force,
      );
    },
  },
  {
    name: "windsurf",
    description: "Windsurf",
    register(mcpUrl, force) {
      mergeJsonConfig(
        join(homedir(), ".codeium", "windsurf", "mcp_config.json"),
        "mcpServers",
        "forge",
        { serverUrl: mcpUrl },
        force,
      );
    },
  },
  {
    name: "copilot",
    description: "GitHub Copilot CLI",
    register(mcpUrl, force) {
      mergeJsonConfig(
        join(homedir(), ".copilot", "mcp-config.json"),
        "mcpServers",
        "forge",
        { type: "http", url: mcpUrl },
        force,
      );
    },
  },
  {
    name: "deep-agents",
    description: "Deep Agents (LangChain)",
    register(mcpUrl, force) {
      mergeJsonConfig(
        join(homedir(), ".deepagents", ".mcp.json"),
        "mcpServers",
        "forge",
        { type: "http", url: mcpUrl },
        force,
      );
    },
  },
];

const AGENT_NAMES = AGENTS.map((a) => a.name);

async function ensureDaemonRunning(): Promise<void> {
  const status = await getDaemonStatus();
  if (status.running) {
    process.stderr.write(`Forge daemon already running (PID ${status.pid}).\n`);
    return;
  }

  process.stderr.write("Starting Forge daemon...\n");
  const child = spawn(process.argv[0], [process.argv[1], "start", "-d"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${DEFAULT_PORT}/api/sessions`);
      const newStatus = await getDaemonStatus();
      process.stderr.write(`Forge daemon started (PID ${newStatus.pid ?? "unknown"}).\n`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  process.stderr.write("Error: Forge daemon failed to start within 10s. Check logs.\n");
  process.exit(1);
}

async function cmdSetup(args: string[]): Promise<void> {
  // Parse flags
  const agentIdx = args.indexOf("--agent");
  const agentName = agentIdx !== -1 ? args[agentIdx + 1] : undefined;
  const force = args.includes("--force");

  if (args.includes("--list-agents")) {
    process.stderr.write("Supported agents:\n");
    for (const agent of AGENTS) {
      process.stderr.write(`  ${agent.name.padEnd(16)} ${agent.description}\n`);
    }
    return;
  }

  if (agentIdx !== -1 && !agentName) {
    process.stderr.write("Error: --agent requires a value. Use --list-agents to see options.\n");
    process.exit(1);
  }

  if (agentName && !AGENT_NAMES.includes(agentName)) {
    process.stderr.write(`Error: unknown agent '${agentName}'. Use --list-agents to see options.\n`);
    process.exit(1);
  }

  const mcpUrl = `http://127.0.0.1:${DEFAULT_PORT}/mcp`;

  if (!agentName) {
    // No agent specified — auto-discover .mcp.json files
    const discovered = discoverMcpJsonFiles();
    if (discovered.length > 0) {
      await ensureDaemonRunning();
      process.stderr.write(`\nDiscovered ${discovered.length} .mcp.json file(s):\n`);
      for (const filePath of discovered) {
        process.stderr.write(`  ${filePath}\n`);
        registerMcpJsonFile(filePath, mcpUrl);
      }
      process.stderr.write(`\nForge is ready! MCP server registered at ${mcpUrl}\n`);
    } else {
      process.stderr.write("No .mcp.json files found. Showing manual configuration:\n\n");
      process.stderr.write(`Forge MCP URL: ${mcpUrl}\n\n`);
      process.stderr.write("Add to your agent's MCP config (JSON):\n");
      process.stderr.write(JSON.stringify({ mcpServers: { forge: { type: "http", url: mcpUrl } } }, null, 2) + "\n\n");
      process.stderr.write("Or run with a specific agent:\n");
      process.stderr.write("  forge setup --agent claude-code\n");
      process.stderr.write("  forge setup --list-agents\n");
    }
    return;
  }

  const agent = AGENTS.find((a) => a.name === agentName)!;
  process.stderr.write(`Setting up Forge with ${agent.description}...\n`);

  await ensureDaemonRunning();
  agent.register(mcpUrl, force);

  process.stderr.write(`\nForge is ready! MCP server registered at ${mcpUrl}\n`);
}

// ─── Main CLI dispatcher ──────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (args.includes("--help") || args.includes("-h")) {
    process.stderr.write(`
forge — Persistent terminal MCP server for AI coding agents

Usage:
  forge setup --agent <name>  Auto-start daemon + register MCP with an AI agent
  forge setup --list-agents  List supported agents
  forge setup                Auto-discover .mcp.json files and register Forge
  forge start [-d]           Start daemon (foreground, or -d for detached/background)
  forge stop                 Stop daemon, kill all sessions
  forge status               Show daemon status, PID, session count

Daemon options (forge start):
  --max-sessions <n>   Max concurrent sessions (default: 10)
  --idle-timeout <ms>  Session idle timeout in ms (default: 1800000)
  --buffer-size <n>    Ring buffer size in bytes (default: 1048576)
  --shell <path>       Default shell (default: $SHELL)
  --claude-path <path> Path to claude CLI (default: claude)
  --codex-path <path>  Path to codex CLI (default: codex)
  --claude-default-model <m>  Default model for spawn_claude (e.g., sonnet, opus)
  --codex-default-model <m>  Default model for spawn_codex
  --gemini-default-model <m> Default model for spawn_gemini
  --auth-token <token> Require Bearer token for /mcp, /api, /ws
  --port <n>           HTTP port (default: 3141)
  --verbose            Enable debug logging
  -d, --detach         Run as background daemon

MCP config (add to your agent or ~/.claude/settings.json):
  { "mcpServers": { "forge": { "type": "http", "url": "http://127.0.0.1:3141/mcp" } } }

Custom agents (add to ~/.forge/settings.json):
  { "agents": { "aider": { "command": "aider", "name": "Aider",
    "oneshotArgs": ["--message", "{prompt}"], "modelFlag": "--model" } } }
  Then use spawn_agent or delegate_task with agent: "aider"
`);
    process.exit(0);
  }

  switch (command) {
    case "start":
      await cmdStart(args.slice(1));
      break;
    case "stop":
      await cmdStop();
      break;
    case "status":
      await cmdStatus();
      break;
    case "setup":
      await cmdSetup(args.slice(1));
      break;
    default:
      process.stderr.write(
        `Unknown command: ${command ?? "(none)"}\n\n` +
        "Usage:\n" +
        "  forge start [-d]           Start the Forge daemon\n" +
        "  forge setup --agent <name> Configure an AI agent to use Forge\n" +
        "  forge status               Show daemon status\n" +
        "  forge stop                 Stop the daemon\n" +
        "  forge --help               Full usage\n",
      );
      process.exit(1);
  }
}

// Only run when executed directly (not when imported by tests)
const isDirectExecution =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url === `file://${resolve(process.argv[1])}`);

if (isDirectExecution) {
  main().catch((err) => {
    logger.error("Fatal error", { error: String(err) });
    process.exit(1);
  });
}
