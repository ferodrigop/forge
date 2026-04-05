import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SessionManager } from "./core/session-manager.js";
import { resolveControl, listControls } from "./utils/control-chars.js";
import { getTemplate, listTemplates as listBuiltinTemplates } from "./core/templates.js";
import { ensureMcpConfig } from "./utils/mcp-config.js";
import { AgentRegistry } from "./core/agent-registry.js";
import type { AgentDefinition } from "./core/agent-registry.js";
import type { ForgeConfig } from "./core/types.js";
import type { ConfigManager } from "./utils/config.js";
import type { Variables } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";

/** Accept either a ConfigManager (live config) or a plain ForgeConfig (static) */
type ConfigSource = ConfigManager | ForgeConfig;
function resolveConfig(src: ConfigSource): ForgeConfig {
  return "config" in src && typeof (src as ConfigManager).config === "object" && "startWatching" in src
    ? (src as ConfigManager).config
    : src as ForgeConfig;
}

interface Subscription {
  id: string;
  sessionId: string;
  events: string[];
  cleanups: Array<() => void>;
}

export function createServer(configSource: ConfigSource, existingManager?: SessionManager): { server: McpServer; manager: SessionManager; registry: AgentRegistry } {
  // Use a getter so every tool invocation reads live config
  const getConfig = (): ForgeConfig => resolveConfig(configSource);
  const config = getConfig(); // initial config for manager creation
  const manager = existingManager ?? new SessionManager(config);
  const registry = new AgentRegistry(config);

  // Rebuild registry when config changes
  if ("on" in configSource && typeof (configSource as ConfigManager).on === "function") {
    (configSource as ConfigManager).on("changed", (newConfig: ForgeConfig) => {
      registry.rebuild(newConfig);
    });
  }

  const server = new McpServer({
    name: "forge-terminal-mcp",
    version: "0.9.0",
  });

  const subscriptions = new Map<string, Subscription>();

  /** Write MCP config files in a worktree so spawned agents can discover Forge. */
  function ensureWorktreeMcpConfig(worktreePath: string): void {
    const mcpUrl = `http://127.0.0.1:${getConfig().dashboardPort}/mcp`;
    ensureMcpConfig(worktreePath, mcpUrl, getConfig().authToken);
  }

  // ─── Shared helpers for agent spawn tools ──────────────────────

  /** Resolve effective cwd from explicit cwd, fromSession, or process.cwd(). */
  function resolveCwd(explicitCwd?: string, fromSession?: string): { cwd?: string; error?: string } {
    if (explicitCwd) return { cwd: explicitCwd };
    if (fromSession) {
      const sourceSession = manager.get(fromSession);
      if (!sourceSession) return { error: `fromSession "${fromSession}" not found` };
      return { cwd: sourceSession.getInfo().cwd };
    }
    return {};
  }

  /** Create a git worktree. Returns { worktreePath } on success or { error } on failure. */
  function createWorktree(baseCwd: string | undefined, branch: string): { worktreePath?: string; error?: string } {
    const cwd = baseCwd ?? process.cwd();

    let repoRoot: string;
    try {
      repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf-8" }).trim();
    } catch {
      return { error: "Not inside a git repository (required for worktree)" };
    }

    const repoName = path.basename(repoRoot);
    const branchSuffix = branch.split("/").pop() ?? branch;
    const worktreePath = path.join(path.dirname(repoRoot), `${repoName}-${branchSuffix}`);

    try {
      execFileSync("git", ["worktree", "add", worktreePath, "-b", branch], {
        cwd: repoRoot, encoding: "utf-8", stdio: "pipe",
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("already exists")) {
        try {
          execFileSync("git", ["worktree", "add", worktreePath, branch], {
            cwd: repoRoot, encoding: "utf-8", stdio: "pipe",
          });
        } catch (err2) {
          return { error: `Creating worktree failed: ${(err2 as Error).message}` };
        }
      } else {
        return { error: `Creating worktree failed: ${msg}` };
      }
    }

    ensureWorktreeMcpConfig(worktreePath);
    return { worktreePath };
  }

  /** Generic agent spawn — used by spawn_agent and the legacy spawn_claude/codex/gemini wrappers. */
  function spawnAgentSession(
    agent: AgentDefinition,
    params: {
      prompt: string;
      cwd?: string;
      fromSession?: string;
      model?: string;
      name?: string;
      tags?: string[];
      bufferSize?: number;
      worktree?: boolean;
      branch?: string;
      oneShot?: boolean;
      extra?: Record<string, unknown>;
    },
  ): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
    // Resolve cwd
    const cwdResult = resolveCwd(params.cwd, params.fromSession);
    if (cwdResult.error) {
      return { content: [{ type: "text" as const, text: `Error: ${cwdResult.error}` }], isError: true };
    }
    let effectiveCwd = cwdResult.cwd;
    let worktreePath: string | undefined;

    // Create worktree if requested
    if (params.worktree) {
      if (!params.branch) {
        return { content: [{ type: "text" as const, text: "Error: 'branch' is required when worktree is true" }], isError: true };
      }
      const wtResult = createWorktree(effectiveCwd, params.branch);
      if (wtResult.error) {
        return { content: [{ type: "text" as const, text: `Error: ${wtResult.error}` }], isError: true };
      }
      worktreePath = wtResult.worktreePath;
      effectiveCwd = worktreePath;
    }

    const isOneShot = params.oneShot === true;
    const args = isOneShot
      ? agent.buildOneshotArgs(params.prompt, params.model, params.extra)
      : agent.buildInteractiveArgs(params.prompt, params.model, params.extra);

    const autoName = params.name ?? `${agent.id}: ${params.prompt.slice(0, 60)}`;
    const baseTags = [agent.tag];
    if (params.worktree && params.branch) {
      baseTags.push("worktree", `branch:${params.branch}`);
    }
    const mergedTags = params.tags
      ? [...new Set([...baseTags, ...params.tags])]
      : baseTags;

    const session = manager.create({
      command: agent.command,
      args,
      cwd: effectiveCwd,
      env: agent.env,
      name: autoName,
      tags: mergedTags,
      bufferSize: params.bufferSize,
    });

    session.preserveAfterExit();
    session.enableRespawnOnExit(getConfig().shell);

    // Interactive mode: send prompt to stdin after agent starts up
    if (!isOneShot) {
      setTimeout(() => {
        try {
          session.write(params.prompt);
          setTimeout(() => {
            try { session.write(agent.submitSequence); } catch { /* exited */ }
          }, 500);
        } catch { /* exited */ }
      }, agent.promptDelay);
    }

    const info = session.getInfo();
    const result: Record<string, unknown> = { ...info };
    if (worktreePath) {
      result.worktreePath = worktreePath;
      result.branch = params.branch;
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }

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
          command: params.command ?? getConfig().shell,
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

  // --- revive_terminal ---
  server.tool(
    "revive_terminal",
    "Recreate a previously exited terminal session with the same command, working directory, name, tags, and dimensions. The old session is removed and a fresh one is spawned.",
    {
      sessionId: z.string().describe("ID of the exited session to revive"),
      name: z.string().max(100).optional().describe("Override session name"),
    },
    async (params) => {
      try {
        const stale = manager.findExited(params.sessionId);
        if (!stale) {
          return {
            content: [{ type: "text" as const, text: `Session "${params.sessionId}" not found or still running. Only exited sessions can be revived.` }],
            isError: true,
          };
        }

        manager.removeStale(params.sessionId);

        const session = manager.create({
          command: stale.command,
          cwd: stale.cwd,
          cols: stale.cols,
          rows: stale.rows,
          name: params.name ?? stale.name,
          tags: stale.tags,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ revived: true, oldId: params.sessionId, ...session.getInfo() }, null, 2),
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

        const command = tmpl.command === "$SHELL" ? getConfig().shell : tmpl.command;

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

  // --- spawn_agent (generic) ---
  server.tool(
    "spawn_agent",
    `Spawn any registered CLI agent in a new terminal session. Available agents: ${registry.listIds().join(", ")}. Use this for agents beyond the built-in claude/codex/gemini, or as a single tool for all agents. Agent-specific params can be passed via 'extra' (e.g., maxBudget for Claude, sandbox/resume for Gemini).`,
    {
      agent: z.string().describe(`Agent ID (e.g., ${registry.listIds().map(id => `'${id}'`).join(", ")})`),
      prompt: z.string().describe("The prompt to send to the agent"),
      cwd: z.string().optional().describe("Working directory"),
      fromSession: z.string().optional().describe("Copy cwd from an existing session ID"),
      model: z.string().optional().describe("Model override"),
      name: z.string().max(100).optional().describe("Session name"),
      tags: z.array(z.string()).max(10).optional().describe("Additional tags"),
      bufferSize: z.number().int().min(1024).max(10_485_760).optional().describe("Ring buffer size in bytes"),
      worktree: z.boolean().optional().describe("Create a git worktree for isolated file changes"),
      branch: z.string().optional().describe("Branch name for the worktree"),
      oneShot: z.boolean().optional().describe("Run in one-shot mode (process prompt and exit). Default: false (interactive)"),
      extra: z.record(z.unknown()).optional().describe("Agent-specific params (e.g., { maxBudget: 5 } for Claude, { sandbox: true } for Gemini)"),
    },
    async (params) => {
      try {
        const agent = registry.getOrThrow(params.agent);
        return spawnAgentSession(agent, {
          prompt: params.prompt,
          cwd: params.cwd,
          fromSession: params.fromSession,
          model: params.model,
          name: params.name,
          tags: params.tags,
          bufferSize: params.bufferSize,
          worktree: params.worktree,
          branch: params.branch,
          oneShot: params.oneShot,
          extra: params.extra as Record<string, unknown>,
        });
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- spawn_claude (backward-compat wrapper) ---
  server.tool(
    "spawn_claude",
    "Spawn a Claude Code agent in a new terminal session. IMPORTANT: cwd must be set explicitly — there is no session inheritance. By default runs in interactive mode — the session stays alive and accepts follow-up messages via the dashboard. Use oneShot: true for autonomous --print mode. Use worktree + branch to run in an isolated git worktree.",
    {
      prompt: z.string().describe("The prompt to send to Claude"),
      cwd: z.string().optional().describe("Working directory for Claude (REQUIRED for worktrees — must point to the worktree path, not a session ID)"),
      fromSession: z.string().optional().describe("Copy cwd from an existing session ID (alternative to setting cwd manually)"),
      model: z.string().optional().describe("Model to use (e.g., 'sonnet', 'opus')"),
      name: z.string().max(100).optional().describe("Session name (default: auto-generated from prompt)"),
      tags: z.array(z.string()).max(10).optional().describe("Additional tags (claude-agent is always included)"),
      maxBudget: z.number().positive().optional().describe("Max budget in USD"),
      bufferSize: z.number().int().min(1024).max(10_485_760).optional().describe("Ring buffer size in bytes (default: from server config)"),
      worktree: z.boolean().optional().describe("Create a git worktree for this agent (isolates file changes on a separate branch)"),
      branch: z.string().optional().describe("Branch name for the worktree (required when worktree: true, e.g., 'feature/budgets')"),
      oneShot: z.boolean().optional().describe("Run in --print mode (one-shot: process prompt and exit). Default: false (interactive, session stays alive)"),
    },
    async (params) => {
      try {
        const agent = registry.getOrThrow("claude");
        return spawnAgentSession(agent, {
          ...params,
          extra: { maxBudget: params.maxBudget },
        });
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- spawn_codex (backward-compat wrapper) ---
  server.tool(
    "spawn_codex",
    "Spawn a Codex agent in a new terminal session. By default runs in interactive mode — the session stays alive and accepts follow-up messages via the dashboard. Use oneShot: true for autonomous `codex exec` mode (requires prompt).",
    {
      prompt: z.string().optional().describe("The prompt to send to Codex (required for oneShot mode)"),
      cwd: z.string().optional().describe("Working directory for Codex (REQUIRED for worktrees — must point to the worktree path, not a session ID)"),
      fromSession: z.string().optional().describe("Copy cwd from an existing session ID (alternative to setting cwd manually)"),
      model: z.string().optional().describe("Model to use"),
      name: z.string().max(100).optional().describe("Session name (default: auto-generated from prompt)"),
      tags: z.array(z.string()).max(10).optional().describe("Additional tags (codex-agent is always included)"),
      bufferSize: z.number().int().min(1024).max(10_485_760).optional().describe("Ring buffer size in bytes (default: from server config)"),
      worktree: z.boolean().optional().describe("Create a git worktree for this agent (isolates file changes on a separate branch)"),
      branch: z.string().optional().describe("Branch name for the worktree (required when worktree: true, e.g., 'feature/codex-fix')"),
      oneShot: z.boolean().optional().describe("Run in `codex exec` mode (one-shot: process prompt and exit). Requires prompt. Default: false (interactive)"),
    },
    async (params) => {
      try {
        if (params.oneShot && !params.prompt) {
          return {
            content: [{ type: "text" as const, text: "Error: 'prompt' is required when oneShot is true" }],
            isError: true,
          };
        }
        const agent = registry.getOrThrow("codex");
        const prompt = params.prompt ?? "";
        return spawnAgentSession(agent, {
          ...params,
          prompt,
          name: params.name ?? (params.prompt ? `codex: ${params.prompt.slice(0, 60)}` : "codex: interactive"),
        });
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // --- spawn_gemini (backward-compat wrapper) ---
  server.tool(
    "spawn_gemini",
    "Spawn a Gemini CLI agent in a new terminal session. By default runs in interactive mode — the session stays alive and accepts follow-up messages via the dashboard. Use oneShot: true for headless mode (requires prompt). Use resume to continue a previous Gemini session.",
    {
      prompt: z.string().optional().describe("The prompt to send to Gemini (required for oneShot mode)"),
      cwd: z.string().optional().describe("Working directory for Gemini (REQUIRED for worktrees — must point to the worktree path, not a session ID)"),
      fromSession: z.string().optional().describe("Copy cwd from an existing session ID (alternative to setting cwd manually)"),
      model: z.string().optional().describe("Model to use"),
      resume: z.union([z.string(), z.boolean()]).optional().describe("Resume a previous Gemini session. Pass true to resume the latest session (maps to --resume latest), or a session ID/index to resume a specific one (maps to gemini --resume)"),
      name: z.string().max(100).optional().describe("Session name (default: auto-generated from prompt)"),
      tags: z.array(z.string()).max(10).optional().describe("Additional tags (gemini-agent is always included)"),
      bufferSize: z.number().int().min(1024).max(10_485_760).optional().describe("Ring buffer size in bytes (default: from server config)"),
      worktree: z.boolean().optional().describe("Create a git worktree for this agent (isolates file changes on a separate branch)"),
      branch: z.string().optional().describe("Branch name for the worktree (required when worktree: true, e.g., 'feature/gemini-fix')"),
      oneShot: z.boolean().optional().describe("Run in headless mode (one-shot: process prompt and exit). Requires prompt. Default: false (interactive)"),
      sandbox: z.boolean().optional().describe("Run Gemini in sandbox mode (--sandbox)"),
    },
    async (params) => {
      try {
        if (params.oneShot && !params.prompt) {
          return {
            content: [{ type: "text" as const, text: "Error: 'prompt' is required when oneShot is true" }],
            isError: true,
          };
        }
        const agent = registry.getOrThrow("gemini");
        const prompt = params.prompt ?? "";
        const autoName = params.name ?? (params.resume ? "gemini: resumed session" : params.prompt ? `gemini: ${params.prompt.slice(0, 60)}` : "gemini: interactive");
        return spawnAgentSession(agent, {
          ...params,
          prompt,
          name: autoName,
          extra: { sandbox: params.sandbox, resume: params.resume },
        });
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
    "Send input to a terminal session. Appends newline by default. Use submit=true for Claude Code sessions (sends Escape+Enter to exit multi-line mode and submit).",
    {
      id: z.string().describe("Session ID"),
      input: z.string().describe("Text to send"),
      newline: z.boolean().optional().describe("Append newline (default: true)"),
      submit: z.boolean().optional().describe("Submit input in Claude Code sessions (sends Escape then Enter after text). Overrides newline."),
    },
    async (params) => {
      try {
        const session = manager.getOrThrow(params.id);
        let data: string;
        if (params.submit) {
          // Claude Code multi-line input: Escape exits multi-line mode, Enter submits
          data = params.input + "\x1B" + "\r";
        } else {
          data = params.newline === false ? params.input : params.input + "\n";
        }
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
  const MAX_READ_BYTES = 30_000; // 30KB cap to prevent MCP tool result token overflow

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

        const truncated = data.length > MAX_READ_BYTES;
        const finalData = truncated
          ? data.slice(data.length - MAX_READ_BYTES)
          : data;

        const result: Record<string, unknown> = {
          status: info.status,
          data: finalData,
          bytes: data.length,
        };

        if (truncated) {
          result.truncated = true;
          result.warning = `Output truncated: showing last ${MAX_READ_BYTES} of ${data.length} bytes. Use read_screen for a clean snapshot.`;
        }

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
      pattern: z.string().max(500).describe("Regex pattern to search for"),
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
    "Wait for a regex pattern to appear in terminal output, OR wait for the process to exit. Checks existing buffer/status first, then watches live. Use waitForExit: true for commands that terminate (builds, tests, installs).",
    {
      id: z.string().describe("Session ID"),
      pattern: z.string().max(500).optional().describe("Regex pattern to wait for (required unless waitForExit is true)"),
      waitForExit: z.boolean().optional().describe("Wait for the process to exit instead of matching a pattern"),
      timeout: z.number().int().min(100).max(300_000).optional().describe("Timeout in ms (default: 30000)"),
    },
    async (params, extra) => {
      let progressInterval: ReturnType<typeof setInterval> | null = null;
      try {
        if (!params.pattern && !params.waitForExit) {
          return {
            content: [{ type: "text" as const, text: "Error: Either 'pattern' or 'waitForExit: true' must be provided" }],
            isError: true,
          };
        }

        const session = manager.getOrThrow(params.id);
        const timeoutMs = params.timeout ?? 30_000;
        const start = Date.now();

        // Progress notification helper
        const progressToken = extra?._meta?.progressToken;
        let progressTick = 0;
        const progressTotal = Math.ceil(timeoutMs / 2000);
        progressInterval = progressToken ? setInterval(() => {
          progressTick++;
          void extra.sendNotification({
            method: "notifications/progress",
            params: { progressToken, progress: progressTick, total: progressTotal },
          }).catch(() => {});
        }, 2000) : null;

        // --- waitForExit mode ---
        if (params.waitForExit) {
          // Check if already exited
          if (session.status === "exited") {
            if (progressInterval) clearInterval(progressInterval);
            return {
              content: [{
                type: "text" as const,
                text: JSON.stringify({ matched: true, exitCode: session.exitCode, elapsed: 0 }, null, 2),
              }],
            };
          }

          const result = await new Promise<{ matched: boolean; exitCode?: number; reason?: string; elapsed: number }>((resolve) => {
            let settled = false;

            const cleanup = () => {
              if (settled) return;
              settled = true;
              unsubExit();
              clearTimeout(timer);
              if (progressInterval) clearInterval(progressInterval);
            };

            const unsubExit = session.onExit((_id, exitCode) => {
              if (settled) return;
              cleanup();
              resolve({ matched: true, exitCode, elapsed: Date.now() - start });
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
        }

        // --- pattern mode ---
        let regex: RegExp;
        try {
          regex = new RegExp(params.pattern!);
        } catch {
          if (progressInterval) clearInterval(progressInterval);
          return {
            content: [{ type: "text" as const, text: `Invalid regex: "${params.pattern}"` }],
            isError: true,
          };
        }

        // Check backlog first
        const backlog = session.readFullBuffer();
        const backlogMatch = backlog.match(regex);
        if (backlogMatch) {
          if (progressInterval) clearInterval(progressInterval);
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
            if (progressInterval) clearInterval(progressInterval);
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
        if (progressInterval) clearInterval(progressInterval);
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
      pattern: z.string().max(500).optional().describe("Regex pattern (required if pattern_match is in events)"),
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
            const truncated = data.length > MAX_READ_BYTES;
            const finalData = truncated
              ? data.slice(data.length - MAX_READ_BYTES)
              : data;
            const entry: Record<string, unknown> = {
              id,
              status: info.status,
              data: finalData,
              bytes: data.length,
            };
            if (truncated) {
              entry.truncated = true;
            }
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

  // --- broadcast_write ---
  server.tool(
    "broadcast_write",
    "Send the same input to multiple terminal sessions. Target sessions by IDs or tag. Returns per-session results with inline errors.",
    {
      ids: z.array(z.string()).min(1).max(20).optional().describe("Session IDs to write to"),
      tag: z.string().optional().describe("Send to all sessions matching this tag"),
      input: z.string().describe("Text to send"),
      newline: z.boolean().optional().describe("Append newline (default: true)"),
      submit: z.boolean().optional().describe("Submit input in Claude Code sessions (sends Escape then Enter after text). Overrides newline."),
    },
    async (params) => {
      if (!params.ids && !params.tag) {
        return {
          content: [{ type: "text" as const, text: "Error: must provide either 'ids' or 'tag'" }],
          isError: true,
        };
      }

      // Resolve target session IDs
      let targetIds: string[];
      if (params.ids) {
        targetIds = params.ids;
      } else {
        const sessions = manager.listByTag(params.tag!);
        targetIds = sessions.map((s) => s.id);
        if (targetIds.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No sessions found with tag '${params.tag}'` }],
          };
        }
      }

      // Build the data to write (same logic as write_terminal)
      let data: string;
      if (params.submit) {
        data = params.input + "\x1B" + "\r";
      } else {
        data = params.newline === false ? params.input : params.input + "\n";
      }

      const results: Array<Record<string, unknown>> = [];
      for (const id of targetIds) {
        try {
          const session = manager.getOrThrow(id);
          session.write(data);
          results.push({ id, success: true, bytes: data.length });
        } catch (err) {
          results.push({ id, success: false, error: (err as Error).message });
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
            version: "0.9.0",
            uptime: Math.floor((Date.now() - serverStartTime) / 1000),
            sessions: {
              active: manager.count,
              max: getConfig().maxSessions,
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

  // --- get_session_history ---
  server.tool(
    "get_session_history",
    "Get the command/tool call history for a Claude or Codex agent session. Returns timestamped tool calls.",
    {
      id: z.string().describe("Session ID"),
      limit: z.number().int().min(1).max(500).optional().describe("Max events to return (default: all)"),
    },
    async (params) => {
      try {
        let events = await manager.commandHistory.getHistory(params.id);
        if (params.limit) {
          events = events.slice(-params.limit);
        }
        return {
          content: [{
            type: "text" as const,
            text: events.length === 0
              ? "No history for this session"
              : JSON.stringify(events, null, 2),
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

  // --- run_command ---
  server.tool(
    "run_command",
    "Run a command to completion and return its output. Creates a terminal, waits for exit, returns output, and auto-cleans up. Ideal for build/test/install commands. Tip: chain commands with && (e.g., 'npm install && npm run build').",
    {
      command: z.string().describe("Command to run (e.g., 'npm', 'git', 'sh')"),
      args: z.array(z.string()).optional().describe("Command arguments (e.g., ['run', 'build'])"),
      cwd: z.string().optional().describe("Working directory"),
      env: z.record(z.string()).optional().describe("Additional environment variables"),
      name: z.string().max(100).optional().describe("Human-readable session name"),
      timeout: z.number().int().min(1000).max(300_000).optional().describe("Timeout in ms (default: 60000, max: 300000)"),
    },
    async (params) => {
      const timeoutMs = params.timeout ?? 60_000;
      const start = Date.now();
      let session: ReturnType<typeof manager.create> | undefined;

      try {
        session = manager.create({
          command: params.command,
          args: params.args,
          cwd: params.cwd,
          env: params.env,
          name: params.name ?? `run: ${params.command}${params.args ? " " + params.args.join(" ") : ""}`.slice(0, 100),
          tags: ["run-command"],
        });

        const sessionId = session.id;

        // Wait for exit or timeout
        const exitResult = await new Promise<{ exited: boolean; exitCode?: number }>((resolve) => {
          let settled = false;

          const cleanup = () => {
            if (settled) return;
            settled = true;
            unsubExit();
            clearTimeout(timer);
          };

          // Check if already exited (fast commands)
          if (session!.status === "exited") {
            resolve({ exited: true, exitCode: session!.exitCode });
            return;
          }

          const unsubExit = session!.onExit((_id, exitCode) => {
            if (settled) return;
            cleanup();
            resolve({ exited: true, exitCode });
          });

          const timer = setTimeout(() => {
            if (settled) return;
            cleanup();
            resolve({ exited: false });
          }, timeoutMs);
        });

        const output = session.readFullBuffer();
        const duration = Date.now() - start;

        // Truncate output at ~100KB to save tokens
        const MAX_OUTPUT = 102_400;
        const truncated = output.length > MAX_OUTPUT;
        const finalOutput = truncated
          ? output.slice(0, MAX_OUTPUT) + `\n\n--- OUTPUT TRUNCATED (${output.length} bytes total, showing first ${MAX_OUTPUT}) ---`
          : output;

        if (!exitResult.exited) {
          // Timeout — keep session alive for inspection
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                exitCode: null,
                output: finalOutput,
                duration,
                sessionId,
                timeout: true,
                message: `Command did not exit within ${timeoutMs}ms. Session kept alive for inspection — use read_terminal/close_terminal with sessionId.`,
              }, null, 2),
            }],
            isError: true,
          };
        }

        // Success — auto-cleanup
        try {
          manager.close(sessionId);
        } catch {
          // Already closed/cleaned up
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              exitCode: exitResult.exitCode,
              output: finalOutput,
              duration,
              sessionId,
            }, null, 2),
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

  // --- delegate_task ---

  /**
   * Wait for an agent to finish its current turn (interactive mode).
   *
   * Agent-agnostic detection strategy (works for any CLI agent):
   * 1. **Explicit signal** — Codex emits `turn.completed` in JSONL stream (instant detection)
   * 2. **Output quiet period** — After receiving output, if terminal goes silent for N seconds,
   *    the turn is considered done. This is the universal fallback that works for Claude, Codex,
   *    or any future agent without agent-specific hacks.
   * 3. **Process exit** — Agent exited (one-shot finished, crash, etc.)
   *
   * The quiet period is configurable (default 5s) — short enough to be responsive,
   * long enough to avoid false positives during tool execution pauses.
   */
  function getFilesChanged(wtPath: string, baseSha?: string): string[] | undefined {
    try {
      const diff = execFileSync("git", ["diff", "--name-only", "HEAD"], {
        cwd: wtPath, encoding: "utf-8", stdio: "pipe",
      }).trim();
      const staged = execFileSync("git", ["diff", "--name-only", "--cached", "HEAD"], {
        cwd: wtPath, encoding: "utf-8", stdio: "pipe",
      }).trim();
      const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
        cwd: wtPath, encoding: "utf-8", stdio: "pipe",
      }).trim();
      const parts = [diff, staged, untracked];
      if (baseSha) {
        const committed = execFileSync("git", ["diff", "--name-only", `${baseSha}...HEAD`], {
          cwd: wtPath, encoding: "utf-8", stdio: "pipe",
        }).trim();
        parts.push(committed);
      }
      const all = [...new Set(parts.flatMap(p => p.split("\n")).filter(Boolean))];
      if (all.length > 0) return all;
    } catch { /* ignore git errors */ }
    return undefined;
  }

  function waitForTurnCompletion(
    session: ReturnType<typeof manager.create>,
    agentId: string,
    timeoutMs: number,
    quietPeriodMs = 5_000,
  ): Promise<{ reason: "turn_complete" | "exited" | "timeout"; exitCode?: number }> {
    const agent = registry.get(agentId);
    const turnPattern = agent?.turnCompletePattern;

    return new Promise((resolve) => {
      let settled = false;
      let hasOutput = false;
      let quietTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanups: Array<() => void> = [];
      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (quietTimer) clearTimeout(quietTimer);
        clearTimeout(hardTimer);
        for (const fn of cleanups) fn();
      };

      // Already exited?
      if (session.status === "exited") {
        resolve({ reason: "exited", exitCode: session.exitCode });
        return;
      }

      // Watch for exit
      const unsubExit = session.onExit((_id, exitCode) => {
        if (settled) return;
        cleanup();
        resolve({ reason: "exited", exitCode });
      });
      cleanups.push(unsubExit);

      // Watch output for explicit signals or quiet period
      const unsubData = session.onData((data: string) => {
        if (settled) return;
        hasOutput = true;

        // Agent-specific turn completion signal (e.g., Codex's "turn.completed")
        if (turnPattern && turnPattern.test(data)) {
          cleanup();
          resolve({ reason: "turn_complete" });
          return;
        }

        // Universal: reset quiet timer on every output chunk
        // When output stops flowing for quietPeriodMs, the turn is done
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(() => {
          if (settled || !hasOutput) return;
          cleanup();
          resolve({ reason: "turn_complete" });
        }, quietPeriodMs);
      });
      cleanups.push(unsubData);

      // Hard timeout
      const hardTimer = setTimeout(() => {
        if (settled) return;
        cleanup();
        resolve({ reason: "timeout" });
      }, timeoutMs);
    });
  }

  server.tool(
    "delegate_task",
    "Delegate a task to another AI agent (Claude, Codex, or Gemini). Supports two modes:\n" +
    "- **oneshot** (default): Agent processes the prompt and exits. Output returned directly.\n" +
    "- **interactive**: Agent stays alive between turns. Use `sessionId` for follow-up messages to review, push back, or guide the agent's work.\n\n" +
    "For interactive multi-turn conversations, the first call spawns the agent and returns a sessionId. " +
    "Subsequent calls with that sessionId send follow-up messages. Use `from` to label which orchestrator is speaking.",
    {
      agent: z.string().describe(`Which agent to delegate to: ${registry.listIds().join(", ")} (required for first call, ignored on follow-ups)`).optional(),
      prompt: z.string().describe("The task prompt or follow-up message to send to the agent"),
      mode: z.enum(["oneshot", "interactive"]).optional().describe("Delegation mode: 'oneshot' (default) runs to completion, 'interactive' keeps agent alive for multi-turn conversation"),
      sessionId: z.string().optional().describe("Session ID from a previous interactive delegate_task call — sends a follow-up message to that agent"),
      from: z.string().optional().describe("Orchestrator label (e.g., 'opus 4.6', 'gpt-codex4.5') — prefixed to the prompt so the delegate knows who is speaking"),
      cwd: z.string().optional().describe("Working directory for the agent"),
      timeout: z.number().int().min(10_000).max(600_000).optional().describe("Timeout in ms (default: 300000 / 5 min, max: 600000 / 10 min)"),
      model: z.string().optional().describe("Model override (e.g., 'sonnet', 'opus', 'o3')"),
      maxBudget: z.number().optional().describe("Max budget in USD (Claude only)"),
      worktree: z.boolean().optional().describe("Create a git worktree for isolated file changes"),
      branch: z.string().optional().describe("Branch name for the worktree (required when worktree: true)"),
    },
    async (params, extra) => {
      const timeoutMs = params.timeout ?? 300_000;
      const start = Date.now();
      const isInteractive = params.mode === "interactive";

      // Progress notification helper
      const progressToken = extra?._meta?.progressToken;
      let progressTick = 0;
      const progressTotal = Math.ceil(timeoutMs / 2000);
      let activeProgressInterval: ReturnType<typeof setInterval> | null = null;
      const startProgress = () => {
        if (!progressToken) return null;
        progressTick = 0;
        const interval = setInterval(() => {
          progressTick++;
          void extra.sendNotification({
            method: "notifications/progress",
            params: { progressToken, progress: progressTick, total: progressTotal },
          }).catch(() => {});
        }, 2000);
        activeProgressInterval = interval;
        return interval;
      };

      // Format prompt with orchestrator attribution
      const formattedPrompt = params.from
        ? `${params.from}: ${params.prompt}`
        : params.prompt;

      try {
        // ─── Follow-up to existing interactive session ───
        if (params.sessionId) {
          const session = manager.get(params.sessionId);
          if (!session) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ status: "error", message: `Session "${params.sessionId}" not found. It may have exited or been closed.` }) }],
              isError: true,
            };
          }

          if (session.status === "exited") {
            const rawOutput = session.readFullBuffer();
            return {
              content: [{
                type: "text" as const,
                text: JSON.stringify({
                  status: "exited",
                  exitCode: session.exitCode,
                  output: rawOutput.slice(-102_400),
                  sessionId: params.sessionId,
                  message: "Agent has already exited. Use a new delegate_task call to spawn a fresh agent.",
                }, null, 2),
              }],
              isError: true,
            };
          }

          // Determine agent type from session tags
          const info = session.getInfo();
          const agentType = registry.resolveAgentFromTags(info.tags) ?? "claude";

          // Record buffer position before sending, so we capture only the new output
          const bufferBefore = session.readFullBuffer();

          // Send the follow-up message to the agent's TUI input.
          // We send text first, then wait for the paste burst window to close (~300ms),
          // then submit with agent-specific sequence (e.g., Escape+Enter for Claude).
          const agentDef = registry.get(agentType);
          const submitSeq = agentDef?.submitSequence ?? "\r";
          session.write(formattedPrompt);
          await new Promise<void>((resolve) => setTimeout(resolve, 500));
          session.write(submitSeq);

          // Wait for the agent to finish its turn
          const followUpProgressInterval = startProgress();
          const turnResult = await waitForTurnCompletion(session, agentType, timeoutMs);
          if (followUpProgressInterval) clearInterval(followUpProgressInterval);
          const duration = Date.now() - start;

          const rawOutput = session.readFullBuffer();
          // Extract only the NEW output since we sent the message
          const newOutput = rawOutput.slice(bufferBefore.length);
          const MAX_OUTPUT = 102_400;
          const output = newOutput.length > MAX_OUTPUT
            ? newOutput.slice(0, MAX_OUTPUT) + `\n\n--- OUTPUT TRUNCATED (${newOutput.length} bytes total, showing first ${MAX_OUTPUT}) ---`
            : newOutput;

          if (turnResult.reason === "exited") {
            const followUpWorktree = info.tags?.includes("worktree") ? info.cwd : undefined;
            const followUpBaseSha = info.tags?.find(t => t.startsWith("base:"))?.slice(5);
            const filesChanged = followUpWorktree ? getFilesChanged(followUpWorktree, followUpBaseSha) : undefined;
            return {
              content: [{
                type: "text" as const,
                text: JSON.stringify({
                  status: turnResult.exitCode === 0 ? "completed" : "failed",
                  agent: agentType,
                  exitCode: turnResult.exitCode,
                  output,
                  duration,
                  sessionId: params.sessionId,
                  worktreePath: followUpWorktree,
                  filesChanged,
                }, null, 2),
              }],
            };
          }

          if (turnResult.reason === "timeout") {
            return {
              content: [{
                type: "text" as const,
                text: JSON.stringify({
                  status: "timeout",
                  agent: agentType,
                  output,
                  duration,
                  sessionId: params.sessionId,
                  message: `Agent did not finish turn within ${timeoutMs}ms. Session still alive — retry or use read_terminal to check progress.`,
                }, null, 2),
              }],
              isError: true,
            };
          }

          // turn_complete — agent is waiting for next input
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                status: "awaiting_followup",
                agent: agentType,
                output,
                duration,
                sessionId: params.sessionId,
                message: "Agent finished its turn and is waiting for your next message. Send another delegate_task with this sessionId to continue, or close_terminal to end.",
              }, null, 2),
            }],
          };
        }

        // ─── First call — spawn a new agent ───
        if (!params.agent) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ status: "error", message: "'agent' is required when spawning a new delegate (no sessionId provided)" }) }],
            isError: true,
          };
        }

        // Resolve agent from registry
        const agentDef = registry.get(params.agent);
        if (!agentDef) {
          const available = registry.listIds().join(", ");
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ status: "error", message: `Unknown agent "${params.agent}". Available: ${available}` }) }],
            isError: true,
          };
        }

        let session: ReturnType<typeof manager.create> | undefined;
        let effectiveCwd = params.cwd;
        let worktreePath: string | undefined;

        // Create git worktree if requested
        if (params.worktree) {
          if (!params.branch) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ status: "error", message: "'branch' is required when worktree is true" }) }],
              isError: true,
            };
          }

          const wtResult = createWorktree(effectiveCwd, params.branch);
          if (wtResult.error) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ status: "error", message: wtResult.error }) }],
              isError: true,
            };
          }
          worktreePath = wtResult.worktreePath;
          effectiveCwd = worktreePath;
        }

        // Capture base SHA for worktree diff (before agent makes changes)
        let baseSha: string | undefined;
        if (worktreePath) {
          try {
            baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
              cwd: worktreePath, encoding: "utf-8", stdio: "pipe",
            }).trim();
          } catch { /* ignore */ }
        }

        // Build agent command and args using registry
        const command = agentDef.command;
        const args: string[] = [];
        const agentTag = agentDef.tag;

        // Build args using agent registry (handles agent-specific flags/patterns)
        const delegateExtra: Record<string, unknown> = {};
        if (params.maxBudget) delegateExtra.maxBudget = params.maxBudget;

        if (isInteractive) {
          // Interactive mode: build agent-specific interactive args + positional prompt
          args.push(...agentDef.buildInteractiveArgs(formattedPrompt, params.model, delegateExtra));
          // Push prompt as positional argument — `claude "prompt"`, `codex "prompt"`, and `gemini "prompt"` all work
          args.push(formattedPrompt);
        } else {
          // Oneshot mode: use agent-specific oneshot args
          // For delegate_task oneshot, Claude uses --output-format text instead of stream-json
          if (agentDef.id === "claude") {
            args.push("--print", "--output-format", "text", "--verbose", formattedPrompt);
            const m = params.model ?? agentDef.defaultModel;
            if (m) args.push("--model", m);
            if (params.maxBudget) args.push("--max-budget-usd", String(params.maxBudget));
          } else {
            args.push(...agentDef.buildOneshotArgs(formattedPrompt, params.model, delegateExtra));
          }
        }

        const taskLabel = params.prompt.slice(0, 60);
        const modeLabel = isInteractive ? "interactive" : "oneshot";
        const tags = ["delegate-task", agentTag, `mode:${modeLabel}`];
        if (worktreePath && params.branch) {
          tags.push("worktree", `branch:${params.branch}`);
          if (baseSha) tags.push(`base:${baseSha}`);
        }

        session = manager.create({
          command,
          args,
          cwd: effectiveCwd,
          name: `delegate(${params.agent}): ${taskLabel}`,
          tags,
          bufferSize: 2_097_152, // 2MB buffer for delegate tasks
        });

        session.preserveAfterExit();
        // No respawn for delegate_task — these are programmatic agent sessions,
        // not interactive terminals where a user needs a shell restored.
        const sessionId = session.id;

        if (isInteractive) {
          // Prompt was passed as CLI arg — agent starts processing immediately.
          // Wait for the agent to finish its turn.
          const interactiveProgressInterval = startProgress();
          const turnResult = await waitForTurnCompletion(session, params.agent, timeoutMs);
          if (interactiveProgressInterval) clearInterval(interactiveProgressInterval);
          const duration = Date.now() - start;

          const rawOutput = session.readFullBuffer();
          const MAX_OUTPUT = 102_400;
          const output = rawOutput.length > MAX_OUTPUT
            ? rawOutput.slice(0, MAX_OUTPUT) + `\n\n--- OUTPUT TRUNCATED (${rawOutput.length} bytes total, showing first ${MAX_OUTPUT}) ---`
            : rawOutput;

          if (turnResult.reason === "exited") {
            const filesChanged = worktreePath ? getFilesChanged(worktreePath, baseSha) : undefined;
            return {
              content: [{
                type: "text" as const,
                text: JSON.stringify({
                  status: turnResult.exitCode === 0 ? "completed" : "failed",
                  agent: params.agent,
                  exitCode: turnResult.exitCode,
                  output,
                  duration,
                  sessionId,
                  worktreePath: worktreePath || undefined,
                  filesChanged,
                }, null, 2),
              }],
            };
          }

          if (turnResult.reason === "timeout") {
            return {
              content: [{
                type: "text" as const,
                text: JSON.stringify({
                  status: "timeout",
                  agent: params.agent,
                  output,
                  duration,
                  sessionId,
                  worktreePath: worktreePath || undefined,
                  message: `Agent did not finish turn within ${timeoutMs}ms. Session still alive — use read_terminal to check progress or send another follow-up.`,
                }, null, 2),
              }],
              isError: true,
            };
          }

          // turn_complete — agent is waiting for next input
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                status: "awaiting_followup",
                agent: params.agent,
                output,
                duration,
                sessionId,
                worktreePath: worktreePath || undefined,
                message: "Agent finished its turn and is waiting for your next message. Send another delegate_task with this sessionId to continue, or close_terminal to end.",
              }, null, 2),
            }],
          };
        }

        // ─── Oneshot mode: wait for process exit ───
        const oneshotProgressInterval = startProgress();
        const exitResult = await new Promise<{ exited: boolean; exitCode?: number }>((resolve) => {
          let settled = false;

          const cleanup = () => {
            if (settled) return;
            settled = true;
            unsubExit();
            clearTimeout(timer);
            if (oneshotProgressInterval) clearInterval(oneshotProgressInterval);
          };

          if (session!.status === "exited") {
            cleanup();
            resolve({ exited: true, exitCode: session!.exitCode });
            return;
          }

          const unsubExit = session!.onExit((_id, exitCode) => {
            if (settled) return;
            cleanup();
            resolve({ exited: true, exitCode });
          });

          const timer = setTimeout(() => {
            if (settled) return;
            cleanup();
            resolve({ exited: false });
          }, timeoutMs);
        });

        const rawOutput = session.readFullBuffer();
        const duration = Date.now() - start;

        // Truncate output at ~100KB
        const MAX_OUTPUT = 102_400;
        const truncated = rawOutput.length > MAX_OUTPUT;
        const output = truncated
          ? rawOutput.slice(0, MAX_OUTPUT) + `\n\n--- OUTPUT TRUNCATED (${rawOutput.length} bytes total, showing first ${MAX_OUTPUT}) ---`
          : rawOutput;

        if (!exitResult.exited) {
          // Timeout — keep session alive for inspection
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                status: "timeout",
                agent: params.agent,
                exitCode: null,
                output,
                duration,
                sessionId,
                worktreePath: worktreePath || undefined,
                message: `Agent did not complete within ${timeoutMs}ms. Session kept alive — use read_terminal/close_terminal with sessionId.`,
              }, null, 2),
            }],
            isError: true,
          };
        }

        // Completed — keep session visible (preserveAfterExit already set)
        const filesChanged = worktreePath ? getFilesChanged(worktreePath, baseSha) : undefined;
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              status: exitResult.exitCode === 0 ? "completed" : "failed",
              agent: params.agent,
              exitCode: exitResult.exitCode,
              output,
              duration,
              sessionId,
              worktreePath: worktreePath || undefined,
              filesChanged,
            }, null, 2),
          }],
        };
      } catch (err) {
        if (activeProgressInterval) clearInterval(activeProgressInterval);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ status: "error", message: (err as Error).message }) }],
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

  return { server, manager, registry };
}
