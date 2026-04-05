import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Write MCP config files in a directory so spawned agents can discover Forge.
 * Called after creating git worktrees for spawn/delegate tools.
 */
export function ensureMcpConfig(dir: string, mcpUrl: string, authToken?: string): void {
  try {
    // Claude Code reads .mcp.json from the project root
    const claudeConfigPath = path.join(dir, ".mcp.json");
    if (!existsSync(claudeConfigPath)) {
      const entry: Record<string, unknown> = { type: "http", url: mcpUrl };
      if (authToken) entry.headers = { Authorization: `Bearer ${authToken}` };
      writeFileSync(claudeConfigPath, JSON.stringify({ mcpServers: { forge: entry } }, null, 2) + "\n");
    }

    // Gemini CLI reads .gemini/settings.json from the project root
    const geminiDir = path.join(dir, ".gemini");
    const geminiConfigPath = path.join(geminiDir, "settings.json");
    if (!existsSync(geminiConfigPath)) {
      mkdirSync(geminiDir, { recursive: true });
      const entry: Record<string, unknown> = { url: mcpUrl };
      if (authToken) entry.headers = { Authorization: `Bearer ${authToken}` };
      writeFileSync(geminiConfigPath, JSON.stringify({ mcpServers: { forge: entry } }, null, 2) + "\n");
    }
  } catch (err) {
    process.stderr.write(`Warning: failed to write MCP config in ${dir}: ${(err as Error).message}\n`);
  }
}
