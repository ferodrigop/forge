export interface SessionTemplate {
  name: string;
  description: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  tags?: string[];
  cols?: number;
  rows?: number;
  waitFor?: string; // regex pattern to wait for after spawn
}

const BUILTIN_TEMPLATES: Record<string, SessionTemplate> = {
  "shell": {
    name: "Shell",
    description: "Default shell session",
    command: "$SHELL",
    tags: ["shell"],
  },
  "next-dev": {
    name: "Next.js Dev",
    description: "Next.js dev server",
    command: "npx",
    args: ["next", "dev"],
    tags: ["dev-server", "next"],
    waitFor: "Ready",
  },
  "vite-dev": {
    name: "Vite Dev",
    description: "Vite dev server",
    command: "npx",
    args: ["vite"],
    tags: ["dev-server", "vite"],
    waitFor: "Local:",
  },
  "docker-compose": {
    name: "Docker Compose",
    description: "docker compose up",
    command: "docker",
    args: ["compose", "up"],
    tags: ["docker"],
  },
  "npm-test": {
    name: "npm test",
    description: "Run test suite",
    command: "npm",
    args: ["test"],
    tags: ["test"],
  },
  "npm-test-watch": {
    name: "npm test:watch",
    description: "Run tests in watch mode",
    command: "npm",
    args: ["run", "test:watch"],
    tags: ["test", "watch"],
  },
};

export function getTemplate(name: string): SessionTemplate | undefined {
  return BUILTIN_TEMPLATES[name];
}

export function listTemplates(): Array<{ name: string; description: string }> {
  return Object.entries(BUILTIN_TEMPLATES).map(([key, t]) => ({
    name: key,
    description: t.description,
  }));
}
