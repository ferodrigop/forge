import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SessionManager } from "./core/session-manager.js";
import { resolveControl, listControls } from "./utils/control-chars.js";
import type { ForgeConfig } from "./core/types.js";
import type { Variables } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";

export function createServer(config: ForgeConfig): { server: McpServer; manager: SessionManager } {
  const manager = new SessionManager(config);

  const server = new McpServer({
    name: "forge-terminal-mcp",
    version: "0.3.0",
  });

  // --- create_terminal ---
  server.tool(
    "create_terminal",
    "Spawn a new PTY terminal session. Returns session ID for subsequent operations.",
    {
      command: z.string().optional().describe("Command to run (default: user's shell)"),
      args: z.array(z.string()).optional().describe("Command arguments"),
      cwd: z.string().optional().describe("Working directory"),
      env: z.record(z.string()).optional().describe("Additional environment variables"),
      cols: z.number().int().min(1).max(500).optional().describe("Terminal width (default: 120)"),
      rows: z.number().int().min(1).max(200).optional().describe("Terminal height (default: 24)"),
      name: z.string().max(100).optional().describe("Human-readable session name"),
      tags: z.array(z.string()).max(10).optional().describe("Tags for filtering/grouping"),
    },
    async (params) => {
      try {
        const session = manager.create({
          command: params.command ?? config.shell,
          args: params.args,
          cwd: params.cwd,
          env: params.env,
          cols: params.cols,
          rows: params.rows,
          name: params.name,
          tags: params.tags,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(session.getInfo(), null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- spawn_claude ---
  server.tool(
    "spawn_claude",
    "Spawn a Claude Code agent in a new terminal session. Runs 'claude --print -p <prompt>' with optional model, tools, and budget.",
    {
      prompt: z.string().describe("The prompt to send to Claude"),
      cwd: z.string().optional().describe("Working directory for Claude"),
      model: z.string().optional().describe("Model to use (e.g., 'sonnet', 'opus')"),
      allowedTools: z.array(z.string()).optional().describe("Tools Claude is allowed to use"),
      name: z.string().max(100).optional().describe("Session name (default: auto-generated from prompt)"),
      tags: z.array(z.string()).max(10).optional().describe("Additional tags (claude-agent is always included)"),
      maxBudget: z.number().positive().optional().describe("Max budget in USD"),
    },
    async (params) => {
      try {
        const args = ["--print", "-p", params.prompt];

        if (params.model) {
          args.push("--model", params.model);
        }
        if (params.allowedTools && params.allowedTools.length > 0) {
          args.push("--allowedTools", params.allowedTools.join(","));
        }
        if (params.maxBudget) {
          args.push("--max-budget-usd", String(params.maxBudget));
        }

        const autoName = params.name ?? `claude: ${params.prompt.slice(0, 60)}`;
        const baseTags = ["claude-agent"];
        const mergedTags = params.tags
          ? [...new Set([...baseTags, ...params.tags])]
          : baseTags;

        const session = manager.create({
          command: config.claudePath,
          args,
          cwd: params.cwd,
          name: autoName,
          tags: mergedTags,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(session.getInfo(), null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- write_terminal ---
  server.tool(
    "write_terminal",
    "Send input to a terminal session. Appends newline by default.",
    {
      id: z.string().describe("Session ID"),
      input: z.string().describe("Text to send"),
      newline: z.boolean().optional().describe("Append newline (default: true)"),
    },
    async (params) => {
      try {
        const session = manager.getOrThrow(params.id);
        const data = params.newline === false ? params.input : params.input + "\n";
        session.write(data);
        return {
          content: [{ type: "text" as const, text: `Sent ${data.length} bytes to session ${params.id}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- read_terminal ---
  server.tool(
    "read_terminal",
    "Read NEW output from a terminal since last read (incremental). Token-efficient — only returns what changed.",
    {
      id: z.string().describe("Session ID"),
    },
    async (params) => {
      try {
        const session = manager.getOrThrow(params.id);
        const { data, droppedBytes } = session.read();
        const info = session.getInfo();

        const result: Record<string, unknown> = {
          status: info.status,
          data,
          bytes: data.length,
        };

        if (droppedBytes > 0) {
          result.droppedBytes = droppedBytes;
          result.warning = `${droppedBytes} bytes were lost (buffer overflow)`;
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- read_screen ---
  server.tool(
    "read_screen",
    "Read the current terminal viewport as rendered text (no ANSI codes). Shows what a human would see on screen.",
    {
      id: z.string().describe("Session ID"),
    },
    async (params) => {
      try {
        const session = manager.getOrThrow(params.id);
        const screen = session.readScreen();

        return {
          content: [{ type: "text" as const, text: screen }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- list_terminals ---
  server.tool(
    "list_terminals",
    "List all terminal sessions with their status, PID, and activity time.",
    {},
    async () => {
      const sessions = manager.list();
      return {
        content: [
          {
            type: "text" as const,
            text: sessions.length === 0
              ? "No active sessions"
              : JSON.stringify(sessions, null, 2),
          },
        ],
      };
    }
  );

  // --- close_terminal ---
  server.tool(
    "close_terminal",
    "Kill a terminal session and release its resources.",
    {
      id: z.string().describe("Session ID"),
    },
    async (params) => {
      try {
        manager.close(params.id);
        return {
          content: [{ type: "text" as const, text: `Session ${params.id} closed` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- send_control ---
  server.tool(
    "send_control",
    `Send a control sequence to a terminal (e.g., ctrl+c, ctrl+d, up, down, tab, enter). Available: ${listControls().join(", ")}`,
    {
      id: z.string().describe("Session ID"),
      key: z.string().describe("Control key name (e.g., 'ctrl+c', 'up', 'tab')"),
    },
    async (params) => {
      try {
        const session = manager.getOrThrow(params.id);
        const chars = resolveControl(params.key);
        if (!chars) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown control key: "${params.key}". Available: ${listControls().join(", ")}`,
              },
            ],
            isError: true,
          };
        }
        session.write(chars);
        return {
          content: [{ type: "text" as const, text: `Sent ${params.key} to session ${params.id}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- resize_terminal ---
  server.tool(
    "resize_terminal",
    "Change the terminal dimensions (columns and rows).",
    {
      id: z.string().describe("Session ID"),
      cols: z.number().int().min(1).max(500).describe("New width"),
      rows: z.number().int().min(1).max(200).describe("New height"),
    },
    async (params) => {
      try {
        const session = manager.getOrThrow(params.id);
        session.resize(params.cols, params.rows);
        return {
          content: [
            {
              type: "text" as const,
              text: `Session ${params.id} resized to ${params.cols}x${params.rows}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- MCP Resources: terminal://sessions/{sessionId} ---
  const sessionTemplate = new ResourceTemplate("terminal://sessions/{sessionId}", {
    list: async () => {
      return {
        resources: manager.list().map((s) => ({
          uri: `terminal://sessions/${s.id}`,
          name: s.name ?? s.command,
          description: `Terminal session ${s.id} (${s.status})`,
          mimeType: "application/json" as const,
        })),
      };
    },
  });

  server.resource(
    "terminal-session",
    sessionTemplate,
    async (uri: URL, variables: Variables) => {
      const sessionId = variables.sessionId as string;
      const session = manager.get(sessionId);

      if (!session) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain" as const,
              text: `Session "${sessionId}" not found`,
            },
          ],
        };
      }

      const info = session.getInfo();
      const screen = session.readScreen();

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json" as const,
            text: JSON.stringify({ ...info, screen }, null, 2),
          },
        ],
      };
    }
  );

  // Notify MCP clients when session list changes
  manager.on("sessionCreated", () => {
    server.sendResourceListChanged();
  });
  manager.on("sessionClosed", () => {
    server.sendResourceListChanged();
  });

  return { server, manager };
}
