import { describe, it, expect } from "vitest";
import { resolveControl, listControls } from "../../src/utils/control-chars.js";

describe("control-chars", () => {
  it("resolves ctrl+c", () => {
    expect(resolveControl("ctrl+c")).toBe("\x03");
  });

  it("resolves ctrl+d", () => {
    expect(resolveControl("ctrl+d")).toBe("\x04");
  });

  it("resolves arrow keys", () => {
    expect(resolveControl("up")).toBe("\x1B[A");
    expect(resolveControl("down")).toBe("\x1B[B");
    expect(resolveControl("left")).toBe("\x1B[D");
    expect(resolveControl("right")).toBe("\x1B[C");
  });

  it("is case insensitive", () => {
    expect(resolveControl("Ctrl+C")).toBe("\x03");
    expect(resolveControl("CTRL+C")).toBe("\x03");
    expect(resolveControl("UP")).toBe("\x1B[A");
  });

  it("returns null for unknown keys", () => {
    expect(resolveControl("ctrl+q")).toBeNull();
    expect(resolveControl("nonsense")).toBeNull();
  });

  it("listControls returns all available keys", () => {
    const controls = listControls();
    expect(controls).toContain("ctrl+c");
    expect(controls).toContain("up");
    expect(controls).toContain("enter");
    expect(controls.length).toBeGreaterThan(10);
  });
});
