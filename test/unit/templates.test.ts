import { describe, it, expect } from "vitest";
import { getTemplate, listTemplates } from "../../src/core/templates.js";

describe("Session Templates", () => {
  it("getTemplate returns known template", () => {
    const tmpl = getTemplate("shell");
    expect(tmpl).toBeDefined();
    expect(tmpl!.name).toBe("Shell");
    expect(tmpl!.command).toBe("$SHELL");
    expect(tmpl!.tags).toContain("shell");
  });

  it("getTemplate returns undefined for unknown", () => {
    expect(getTemplate("nonexistent")).toBeUndefined();
  });

  it("listTemplates returns all built-in templates", () => {
    const templates = listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(6);
    const names = templates.map((t) => t.name);
    expect(names).toContain("shell");
    expect(names).toContain("next-dev");
    expect(names).toContain("vite-dev");
    expect(names).toContain("docker-compose");
    expect(names).toContain("npm-test");
    expect(names).toContain("npm-test-watch");
    // Each template has a description
    for (const t of templates) {
      expect(t.description).toBeTruthy();
    }
  });
});
