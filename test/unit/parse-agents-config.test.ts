import { describe, it, expect } from "vitest";
import { parseAgentsConfig } from "../../src/utils/config.js";

describe("parseAgentsConfig", () => {
  it("parses a valid agent config", () => {
    const result = parseAgentsConfig({
      aider: {
        command: "aider",
        name: "Aider",
        tag: "aider-session",
        modelFlag: "--model",
        defaultModel: "gpt-4",
      },
    });
    expect(result).toBeDefined();
    expect(result!.aider).toEqual({
      command: "aider",
      name: "Aider",
      tag: "aider-session",
      modelFlag: "--model",
      defaultModel: "gpt-4",
    });
  });

  it("requires command field", () => {
    const result = parseAgentsConfig({
      bad: { name: "No Command" },
    });
    expect(result).toBeUndefined();
  });

  it("requires command to be a non-empty string", () => {
    expect(parseAgentsConfig({ a: { command: "" } })).toBeUndefined();
    expect(parseAgentsConfig({ a: { command: 123 } })).toBeUndefined();
    expect(parseAgentsConfig({ a: { command: null } })).toBeUndefined();
  });

  it("skips non-object entries", () => {
    const result = parseAgentsConfig({
      good: { command: "good" },
      bad1: "string",
      bad2: null,
      bad3: 42,
    });
    expect(result).toBeDefined();
    expect(Object.keys(result!)).toEqual(["good"]);
  });

  it("validates submitKey enum", () => {
    const result = parseAgentsConfig({
      a: { command: "a", submitKey: "enter" },
      b: { command: "b", submitKey: "escape-enter" },
      c: { command: "c", submitKey: "invalid" },
    });
    expect(result!.a.submitKey).toBe("enter");
    expect(result!.b.submitKey).toBe("escape-enter");
    expect(result!.c.submitKey).toBeUndefined();
  });

  it("strips invalid values from oneshotArgs and interactiveArgs", () => {
    const result = parseAgentsConfig({
      a: {
        command: "a",
        oneshotArgs: ["valid", 123, "also-valid", null],
        interactiveArgs: [42, "ok"],
      },
    });
    expect(result!.a.oneshotArgs).toEqual(["valid", "also-valid"]);
    expect(result!.a.interactiveArgs).toEqual(["ok"]);
  });

  it("validates turnCompletePattern as valid regex", () => {
    const result = parseAgentsConfig({
      good: { command: "a", turnCompletePattern: "done\\." },
      bad: { command: "b", turnCompletePattern: "[invalid" },
    });
    expect(result!.good.turnCompletePattern).toBe("done\\.");
    expect(result!.bad.turnCompletePattern).toBeUndefined();
  });

  it("validates env as object with string values", () => {
    const result = parseAgentsConfig({
      a: {
        command: "a",
        env: { FOO: "bar", BAD: 123, GOOD: "ok" },
      },
    });
    expect(result!.a.env).toEqual({ FOO: "bar", GOOD: "ok" });
  });

  it("ignores env when not a plain object", () => {
    const result = parseAgentsConfig({
      a: { command: "a", env: "not-object" },
      b: { command: "b", env: [1, 2] },
    });
    expect(result!.a.env).toBeUndefined();
    expect(result!.b.env).toBeUndefined();
  });

  it("returns undefined when all entries are invalid", () => {
    expect(parseAgentsConfig({})).toBeUndefined();
    expect(parseAgentsConfig({ a: "bad", b: null })).toBeUndefined();
  });

  it("parses promptDelay as number", () => {
    const result = parseAgentsConfig({
      a: { command: "a", promptDelay: 500 },
      b: { command: "b", promptDelay: "not-a-number" },
    });
    expect(result!.a.promptDelay).toBe(500);
    expect(result!.b.promptDelay).toBeUndefined();
  });

  it("parses multiple agents", () => {
    const result = parseAgentsConfig({
      aider: { command: "aider" },
      cursor: { command: "cursor" },
    });
    expect(Object.keys(result!)).toEqual(["aider", "cursor"]);
  });
});
