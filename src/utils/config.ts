import { readFileSync, writeFileSync, mkdirSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { EventEmitter } from "node:events";
import { DEFAULT_CONFIG, type ForgeConfig } from "../core/types.js";
import { logger } from "./logger.js";

let SETTINGS_FILE = join(homedir(), ".forge", "settings.json");

/** Override the settings file path (for testing). */
export function _setSettingsPath(p: string): void { SETTINGS_FILE = p; }
/** Reset to the default settings file path (for testing). */
export function _resetSettingsPath(): void { SETTINGS_FILE = join(homedir(), ".forge", "settings.json"); }

// ─── Arg/env helpers ────────────────────────────────────────

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

// ─── Parse partial overrides from CLI args ──────────────────

function parseCli(argv: string[]): Partial<ForgeConfig> {
  const result: Partial<ForgeConfig> = {};
  const v = intArg(argv, "--max-sessions");   if (v !== undefined) result.maxSessions = v;
  const it = intArg(argv, "--idle-timeout");   if (it !== undefined) result.idleTimeout = it;
  const bs = intArg(argv, "--buffer-size");    if (bs !== undefined) result.bufferSize = bs;
  const d = boolArg(argv, "--dashboard");      if (d !== undefined) result.dashboard = d;
  const dp = intArg(argv, "--port");           if (dp !== undefined) result.dashboardPort = dp;
  const sh = strArg(argv, "--shell");          if (sh !== undefined) result.shell = sh;
  const cp = strArg(argv, "--claude-path");    if (cp !== undefined) result.claudePath = cp;
  const cx = strArg(argv, "--codex-path");     if (cx !== undefined) result.codexPath = cx;
  const gp = strArg(argv, "--gemini-path");   if (gp !== undefined) result.geminiPath = gp;
  const cdm = strArg(argv, "--claude-default-model"); if (cdm !== undefined) result.claudeDefaultModel = cdm;
  const xdm = strArg(argv, "--codex-default-model");  if (xdm !== undefined) result.codexDefaultModel = xdm;
  const gdm = strArg(argv, "--gemini-default-model");  if (gdm !== undefined) result.geminiDefaultModel = gdm;
  const at = strArg(argv, "--auth-token");     if (at !== undefined) result.authToken = at;
  const et = intArg(argv, "--exited-ttl");     if (et !== undefined) result.exitedTtl = et;
  const wp = strArg(argv, "--whisper-path");   if (wp !== undefined) result.whisperPath = wp;
  const wm = strArg(argv, "--whisper-model-path");  if (wm !== undefined) result.whisperModelPath = wm;
  return result;
}

// ─── Parse partial overrides from env vars ──────────────────

function parseEnv(): Partial<ForgeConfig> {
  const result: Partial<ForgeConfig> = {};
  const ms = envInt("FORGE_MAX_SESSIONS");     if (ms !== undefined) result.maxSessions = ms;
  const it = envInt("FORGE_IDLE_TIMEOUT");     if (it !== undefined) result.idleTimeout = it;
  const bs = envInt("FORGE_BUFFER_SIZE");      if (bs !== undefined) result.bufferSize = bs;
  const d = envBool("FORGE_DASHBOARD");        if (d !== undefined) result.dashboard = d;
  const dp = envInt("FORGE_DASHBOARD_PORT");   if (dp !== undefined) result.dashboardPort = dp;
  if (process.env.SHELL) result.shell = process.env.SHELL;
  if (process.env.FORGE_CLAUDE_PATH) result.claudePath = process.env.FORGE_CLAUDE_PATH;
  if (process.env.FORGE_CODEX_PATH) result.codexPath = process.env.FORGE_CODEX_PATH;
  if (process.env.FORGE_GEMINI_PATH) result.geminiPath = process.env.FORGE_GEMINI_PATH;
  if (process.env.FORGE_CLAUDE_DEFAULT_MODEL) result.claudeDefaultModel = process.env.FORGE_CLAUDE_DEFAULT_MODEL;
  if (process.env.FORGE_CODEX_DEFAULT_MODEL) result.codexDefaultModel = process.env.FORGE_CODEX_DEFAULT_MODEL;
  if (process.env.FORGE_GEMINI_DEFAULT_MODEL) result.geminiDefaultModel = process.env.FORGE_GEMINI_DEFAULT_MODEL;
  if (process.env.FORGE_AUTH_TOKEN) result.authToken = process.env.FORGE_AUTH_TOKEN;
  const et = envInt("FORGE_EXITED_TTL");       if (et !== undefined) result.exitedTtl = et;
  if (process.env.FORGE_WHISPER_PATH) result.whisperPath = process.env.FORGE_WHISPER_PATH;
  if (process.env.FORGE_WHISPER_MODEL_PATH) result.whisperModelPath = process.env.FORGE_WHISPER_MODEL_PATH;
  return result;
}

// ─── Load settings from ~/.forge/settings.json ──────────────

export function loadSettingsFile(): Partial<ForgeConfig> {
  try {
    const raw = readFileSync(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    const result: Partial<ForgeConfig> = {};
    if (typeof parsed.maxSessions === "number" && parsed.maxSessions > 0) result.maxSessions = parsed.maxSessions;
    if (typeof parsed.idleTimeout === "number" && parsed.idleTimeout >= 0) result.idleTimeout = parsed.idleTimeout;
    if (typeof parsed.bufferSize === "number" && parsed.bufferSize >= 1024) result.bufferSize = parsed.bufferSize;
    if (typeof parsed.dashboard === "boolean") result.dashboard = parsed.dashboard;
    if (typeof parsed.dashboardPort === "number" && parsed.dashboardPort > 0) result.dashboardPort = parsed.dashboardPort;
    if (typeof parsed.shell === "string" && parsed.shell) result.shell = parsed.shell;
    if (typeof parsed.claudePath === "string" && parsed.claudePath) result.claudePath = parsed.claudePath;
    if (typeof parsed.codexPath === "string" && parsed.codexPath) result.codexPath = parsed.codexPath;
    if (typeof parsed.geminiPath === "string" && parsed.geminiPath) result.geminiPath = parsed.geminiPath;
    if (typeof parsed.claudeDefaultModel === "string" && parsed.claudeDefaultModel) result.claudeDefaultModel = parsed.claudeDefaultModel;
    if (typeof parsed.codexDefaultModel === "string" && parsed.codexDefaultModel) result.codexDefaultModel = parsed.codexDefaultModel;
    if (typeof parsed.geminiDefaultModel === "string" && parsed.geminiDefaultModel) result.geminiDefaultModel = parsed.geminiDefaultModel;
    if (typeof parsed.authToken === "string") result.authToken = parsed.authToken;
    if (typeof parsed.exitedTtl === "number" && parsed.exitedTtl >= 0) result.exitedTtl = parsed.exitedTtl;
    if (parsed.agents && typeof parsed.agents === "object" && !Array.isArray(parsed.agents)) {
      result.agents = parseAgentsConfig(parsed.agents);
    }
    if (typeof parsed.whisperPath === "string" && parsed.whisperPath) result.whisperPath = parsed.whisperPath;
    if (typeof parsed.whisperModelPath === "string" && parsed.whisperModelPath) result.whisperModelPath = parsed.whisperModelPath;
    return result;
  } catch {
    return {};
  }
}

export function saveSettingsFile(settings: Partial<ForgeConfig>): void {
  mkdirSync(join(homedir(), ".forge"), { recursive: true });
  // Merge with existing file contents so we don't lose unknown keys
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    // file doesn't exist or invalid — start fresh
  }
  const merged = { ...existing, ...settings };
  writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2) + "\n", "utf-8");
}

