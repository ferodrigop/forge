import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { parseConfig } from "./utils/config.js";
import { logger, setLogLevel } from "./utils/logger.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    process.stderr.write(`
forge-terminal-mcp — Terminal MCP server for Claude Code

Usage: forge-terminal-mcp [options]

Options:
  --max-sessions <n>   Max concurrent sessions (default: 10)
  --idle-timeout <ms>  Session idle timeout in ms (default: 1800000)
  --buffer-size <n>    Ring buffer size in bytes (default: 1048576)
  --shell <path>       Default shell (default: $SHELL)
  --dashboard          Enable web dashboard
  --port <n>           Dashboard port (default: 3141)
  --verbose            Enable debug logging
  --help, -h           Show this help
`);
    process.exit(0);
  }

  if (args.includes("--verbose")) {
    setLogLevel("debug");
  }

  const config = parseConfig(args);
  logger.info("Starting forge-terminal-mcp", {
    maxSessions: config.maxSessions,
    shell: config.shell,
    dashboard: config.dashboard,
  });

  const { server, manager } = createServer(config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("MCP server connected via stdio");

  // Start dashboard if enabled
  let dashboardServer: { stop(): void } | undefined;
  if (config.dashboard) {
    const { DashboardServer } = await import("./dashboard/dashboard-server.js");
    const ds = new DashboardServer(manager, config.dashboardPort);
    await ds.start();
    dashboardServer = ds;
  }

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Shutting down...");
    dashboardServer?.stop();
    manager.closeAll();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("Fatal error", { error: String(err) });
  process.exit(1);
});
