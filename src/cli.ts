import { spawn } from "node:child_process";
import { createServer } from "./server.js";
import { parseConfig } from "./utils/config.js";
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
  const config = parseConfig(args);
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

  const { manager } = createServer(config);
  await manager.init();

  const { DashboardServer } = await import("./dashboard/dashboard-server.js");
  const ds = new DashboardServer(manager, config.dashboardPort, config);
  await ds.start();

  // Write PID/lock files
  await writeDaemonFiles(process.pid);
  logger.info("Forge daemon running", {
    pid: process.pid,
    url: `http://127.0.0.1:${config.dashboardPort}`,
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down daemon...");
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

async function cmdStdioProxy(args: string[]): Promise<void> {
  // stdio proxy mode: bridge stdin/stdout <-> HTTP MCP transport
  // Auto-start daemon if not running
  const status = await getDaemonStatus();
  if (!status.running) {
    // Start daemon in background
    const child = spawn(process.argv[0], [process.argv[1], "start", ...args], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, FORGE_DAEMON: "1" },
    });
    child.unref();

    // Wait for daemon to be ready
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        await fetch(`http://127.0.0.1:${DEFAULT_PORT}/api/sessions`);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }

  // Bridge stdio to HTTP MCP
  // Read JSON-RPC messages from stdin, POST to /mcp, stream responses to stdout
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const config = parseConfig(args);

  if (args.includes("--verbose")) {
    setLogLevel("debug");
  }

  const { server, manager } = createServer(config);
  await manager.init();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("MCP server connected via stdio (proxy mode)");

  // Start dashboard if --dashboard flag is present
  let dashboardServer: { stop(): void } | undefined;
  if (config.dashboard) {
    const { DashboardServer } = await import("./dashboard/dashboard-server.js");
    const ds = new DashboardServer(manager, config.dashboardPort, config);
    await ds.start();
    dashboardServer = ds;
  }

  const shutdown = () => {
    logger.info("Shutting down...");
    dashboardServer?.stop();
    manager.closeAll();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ─── Main CLI dispatcher ──────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (args.includes("--help") || args.includes("-h")) {
    process.stderr.write(`
forge — Persistent terminal MCP daemon for Claude Code

Usage:
  forge start [-d]     Start daemon (foreground, or -d for detached/background)
  forge stop           Stop daemon, kill all sessions
  forge status         Show daemon status, PID, session count

Daemon options (forge start):
  --max-sessions <n>   Max concurrent sessions (default: 10)
  --idle-timeout <ms>  Session idle timeout in ms (default: 1800000)
  --buffer-size <n>    Ring buffer size in bytes (default: 1048576)
  --shell <path>       Default shell (default: $SHELL)
  --claude-path <path> Path to claude CLI (default: claude)
  --codex-path <path>  Path to codex CLI (default: codex)
  --auth-token <token> Require Bearer token for /mcp, /api, /ws
  --port <n>           HTTP port (default: 3141)
  --verbose            Enable debug logging
  -d, --detach         Run as background daemon

Backward-compatible stdio mode (no subcommand):
  forge [options]      Run as stdio MCP server (auto-starts daemon)

MCP config (recommended — add to ~/.claude/settings.json):
  { "mcpServers": { "forge": { "type": "http", "url": "http://127.0.0.1:3141/mcp" } } }

Legacy stdio config (.mcp.json):
  { "mcpServers": { "forge": { "command": "node", "args": ["path/to/forge/dist/cli.js"] } } }
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
    default:
      // Backward compat: no subcommand → stdio proxy mode
      await cmdStdioProxy(args);
      break;
  }
}

main().catch((err) => {
  logger.error("Fatal error", { error: String(err) });
  process.exit(1);
});