// ─── Agent config parser ────────────────────────────────────

import type { CustomAgentConfig } from "../core/agent-registry.js";

export function parseAgentsConfig(raw: Record<string, unknown>): Record<string, CustomAgentConfig> | undefined {
  const agents: Record<string, CustomAgentConfig> = {};
  for (const [id, val] of Object.entries(raw)) {
    if (!val || typeof val !== "object") continue;
    const v = val as Record<string, unknown>;
    if (typeof v.command !== "string" || !v.command) continue;
    const agent: CustomAgentConfig = { command: v.command };
    if (typeof v.name === "string") agent.name = v.name;
    if (typeof v.tag === "string") agent.tag = v.tag;
    if (Array.isArray(v.oneshotArgs)) agent.oneshotArgs = v.oneshotArgs.filter((a): a is string => typeof a === "string");
    if (Array.isArray(v.interactiveArgs)) agent.interactiveArgs = v.interactiveArgs.filter((a): a is string => typeof a === "string");
    if (typeof v.modelFlag === "string") agent.modelFlag = v.modelFlag;
    if (typeof v.defaultModel === "string") agent.defaultModel = v.defaultModel;
    if (v.submitKey === "enter" || v.submitKey === "escape-enter") agent.submitKey = v.submitKey;
    if (typeof v.turnCompletePattern === "string") {
      try {
        new RegExp(v.turnCompletePattern);
        agent.turnCompletePattern = v.turnCompletePattern;
      } catch {
        logger.warn(`Agent "${id}": invalid turnCompletePattern regex "${v.turnCompletePattern}", ignoring`);
      }
    }
    if (typeof v.promptDelay === "number") agent.promptDelay = v.promptDelay;
    if (v.env && typeof v.env === "object" && !Array.isArray(v.env)) {
      agent.env = Object.fromEntries(
        Object.entries(v.env).filter(([, ev]) => typeof ev === "string"),
      ) as Record<string, string>;
    }
    agents[id] = agent;
  }
  return Object.keys(agents).length > 0 ? agents : undefined;
}

