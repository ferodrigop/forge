import { describe, it, expect, beforeEach } from "vitest";
import { StreamJsonParser } from "../../src/core/stream-json-parser.js";

let parser: StreamJsonParser;

beforeEach(() => {
  parser = new StreamJsonParser();
});

describe("StreamJsonParser", () => {
  it("parses system init event", () => {
    const events = parser.feed('{"type":"system","subtype":"init","cwd":"/tmp","model":"sonnet"}\n');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("session_init");
    if (events[0].type === "session_init") {
      expect(events[0].cwd).toBe("/tmp");
      expect(events[0].model).toBe("sonnet");
    }
  });

  it("parses content_block_start with tool_use", () => {
    const line = JSON.stringify({
      type: "content_block_start",
      content_block: {
        type: "tool_use",
        name: "Bash",
        input: { command: "git status" },
      },
    });
    const events = parser.feed(line + "\n");
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("tool_call");
    if (events[0].type === "tool_call") {
      expect(events[0].toolName).toBe("Bash");
      expect(events[0].summary).toBe("Bash: git status");
    }
  });

  it("parses assistant message with tool_use blocks", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Let me read that file." },
          { type: "tool_use", name: "Read", input: { file_path: "/foo/bar.ts" } },
        ],
      },
    });
    const events = parser.feed(line + "\n");
    expect(events).toHaveLength(1);
    if (events[0].type === "tool_call") {
      expect(events[0].toolName).toBe("Read");
      expect(events[0].summary).toBe("Read: /foo/bar.ts");
    }
  });

  it("parses result events", () => {
    const events = parser.feed('{"type":"result","is_error":false}\n');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("tool_result");
    if (events[0].type === "tool_result") {
      expect(events[0].isError).toBe(false);
    }
  });

  it("parses error result events", () => {
    const events = parser.feed('{"type":"result","is_error":true,"error":{"message":"Permission denied"}}\n');
    expect(events).toHaveLength(1);
    if (events[0].type === "tool_result") {
      expect(events[0].isError).toBe(true);
      expect(events[0].errorMessage).toBe("Permission denied");
    }
  });

  it("buffers partial lines across feed calls", () => {
    const events1 = parser.feed('{"type":"system","subtype"');
    expect(events1).toHaveLength(0);

    const events2 = parser.feed(':"init","cwd":"/tmp"}\n');
    expect(events2).toHaveLength(1);
    expect(events2[0].type).toBe("session_init");
  });

  it("skips non-JSON lines", () => {
    const events = parser.feed("some startup text\nnot json either\n");
    expect(events).toHaveLength(0);
  });

  it("skips text deltas and message_start events", () => {
    const data = [
      '{"type":"message_start"}',
      '{"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}',
      '{"type":"message_stop"}',
    ].join("\n") + "\n";
    const events = parser.feed(data);
    expect(events).toHaveLength(0);
  });

  it("handles multiple events in a single feed", () => {
    const data = [
      '{"type":"system","subtype":"init","cwd":"/tmp"}',
      JSON.stringify({
        type: "content_block_start",
        content_block: { type: "tool_use", name: "Glob", input: { pattern: "**/*.ts" } },
      }),
      '{"type":"result","is_error":false}',
    ].join("\n") + "\n";

    const events = parser.feed(data);
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("session_init");
    expect(events[1].type).toBe("tool_call");
    expect(events[2].type).toBe("tool_result");
  });

  it("generates correct summaries for all tool types", () => {
    const tools = [
      { name: "Bash", input: { command: "npm test" }, expected: "Bash: npm test" },
      { name: "Write", input: { file_path: "/a.ts" }, expected: "Write: /a.ts" },
      { name: "Edit", input: { file_path: "/b.ts" }, expected: "Edit: /b.ts" },
      { name: "Grep", input: { pattern: "TODO" }, expected: "Grep: /TODO/" },
      { name: "Agent", input: { description: "explore codebase" }, expected: "Agent: explore codebase" },
      { name: "TaskCreate", input: { subject: "Fix bug" }, expected: "TaskCreate: Fix bug" },
      { name: "WebFetch", input: {}, expected: "WebFetch" },
    ];

    for (const t of tools) {
      const p = new StreamJsonParser();
      const line = JSON.stringify({
        type: "content_block_start",
        content_block: { type: "tool_use", name: t.name, input: t.input },
      });
      const events = p.feed(line + "\n");
      expect(events).toHaveLength(1);
      if (events[0].type === "tool_call") {
        expect(events[0].summary).toBe(t.expected);
      }
    }
  });

  it("ignores content_block_start without tool_use", () => {
    const line = JSON.stringify({
      type: "content_block_start",
      content_block: { type: "text", text: "hello" },
    });
    const events = parser.feed(line + "\n");
    expect(events).toHaveLength(0);
  });
});
