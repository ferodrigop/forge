const CONTROL_MAP: Record<string, string> = {
  "ctrl+c": "\x03",
  "ctrl+d": "\x04",
  "ctrl+z": "\x1A",
  "ctrl+\\": "\x1C",
  "ctrl+l": "\x0C",
  "ctrl+a": "\x01",
  "ctrl+e": "\x05",
  "ctrl+k": "\x0B",
  "ctrl+u": "\x15",
  "ctrl+w": "\x17",
  "ctrl+r": "\x12",
  "ctrl+p": "\x10",
  "ctrl+n": "\x0E",
  up: "\x1B[A",
  down: "\x1B[B",
  right: "\x1B[C",
  left: "\x1B[D",
  home: "\x1B[H",
  end: "\x1B[F",
  tab: "\t",
  enter: "\r",
  escape: "\x1B",
  backspace: "\x7F",
  delete: "\x1B[3~",
  pageup: "\x1B[5~",
  pagedown: "\x1B[6~",
};

export function resolveControl(name: string): string | null {
  return CONTROL_MAP[name.toLowerCase()] ?? null;
}

export function listControls(): string[] {
  return Object.keys(CONTROL_MAP);
}