// ─── Merge helper ───────────────────────────────────────────

function merge(cli: Partial<ForgeConfig>, env: Partial<ForgeConfig>, file: Partial<ForgeConfig>): ForgeConfig {
  return {
    maxSessions:   cli.maxSessions   ?? env.maxSessions   ?? file.maxSessions   ?? DEFAULT_CONFIG.maxSessions,
    idleTimeout:   cli.idleTimeout   ?? env.idleTimeout   ?? file.idleTimeout   ?? DEFAULT_CONFIG.idleTimeout,
    bufferSize:    cli.bufferSize    ?? env.bufferSize    ?? file.bufferSize    ?? DEFAULT_CONFIG.bufferSize,
    dashboard:     cli.dashboard     ?? env.dashboard     ?? file.dashboard     ?? DEFAULT_CONFIG.dashboard,
    dashboardPort: cli.dashboardPort ?? env.dashboardPort ?? file.dashboardPort ?? DEFAULT_CONFIG.dashboardPort,
    shell:         cli.shell         ?? env.shell         ?? file.shell         ?? DEFAULT_CONFIG.shell,
    claudePath:    cli.claudePath    ?? env.claudePath    ?? file.claudePath    ?? DEFAULT_CONFIG.claudePath,
    codexPath:     cli.codexPath     ?? env.codexPath     ?? file.codexPath     ?? DEFAULT_CONFIG.codexPath,
    geminiPath:    cli.geminiPath    ?? env.geminiPath    ?? file.geminiPath    ?? DEFAULT_CONFIG.geminiPath,
    claudeDefaultModel: cli.claudeDefaultModel ?? env.claudeDefaultModel ?? file.claudeDefaultModel ?? DEFAULT_CONFIG.claudeDefaultModel,
    codexDefaultModel:  cli.codexDefaultModel  ?? env.codexDefaultModel  ?? file.codexDefaultModel  ?? DEFAULT_CONFIG.codexDefaultModel,
    geminiDefaultModel: cli.geminiDefaultModel ?? env.geminiDefaultModel ?? file.geminiDefaultModel ?? DEFAULT_CONFIG.geminiDefaultModel,
    cursorPath:    cli.cursorPath    ?? env.cursorPath    ?? file.cursorPath    ?? DEFAULT_CONFIG.cursorPath,
    windsurfPath:  cli.windsurfPath  ?? env.windsurfPath  ?? file.windsurfPath  ?? DEFAULT_CONFIG.windsurfPath,
    copilotPath:   cli.copilotPath   ?? env.copilotPath   ?? file.copilotPath   ?? DEFAULT_CONFIG.copilotPath,
    deepAgentsPath: cli.deepAgentsPath ?? env.deepAgentsPath ?? file.deepAgentsPath ?? DEFAULT_CONFIG.deepAgentsPath,
    authToken:     cli.authToken     ?? env.authToken     ?? file.authToken     ?? DEFAULT_CONFIG.authToken,
    exitedTtl:     cli.exitedTtl     ?? env.exitedTtl     ?? file.exitedTtl     ?? DEFAULT_CONFIG.exitedTtl,
    agents:        file.agents       ?? DEFAULT_CONFIG.agents,
    whisperPath:   cli.whisperPath   ?? env.whisperPath   ?? file.whisperPath   ?? DEFAULT_CONFIG.whisperPath,
    whisperModelPath:  cli.whisperModelPath  ?? env.whisperModelPath  ?? file.whisperModelPath  ?? DEFAULT_CONFIG.whisperModelPath,
  };
}

