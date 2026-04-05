/**
 * Extensible Agent Registry
 *
 * Provides a config-driven registry of CLI agents that can be spawned as
 * terminal sessions. Built-in agents (claude, codex, gemini) are defined
 * here with their specific behaviors. Custom agents can be added via
 * ~/.forge/settings.json without code changes.
 */

import type { ForgeConfig } from "./types.js";
import { logger } from "../utils/logger.js";

// ─── Custom agent config (JSON-serializable, for settings.json) ──

export interface CustomAgentConfig {
  /** CLI binary name or path (e.g., "aider", "/usr/local/bin/my-agent") */
  command: string;
  /** Human-readable name (e.g., "Aider"). Defaults to id. */
  name?: string;
  /** Session tag (e.g., "aider-agent"). Defaults to "{id}-agent". */
  tag?: string;
  /** Args template for oneshot mode. Use "{prompt}" as placeholder. */
  oneshotArgs?: string[];
  /** Args template for interactive mode. Use "{prompt}" as placeholder. */
  interactiveArgs?: string[];
  /** Flag to pass model (e.g., "--model"). Omit if agent doesn't support models. */
  modelFlag?: string;
  /** Default model to use when none specified. */
  defaultModel?: string;
  /** How to submit input: "enter" (default) or "escape-enter" (for Claude Code TUI). */
  submitKey?: "enter" | "escape-enter";
  /** Regex pattern that signals turn completion in output (e.g., Codex's "turn.completed"). */
  turnCompletePattern?: string;
  /** Delay in ms before writing prompt to stdin in interactive mode (default: 2000). */
  promptDelay?: number;
  /** Additional environment variables to set when spawning. */
  env?: Record<string, string>;
}

// ─── Runtime agent definition (resolved from built-in + config) ──

export interface AgentDefinition {
  /** Unique agent identifier (e.g., "claude", "codex", "aider") */
  id: string;
  /** Human-readable name */
  name: string;
  /** CLI command to execute */
  command: string;
  /** Session tag for identification */
  tag: string;
  /** Default model */
  defaultModel?: string;

  /** Build CLI args for oneshot mode */
  buildOneshotArgs(prompt: string, model?: string, extra?: Record<string, unknown>): string[];
  /** Build CLI args for interactive mode */
  buildInteractiveArgs(prompt: string, model?: string, extra?: Record<string, unknown>): string[];
  /** Sequence to send to submit input (e.g., "\r" or "\x1B\r") */
  submitSequence: string;
  /** Delay in ms before writing prompt to stdin (default: 2000) */
  promptDelay: number;
  /** Regex pattern for turn completion detection */
  turnCompletePattern?: RegExp;
  /** Additional environment variables */
  env?: Record<string, string>;
}

// ─── Built-in agent definitions ──────────────────────────────────

function builtinClaude(config: ForgeConfig): AgentDefinition {
  return {
    id: "claude",
    name: "Claude Code",
    command: config.claudePath,
    tag: "claude-agent",
    defaultModel: config.claudeDefaultModel,
    submitSequence: "\x1B\r", // Escape + Enter for Claude's TUI
    promptDelay: 2000,

    buildOneshotArgs(prompt, model, extra) {
      const args = ["--print", "--output-format", "stream-json", "--verbose", prompt];
      const m = model ?? config.claudeDefaultModel;
      if (m) args.push("--model", m);
      if (extra?.maxBudget) args.push("--max-budget-usd", String(extra.maxBudget));
      return args;
    },

    buildInteractiveArgs(_prompt, model, extra) {
      const args: string[] = [];
      const m = model ?? config.claudeDefaultModel;
      if (m) args.push("--model", m);
      if (extra?.maxBudget) args.push("--max-budget-usd", String(extra.maxBudget));
      return args;
    },
  };
}

function builtinCodex(config: ForgeConfig): AgentDefinition {
  return {
    id: "codex",
    name: "Codex CLI",
    command: config.codexPath,
    tag: "codex-agent",
    defaultModel: config.codexDefaultModel,
    submitSequence: "\r",
    promptDelay: 2000,
    turnCompletePattern: /"turn\.completed"/,

    buildOneshotArgs(prompt, model) {
      const args = ["exec", prompt];
      const m = model ?? config.codexDefaultModel;
      if (m) args.push("--model", m);
      return args;
    },

    buildInteractiveArgs(_prompt, model) {
      const args: string[] = [];
      const m = model ?? config.codexDefaultModel;
      if (m) args.push("--model", m);
      return args;
    },
  };
}

