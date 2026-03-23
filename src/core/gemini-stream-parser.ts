import type { HistoryEvent } from "./stream-json-parser.js";

/**
 * Parses Gemini CLI terminal output into HistoryEvents.
 *
 * Unlike Claude and Codex, Gemini CLI outputs plain terminal text rather than
 * structured JSONL. This parser uses pattern matching on terminal output to
 * detect tool invocations and results.
 *
 * Recognized patterns:
 * - Shell command execution (```bash blocks, $ prefix lines)
 * - File operations (creating, editing, reading files)
 * - Error output
 *
 * Emits session_init on first data received, then tool_call/tool_result
 * for recognized patterns.
 */
export class GeminiStreamParser {
  private buffer = "";
  private initialized = false;

  /** Feed raw PTY output data. Returns any complete HistoryEvents parsed from it. */
  feed(data: string): HistoryEvent[] {
    this.buffer += data;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    const events: HistoryEvent[] = [];
    const now = new Date().toISOString();

    // Emit session_init on first data
    if (!this.initialized) {
      this.initialized = true;
      events.push({ type: "session_init", timestamp: now });
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parsed = this.parseLine(trimmed, now);
      if (parsed) events.push(parsed);
    }

    return events;
  }

  private parseLine(line: string, timestamp: string): HistoryEvent | null {
    // Detect shell command execution: lines starting with $ or ❯
    const cmdMatch = line.match(/^[❯$]\s+(.+)/);
    if (cmdMatch) {
      const command = cmdMatch[1];
      return {
        type: "tool_call",
        timestamp,
        toolName: "Bash",
        summary: `Bash: ${command.slice(0, 120)}`,
        input: { command },
      };
    }

    // Detect file creation: "Created file: <path>" or "Writing to <path>"
    const createMatch = line.match(/^(?:Created? file|Writing to|Wrote)\s*:?\s+(.+)/i);
    if (createMatch) {
      const filePath = createMatch[1].trim();
      return {
        type: "tool_call",
        timestamp,
        toolName: "Write",
        summary: `Write: ${filePath}`,
        input: { file_path: filePath },
      };
    }

    // Detect file edit: "Edited file: <path>" or "Updated <path>"
    const editMatch = line.match(/^(?:Edited? file|Updated?)\s*:?\s+(.+)/i);
    if (editMatch) {
      const filePath = editMatch[1].trim();
      return {
        type: "tool_call",
        timestamp,
        toolName: "Edit",
        summary: `Edit: ${filePath}`,
        input: { file_path: filePath },
      };
    }

    // Detect file read: "Reading <path>" or "Read file: <path>"
    const readMatch = line.match(/^(?:Reading|Read file)\s*:?\s+(.+)/i);
    if (readMatch) {
      const filePath = readMatch[1].trim();
      return {
        type: "tool_call",
        timestamp,
        toolName: "Read",
        summary: `Read: ${filePath}`,
        input: { file_path: filePath },
      };
    }

    // Detect errors
    if (line.match(/^(?:Error|ERROR|✗|✘|FAILED):/i)) {
      return {
        type: "tool_result",
        timestamp,
        isError: true,
        errorMessage: line.slice(0, 200),
      };
    }

    return null;
  }
}