// ─── ConfigManager ──────────────────────────────────────────

export type ConfigSource = "cli" | "env" | "file" | "default";

export interface ConfigField {
  value: unknown;
  source: ConfigSource;
}

export class ConfigManager {
  private _config: ForgeConfig;
  private cliOverrides: Partial<ForgeConfig>;
  private envOverrides: Partial<ForgeConfig>;
  private fileSettings: Partial<ForgeConfig>;
  private fileWatcher: FSWatcher | null = null;
  private dirWatcher: FSWatcher | null = null;
  private emitter = new EventEmitter();

  constructor(argv: string[] = []) {
    this.cliOverrides = parseCli(argv);
    this.envOverrides = parseEnv();
    this.fileSettings = loadSettingsFile();
    this._config = merge(this.cliOverrides, this.envOverrides, this.fileSettings);
  }

  get config(): ForgeConfig {
    return this._config;
  }

  /** Get config with source info for each field (used by settings UI) */
  getConfigWithSources(): Record<string, ConfigField> {
    const result: Record<string, ConfigField> = {};
    for (const key of Object.keys(DEFAULT_CONFIG) as (keyof ForgeConfig)[]) {
      let source: ConfigSource = "default";
      if (key in this.cliOverrides && this.cliOverrides[key] !== undefined) source = "cli";
      else if (key in this.envOverrides && this.envOverrides[key] !== undefined) source = "env";
      else if (key in this.fileSettings && this.fileSettings[key] !== undefined) source = "file";
      result[key] = { value: this._config[key], source };
    }
    return result;
  }

  /** Update settings file and recompute config */
  updateFileSettings(updates: Partial<ForgeConfig>): void {
    saveSettingsFile(updates);
    this.fileSettings = loadSettingsFile();
    this.recompute();
  }

  /** Start watching ~/.forge/settings.json for external changes */
  startWatching(): void {
    const dir = join(homedir(), ".forge");
    mkdirSync(dir, { recursive: true });

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const reload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const newFile = loadSettingsFile();
        const oldJson = JSON.stringify(this.fileSettings);
        const newJson = JSON.stringify(newFile);
        if (oldJson !== newJson) {
          this.fileSettings = newFile;
          this.recompute();
        }
      }, 300);
    };

    try {
      this.fileWatcher = watch(SETTINGS_FILE, reload);
      if (this.fileWatcher.unref) this.fileWatcher.unref();
    } catch {
      // File may not exist yet
    }

    // Watch directory for file creation/deletion
    try {
      this.dirWatcher = watch(dir, (_event, filename) => {
        if (filename === "settings.json") reload();
      });
      if (this.dirWatcher.unref) this.dirWatcher.unref();
    } catch {
      // Shouldn't happen since we mkdir above
    }
  }

  stopWatching(): void {
    this.fileWatcher?.close();
    this.dirWatcher?.close();
    this.fileWatcher = null;
    this.dirWatcher = null;
  }

  on(event: "changed", listener: (config: ForgeConfig) => void): void {
    this.emitter.on(event, listener);
  }

  off(event: "changed", listener: (config: ForgeConfig) => void): void {
    this.emitter.off(event, listener);
  }

  private recompute(): void {
    const oldConfig = this._config;
    this._config = merge(this.cliOverrides, this.envOverrides, this.fileSettings);

    // Detect changed fields
    const changed: string[] = [];
    for (const key of Object.keys(DEFAULT_CONFIG) as (keyof ForgeConfig)[]) {
      if (oldConfig[key] !== this._config[key]) changed.push(key);
    }

    if (changed.length > 0) {
      logger.info("Settings reloaded", { changed });
      this.emitter.emit("changed", this._config);
    }
  }
}

// ─── Legacy parseConfig (backward compat) ───────────────────

export function parseConfig(argv: string[] = process.argv.slice(2)): ForgeConfig {
  return merge(parseCli(argv), parseEnv(), loadSettingsFile());
}