function builtinGemini(config: ForgeConfig): AgentDefinition {
  return {
    id: "gemini",
    name: "Gemini CLI",
    command: config.geminiPath,
    tag: "gemini-agent",
    defaultModel: config.geminiDefaultModel,
    submitSequence: "\r",
    promptDelay: 2000,

    buildOneshotArgs(prompt, model, extra) {
      const args = ["-p", prompt];
      const m = model ?? config.geminiDefaultModel;
      if (m) args.push("--model", m);
      if (extra?.sandbox) args.push("--sandbox");
      return args;
    },

    buildInteractiveArgs(_prompt, model, extra) {
      const args: string[] = [];
      const m = model ?? config.geminiDefaultModel;
      if (m) args.push("--model", m);
      if (extra?.sandbox) args.push("--sandbox");
      if (extra?.resume) {
        if (typeof extra.resume === "string") {
          args.push("--resume", extra.resume);
        } else {
          args.push("--resume", "latest");
        }
      }
      return args;
    },
  };
}

// ─── Custom agent → AgentDefinition converter ────────────────────

function customToDefinition(id: string, custom: CustomAgentConfig): AgentDefinition {
  const submitSequence = custom.submitKey === "escape-enter" ? "\x1B\r" : "\r";
  const turnCompletePattern = custom.turnCompletePattern
    ? new RegExp(custom.turnCompletePattern)
    : undefined;

  function expandArgs(templates: string[] | undefined, prompt: string, model?: string): string[] {
    const args: string[] = [];
    if (templates) {
      for (const t of templates) {
        args.push(t.replace(/\{prompt\}/g, prompt));
      }
    }
    if (model && custom.modelFlag) {
      args.push(custom.modelFlag, model);
    }
    return args;
  }

  return {
    id,
    name: custom.name ?? id,
    command: custom.command,
    tag: custom.tag ?? `${id}-agent`,
    defaultModel: custom.defaultModel,
    submitSequence,
    promptDelay: custom.promptDelay ?? 2000,
    turnCompletePattern,
    env: custom.env,

    buildOneshotArgs(prompt, model) {
      return expandArgs(custom.oneshotArgs, prompt, model ?? custom.defaultModel);
    },

    buildInteractiveArgs(prompt, model) {
      return expandArgs(custom.interactiveArgs, prompt, model ?? custom.defaultModel);
    },
  };
}

// ─── Agent Registry ──────────────────────────────────────────────

export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();

  constructor(config: ForgeConfig) {
    this.rebuild(config);
  }

  /** Rebuild the registry from config (called on config reload). */
  rebuild(config: ForgeConfig): void {
    this.agents.clear();

    // Built-in agents
    this.agents.set("claude", builtinClaude(config));
    this.agents.set("codex", builtinCodex(config));
    this.agents.set("gemini", builtinGemini(config));

    // Custom agents from config
    if (config.agents) {
      for (const [id, custom] of Object.entries(config.agents)) {
        if (this.agents.has(id)) {
          logger.warn(`Custom agent "${id}" overrides built-in agent`);
        }
        this.agents.set(id, customToDefinition(id, custom));
      }
    }
  }

  /** Get an agent by ID. Returns undefined if not found. */
  get(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  /** Get an agent by ID, throwing if not found. */
  getOrThrow(id: string): AgentDefinition {
    const agent = this.agents.get(id);
    if (!agent) {
      const available = this.listIds().join(", ");
      throw new Error(`Unknown agent "${id}". Available: ${available}`);
    }
    return agent;
  }

  /** List all registered agent IDs. */
  listIds(): string[] {
    return [...this.agents.keys()];
  }

  /** List all registered agent definitions. */
  list(): AgentDefinition[] {
    return [...this.agents.values()];
  }

  /** Check if an agent is registered. */
  has(id: string): boolean {
    return this.agents.has(id);
  }

  /** Resolve the agent tag from session tags. Returns the agent ID or undefined. */
  resolveAgentFromTags(tags?: string[]): string | undefined {
    if (!tags) return undefined;
    for (const agent of this.agents.values()) {
      if (tags.includes(agent.tag)) return agent.id;
    }
    return undefined;
  }
}
