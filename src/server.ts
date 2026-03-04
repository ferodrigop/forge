import { randomUUID } from "node:crypto";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SessionManager } from "./core/session-manager.js";
import { resolveControl, listControls } from "./utils/control-chars.js";
import { getTemplate, listTemplates as listBuiltinTemplates } from "./core/templates.js";
import type { ForgeConfig } from "./core/types.js";
import type { Variables } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";

interface Subscription {
  id: string;
  sessionId: string;
  events: string[];
  cleanups: Array<() => void>;
}

export function createServer(config: ForgeConfig): { server: McpServer; manager: SessionManager } {
  const manager = new SessionManager(config);

  const server = new McpServer({
    name: "forge-terminal-mcp",
    version: "0.5.0",
  });

  const subscriptions = new Map<string, Subscription>();

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
      bufferSize: z.number().int().min(1024).max(10_485_760).optional().describe("Ring buffer size in bytes (default: from server config)"),
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
          bufferSize: params.bufferSize,
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

  // --- create_from_template ---
  server.tool(
    "create_from_template",
    "Create a terminal session from a pre-configured template (e.g., shell, next-dev, vite-dev, npm-test).",
    {
      template: z.string().describe("Template name"),
      cwd: z.string().optional().describe("Working directory override"),
      env: z.record(z.string()).optional().describe("Additional environment variables"),
      name: z.string().max(100).optional().describe("Session name override"),
    },
    async (params) => {
      try {
        const tmpl = getTemplate(params.template);
        if (!tmpl) {
          const available = listBuiltinTemplates().map((t) => t.name).join(", ");
          return {
            content: [{ type: "text" as const, text: `Unknown template "${params.template}". Available: ${available}` }],
            isError: true,
          };
        }

        const command = tmpl.command === "$SHELL" ? config.shell : tmpl.command;

        const session = manager.create({
          command,
          args: tmpl.args,
          cwd: params.cwd,
          env: { ...tmpl.env, ...params.env },
          cols: tmpl.cols,
          rows: tmpl.rows,
          name: params.name ?? tmpl.name,
          tags: tmpl.tags,
        });

        let waitForResult: { matched: boolean; data?: string; reason?: string; elapsed: number } | undefined;

        if (tmpl.waitFor) {
          const regex = new RegExp(tmpl.waitFor);
          const timeoutMs = 30_000;
          const start = Date.now();

          // Check backlog first
          const backlog = session.readFullBuffer();
          const backlogMatch = backlog.match(regex);
          if (backlogMatch) {
            waitForResult = { matched: true, data: backlogMatch[0], elapsed: 0 };
          } else {
            waitForResult = await new Promise<typeof waitForResult>((resolve) => {
              let accumulated = "";
              let settled = false;

              const cleanup = () => {
                if (settled) return;
                settled = true;
                unsubData();
                unsubExit();
                clearTimeout(timer);
              };

              const unsubData = session.onData((chunk) => {
                if (settled) return;
                accumulated += chunk;
                const m = accumulated.match(regex);
                if (m) {
                  cleanup();
                  resolve({ matched: true, data: m[0], elapsed: Date.now() - start });
                }
              });

              const unsubExit = session.onExit(() => {
                if (settled) return;
                cleanup();
                resolve({ matched: false, reason: "session_exited", elapsed: Date.now() - start });
              });

              const timer = setTimeout(() => {
                if (settled) return;
                cleanup();
                resolve({ matched: false, reason: "timeout", elapsed: Date.now() - start });
              }, timeoutMs);
            });
          }
        }

        const result: Record<string, unknown> = { ...session.getInfo() };
        if (waitForResult) {
          result.waitForResult = waitForResult;
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

  // --- list_templates ---
  server.tool(
    "list_templates",
    "List all available session templates.",
    {},
    async () => {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(listBuiltinTemplates(), null, 2) }],
      };
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
      bufferSize: z.number().int().min(1024).max(10_485_760).optional().describe("Ring buffer size in bytes (default: from server config)"),
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
          bufferSize: params.bufferSize,
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

  // --- grep_terminal ---
  server.tool(
    "grep_terminal",
    "Search terminal output buffer with a regex pattern. Returns matching lines with optional context.",
    {
      id: z.string().describe("Session ID"),
      pattern: z.string().describe("Regex pattern to search for"),
      context: z.number().int().min(0).max(10).optional().describe("Lines of context around each match (default: 0)"),
    },
    async (params) => {
      try {
        const session = manager.getOrThrow(params.id);

        let regex: RegExp;
        try {
          regex = new RegExp(params.pattern, "gm");
        } catch {
          return {
            content: [{ type: "text" as const, text: `Invalid regex: "${params.pattern}"` }],
            isError: true,
          };
        }

        const allOutput = session.readFullBuffer();
        const lines = allOutput.split("\n");
        const ctx = params.context ?? 0;
        const matches: Array<{ lineNumber: number; text: string; context?: string[] }> = [];

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            const match: { lineNumber: number; text: string; context?: string[] } = {
              lineNumber: i + 1,
              text: lines[i],
            };
            if (ctx > 0) {
              const start = Math.max(0, i - ctx);
              const end = Math.min(lines.length - 1, i + ctx);
              match.context = lines.slice(start, end + 1);
            }
            matches.push(match);
          }
          regex.lastIndex = 0; // reset for next test
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ matches, totalMatches: matches.length }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- wait_for ---
  server.tool(
    "wait_for",
    "Wait for a regex pattern to appear in terminal output. Checks existing buffer first, then watches new output.",
    {
      id: z.string().describe("Session ID"),
      pattern: z.string().describe("Regex pattern to wait for"),
      timeout: z.number().int().min(100).max(300_000).optional().describe("Timeout in ms (default: 30000)"),
    },
    async (params) => {
      try {
        const session = manager.getOrThrow(params.id);

        let regex: RegExp;
        try {
          regex = new RegExp(params.pattern);
        } catch {
          return {
            content: [{ type: "text" as const, text: `Invalid regex: "${params.pattern}"` }],
            isError: true,
          };
        }

        const timeoutMs = params.timeout ?? 30_000;
        const start = Date.now();

        // Check backlog first
        const backlog = session.readFullBuffer();
        const backlogMatch = backlog.match(regex);
        if (backlogMatch) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ matched: true, data: backlogMatch[0], elapsed: 0 }, null, 2),
            }],
          };
        }

        // Watch new output
        const result = await new Promise<{ matched: boolean; data?: string; reason?: string; elapsed: number }>((resolve) => {
          let accumulated = "";
          let settled = false;

          const cleanup = () => {
            if (settled) return;
            settled = true;
            unsubData();
            unsubExit();
            clearTimeout(timer);
          };

          const unsubData = session.onData((chunk) => {
            if (settled) return;
            accumulated += chunk;
            const m = accumulated.match(regex);
            if (m) {
              cleanup();
              resolve({ matched: true, data: m[0], elapsed: Date.now() - start });
            }
          });

          const unsubExit = session.onExit(() => {
            if (settled) return;
            cleanup();
            resolve({ matched: false, reason: "session_exited", elapsed: Date.now() - start });
          });

          const timer = setTimeout(() => {
            if (settled) return;
            cleanup();
            resolve({ matched: false, reason: "timeout", elapsed: Date.now() - start });
          }, timeoutMs);
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- subscribe_events ---
  server.tool(
    "subscribe_events",
    "Subscribe to session events (exit, pattern_match). Notifications are sent as MCP logging messages.",
    {
      id: z.string().describe("Session ID"),
      events: z.array(z.enum(["exit", "pattern_match"])).min(1).describe("Events to subscribe to"),
      pattern: z.string().optional().describe("Regex pattern (required if pattern_match is in events)"),
    },
    async (params) => {
      try {
        const session = manager.getOrThrow(params.id);

        if (params.events.includes("pattern_match") && !params.pattern) {
          return {
            content: [{ type: "text" as const, text: "Error: 'pattern' is required when subscribing to 'pattern_match'" }],
            isError: true,
          };
        }

        let regex: RegExp | undefined;
        if (params.pattern) {
          try {
            regex = new RegExp(params.pattern);
          } catch {
            return {
              content: [{ type: "text" as const, text: `Invalid regex: "${params.pattern}"` }],
              isError: true,
            };
          }
        }

        const subscriptionId = randomUUID().slice(0, 12);
        const cleanups: Array<() => void> = [];

        if (params.events.includes("exit")) {
          const unsub = session.onExit((_id, exitCode) => {
            server.server.sendLoggingMessage({
              level: "info",
              data: JSON.stringify({
                subscriptionId,
                event: "exit",
                sessionId: params.id,
                exitCode,
              }),
            });
          });
          cleanups.push(unsub);
        }

        if (params.events.includes("pattern_match") && regex) {
          let accumulated = "";
          const unsub = session.onData((chunk) => {
            accumulated += chunk;
            const m = accumulated.match(regex!);
            if (m) {
              server.server.sendLoggingMessage({
                level: "info",
                data: JSON.stringify({
                  subscriptionId,
                  event: "pattern_match",
                  sessionId: params.id,
                  data: m[0],
                }),
              });
              // Auto-unsubscribe after first match
              const sub = subscriptions.get(subscriptionId);
              if (sub) {
                sub.cleanups.forEach((fn) => fn());
                subscriptions.delete(subscriptionId);
              }
            }
          });
          cleanups.push(unsub);
        }

        subscriptions.set(subscriptionId, {
          id: subscriptionId,
          sessionId: params.id,
          events: params.events,
          cleanups,
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ subscriptionId, sessionId: params.id, events: params.events }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- unsubscribe_events ---
  server.tool(
    "unsubscribe_events",
    "Unsubscribe from session events by subscription ID.",
    {
      subscriptionId: z.string().describe("Subscription ID to cancel"),
    },
    async (params) => {
      const sub = subscriptions.get(params.subscriptionId);
      if (!sub) {
        return {
          content: [{ type: "text" as const, text: `Subscription "${params.subscriptionId}" not found` }],
          isError: true,
        };
      }
      sub.cleanups.forEach((fn) => fn());
      subscriptions.delete(params.subscriptionId);
      return {
        content: [{ type: "text" as const, text: `Unsubscribed ${params.subscriptionId}` }],
      };
    }
  );

  // --- list_terminals ---
  server.tool(
    "list_terminals",
    "List all terminal sessions with their status, PID, and activity time. Optionally filter by tag.",
    {
      tag: z.string().optional().describe("Filter sessions by tag"),
    },
    async (params) => {
      const sessions = params.tag
        ? manager.listByTag(params.tag)
        : manager.list();
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

  // --- close_group ---
  server.tool(
    "close_group",
    "Close all terminal sessions with a matching tag.",
    {
      tag: z.string().describe("Tag to match for closing sessions"),
    },
    async (params) => {
      const count = manager.closeByTag(params.tag);
      return {
        content: [{ type: "text" as const, text: `Closed ${count} sessions with tag '${params.tag}'` }],
      };
    }
  );

  // --- read_multiple ---
  server.tool(
    "read_multiple",
    "Read output from multiple terminal sessions in a single call. Returns per-session results with inline errors.",
    {
      ids: z.array(z.string()).min(1).max(20).describe("Session IDs to read from"),
      mode: z.enum(["incremental", "screen"]).optional().describe("Read mode (default: incremental)"),
    },
    async (params) => {
      const readMode = params.mode ?? "incremental";
      const results: Array<Record<string, unknown>> = [];

      for (const id of params.ids) {
        try {
          const session = manager.getOrThrow(id);
          const info = session.getInfo();

          if (readMode === "screen") {
            const screen = session.readScreen();
            results.push({ id, status: info.status, data: screen });
          } else {
            const { data, droppedBytes } = session.read();
            const entry: Record<string, unknown> = {
              id,
              status: info.status,
              data,
              bytes: data.length,
            };
            if (droppedBytes > 0) {
              entry.droppedBytes = droppedBytes;
            }
            results.push(entry);
          }
        } catch (err) {
          results.push({ id, error: (err as Error).message });
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
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

  // --- health_check ---
  const serverStartTime = Date.now();
  server.tool(
    "health_check",
    "Returns server health info: version, uptime, session count, and memory usage.",
    {},
    async () => {
      const mem = process.memoryUsage();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            version: "0.5.0",
            uptime: Math.floor((Date.now() - serverStartTime) / 1000),
            sessions: {
              active: manager.count,
              max: config.maxSessions,
            },
            memory: {
              rss: Math.round(mem.rss / 1_048_576),
              heapUsed: Math.round(mem.heapUsed / 1_048_576),
              heapTotal: Math.round(mem.heapTotal / 1_048_576),
            },
          }, null, 2),
        }],
      };
    }
  );

  // --- clear_history ---
  server.tool(
    "clear_history",
    "Clear persisted session history (stale entries from previous runs).",
    {},
    async () => {
      await manager.clearHistory();
      return {
        content: [{ type: "text" as const, text: "Session history cleared" }],
      };
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
