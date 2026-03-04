export type HistoryEvent =
  | { type: "session_init"; timestamp: string; cwd?: string; model?: string }
  | { type: "tool_call"; timestamp: string; toolName: string; summary: string; input: Record<string, unknown> }
  | { type: "tool_result"; timestamp: string; isError: boolean; errorMessage?: string };

export class StreamJsonParser {
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

    // System init
    if (type === "system" && evt.subtype === "init") {
      return {
        type: "session_init",
        timestamp,
        cwd: evt.cwd as string | undefined,
        model: evt.model as string | undefined,
      };
    }

    // Assistant message with tool_use content blocks
    if (type === "assistant" && evt.message) {
      const msg = evt.message as Record<string, unknown>;
      const content = msg.content;
      if (!Array.isArray(content)) return null;

      const events: HistoryEvent[] = [];
      for (const block of content) {
        if (block.type === "tool_use") {
          events.push(this.toolCallEvent(block, timestamp));
        }
      }
      // Return first tool_call found (caller gets all via feed's accumulation)
      return events.length > 0 ? events[0] : null;
    }

    // Content block start with tool_use
    if (type === "content_block_start") {
      const block = evt.content_block as Record<string, unknown> | undefined;
      if (block?.type === "tool_use") {
        return this.toolCallEvent(block, timestamp);
      }
      return null;
    }

    // Result event
    if (type === "result") {
      const isError = !!(evt.is_error || evt.error);
      const errorMessage = isError
        ? ((evt.error as Record<string, unknown>)?.message as string) || "error"
        : undefined;
      return { type: "tool_result", timestamp, isError, errorMessage };
    }

    return null;
  }

  private toolCallEvent(block: Record<string, unknown>, timestamp: string): HistoryEvent {
    const toolName = (block.name as string) || "unknown";
    const input = (block.input as Record<string, unknown>) || {};
    const summary = this.summarize(toolName, input);
    return { type: "tool_call", timestamp, toolName, summary, input };
  }

  /** Generate a short summary string like "Bash: git status" */
  private summarize(toolName: string, input: Record<string, unknown>): string {
    switch (toolName) {
      case "Bash":
        return input.command ? `Bash: ${String(input.command).slice(0, 120)}` : "Bash";
      case "Write":
        return input.file_path ? `Write: ${input.file_path}` : "Write";
      case "Edit":
        return input.file_path ? `Edit: ${input.file_path}` : "Edit";
      case "Read":
        return input.file_path ? `Read: ${input.file_path}` : "Read";
      case "Glob":
        return input.pattern ? `Glob: ${input.pattern}` : "Glob";
      case "Grep":
        return input.pattern ? `Grep: /${input.pattern}/` : "Grep";
      case "Agent":
        return input.description ? `Agent: ${String(input.description).slice(0, 80)}` : "Agent";
      case "TaskCreate":
      case "TaskUpdate":
        return input.subject ? `${toolName}: ${input.subject}` : toolName;
      default:
        return toolName;
    }
  }
}
