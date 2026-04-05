import { describe, it, expect, vi } from "vitest";
import { AgentRegistry } from "../../src/core/agent-registry.js";
import { DEFAULT_CONFIG, type ForgeConfig } from "../../src/core/types.js";

const baseConfig: ForgeConfig = { ...DEFAULT_CONFIG };

describe("AgentRegistry", () => {
  it("registers built-in agents (claude, codex, gemini)", () => {
    const reg = new AgentRegistry(baseConfig);
    expect(reg.listIds()).toEqual(expect.arrayContaining(["claude", "codex", "gemini"]));
    expect(reg.listIds()).toHaveLength(3);
  });

  it("get() returns agent by id", () => {
    const reg = new AgentRegistry(baseConfig);
    const claude = reg.get("claude");
    expect(claude).toBeDefined();
    expect(claude!.id).toBe("claude");
    expect(claude!.command).toBe(baseConfig.claudePath);
  });

  it("get() returns undefined for unknown id", () => {
    const reg = new AgentRegistry(baseConfig);
    expect(reg.get("nonexistent")).toBeUndefined();
  });

  it("getOrThrow() throws for unknown id", () => {
    const reg = new AgentRegistry(baseConfig);
    expect(() => reg.getOrThrow("nope")).toThrow(/Unknown agent "nope"/);
  });

  it("has() checks agent existence", () => {
    const reg = new AgentRegistry(baseConfig);
    expect(reg.has("claude")).toBe(true);
    expect(reg.has("nope")).toBe(false);
  });

  it("list() returns all agent definitions", () => {
    const reg = new AgentRegistry(baseConfig);
    const list = reg.list();
    expect(list).toHaveLength(3);
    expect(list.map((a) => a.id).sort()).toEqual(["claude", "codex", "gemini"]);
  });

  it("registers custom agents from config", () => {
    const config: ForgeConfig = {
      ...baseConfig,
      agents: {
        aider: { command: "aider", name: "Aider" },
      },
    };
    const reg = new AgentRegistry(config);
    expect(reg.has("aider")).toBe(true);
    expect(reg.get("aider")!.name).toBe("Aider");
    expect(reg.get("aider")!.command).toBe("aider");
    expect(reg.listIds()).toHaveLength(4);
  });

  it("custom agent gets default tag from id", () => {
    const config: ForgeConfig = {
      ...baseConfig,
      agents: {
        mybot: { command: "mybot" },
      },
    };
    const reg = new AgentRegistry(config);
    expect(reg.get("mybot")!.tag).toBe("mybot-agent");
    expect(reg.get("mybot")!.name).toBe("mybot"); // defaults to id
  });

  it("custom agent overrides built-in agent with warning", async () => {
    const { logger } = await import("../../src/utils/logger.js");
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    const config: ForgeConfig = {
      ...baseConfig,
      agents: {
        claude: { command: "/custom/claude", name: "Custom Claude" },
      },
    };
    const reg = new AgentRegistry(config);
    expect(reg.get("claude")!.command).toBe("/custom/claude");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('overrides built-in'));

    warnSpy.mockRestore();
  });

  it("rebuild() clears and re-registers agents", () => {
    const config1: ForgeConfig = {
      ...baseConfig,
      agents: { aider: { command: "aider" } },
    };
    const reg = new AgentRegistry(config1);
    expect(reg.has("aider")).toBe(true);

    // Rebuild without custom agents
    reg.rebuild(baseConfig);
    expect(reg.has("aider")).toBe(false);
    expect(reg.listIds()).toHaveLength(3);
  });

  it("resolveAgentFromTags() finds agent by tag", () => {
    const reg = new AgentRegistry(baseConfig);
    expect(reg.resolveAgentFromTags(["claude-agent"])).toBe("claude");
    expect(reg.resolveAgentFromTags(["codex-agent"])).toBe("codex");
    expect(reg.resolveAgentFromTags(["unknown-tag"])).toBeUndefined();
    expect(reg.resolveAgentFromTags(undefined)).toBeUndefined();
  });

  it("custom agent builds oneshot args with prompt placeholder", () => {
    const config: ForgeConfig = {
      ...baseConfig,
      agents: {
        myagent: {
          command: "myagent",
          oneshotArgs: ["run", "{prompt}", "--json"],
          modelFlag: "--model",
          defaultModel: "gpt-4",
        },
      },
    };
    const reg = new AgentRegistry(config);
    const agent = reg.get("myagent")!;
    const args = agent.buildOneshotArgs("hello world");
    expect(args).toEqual(["run", "hello world", "--json", "--model", "gpt-4"]);
  });

  it("custom agent builds interactive args with model override", () => {
    const config: ForgeConfig = {
      ...baseConfig,
      agents: {
        myagent: {
          command: "myagent",
          interactiveArgs: ["chat", "--verbose"],
          modelFlag: "-m",
        },
      },
    };
    const reg = new AgentRegistry(config);
    const agent = reg.get("myagent")!;
    const args = agent.buildInteractiveArgs("prompt", "custom-model");
    expect(args).toEqual(["chat", "--verbose", "-m", "custom-model"]);
  });

  it("custom agent submitSequence respects submitKey config", () => {
    const config: ForgeConfig = {
      ...baseConfig,
      agents: {
        enter_agent: { command: "a", submitKey: "enter" },
        escape_agent: { command: "b", submitKey: "escape-enter" },
        default_agent: { command: "c" },
      },
    };
    const reg = new AgentRegistry(config);
    expect(reg.get("enter_agent")!.submitSequence).toBe("\r");
    expect(reg.get("escape_agent")!.submitSequence).toBe("\x1B\r");
    expect(reg.get("default_agent")!.submitSequence).toBe("\r");
  });

  it("custom agent turnCompletePattern compiles to RegExp", () => {
    const config: ForgeConfig = {
      ...baseConfig,
      agents: {
        myagent: { command: "a", turnCompletePattern: "done\\." },
      },
    };
    const reg = new AgentRegistry(config);
    const pattern = reg.get("myagent")!.turnCompletePattern;
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern!.test("task done.")).toBe(true);
    expect(pattern!.test("not yet")).toBe(false);
  });

  it("custom agent env vars are passed through", () => {
    const config: ForgeConfig = {
      ...baseConfig,
      agents: {
        myagent: { command: "a", env: { FOO: "bar", BAZ: "qux" } },
      },
    };
    const reg = new AgentRegistry(config);
    expect(reg.get("myagent")!.env).toEqual({ FOO: "bar", BAZ: "qux" });
  });
});
