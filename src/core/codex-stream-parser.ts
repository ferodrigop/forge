import type { HistoryEvent } from "./stream-json-parser.js";

/**
 * Parses Codex CLI `--json` JSONL output into HistoryEvents.
 *
 * Codex event types:
 * - thread.started  → session_init
 * - item.started    → tool_call (command_execution, file edits)
 * - item.completed  → tool_result
 * - turn.completed  → (usage info, ignored for now)
 */
export class CodexStreamParser {
  private buffer = "";

  /** Feed raw PTY output data. Returns any complete HistoryEvents parsed from it. */
  feed(data: string): HistoryEvent[] {
    this.buffer += data;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    const events: HistoryEvent[] = [];
    const now = new Date().toISOString();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let evt: Record<string, unknown>;
      try {
        evt = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const parsed = this.parseEvent(evt, now);
      if (parsed) events.push(parsed);
    }

    return events;
  }

  private parseEvent(evt: Record<string, unknown>, timestamp: string): HistoryEvent | null {
    const type = evt.type as string;

    // thread.started → session_init
    if (type === "thread.started") {
      return {
        type: "session_init",
        timestamp,
        model: evt.model as string | undefined,
      };
    }

    // session_meta from stored JSONL → session_init
    if (type === "session_meta") {
      const meta = evt as Record<string, unknown>;
      return {
        type: "session_init",
        timestamp,
        cwd: meta.cwd as string | undefined,
        model: meta.model as string | undefined,
      };
    }

    // item.started → tool_call
    if (type === "item.started") {
      const item = evt.item as Record<string, unknown> | undefined;
      if (!item) return null;
      return this.parseItemAsToolCall(item, timestamp);
    }

    // response_item (stored JSONL format) → tool_call
    if (type === "response_item") {
      const item = evt.item as Record<string, unknown> | undefined;
      if (!item) return null;
      return this.parseItemAsToolCall(item, timestamp);
    }

    // item.completed → tool_result
    if (type === "item.completed") {
      const item = evt.item as Record<string, unknown> | undefined;
      const status = (item?.status as string) || "";
      const isError = status === "failed" || status === "error";
      return {
        type: "tool_result",
        timestamp,
        isError,
        errorMessage: isError ? (item?.error as string) || "error" : undefined,
      };
    }

    return null;
  }

  private parseItemAsToolCall(item: Record<string, unknown>, timestamp: string): HistoryEvent | null {
    const itemType = item.type as string;

    // command_execution
    if (itemType === "command_execution" || itemType === "function_call") {
      const command = (item.command as string) || (item.name as string) || "";
      const args = item.arguments as string | undefined;
      const summary = command
        ? `Bash: ${command.slice(0, 120)}`
        : args
          ? `Call: ${args.slice(0, 120)}`
          : "Command";
      return {
        type: "tool_call",
        timestamp,
        toolName: "Bash",
        summary,
        input: { command: command || args || "" },
      };
    }

    // file edits (file_edit, file_create, file_delete)
    if (itemType === "file_edit" || itemType === "file_create" || itemType === "file_delete") {
      const filePath = (item.file_path as string) || (item.path as string) || "";
      const toolName = itemType === "file_edit" ? "Edit" : itemType === "file_create" ? "Write" : "Delete";
      return {
        type: "tool_call",
        timestamp,
        toolName,
        summary: filePath ? `${toolName}: ${filePath}` : toolName,
        input: { file_path: filePath },
      };
    }

    // agent_message (text response from the model)
    if (itemType === "message" || itemType === "agent_message") {
      // Skip text messages — not a tool call
      return null;
    }

    // Generic fallback for unknown item types
    if (itemType) {
      return {
        type: "tool_call",
        timestamp,
        toolName: itemType,
        summary: itemType,
        input: {},
      };
    }

    return null;
  }
}
