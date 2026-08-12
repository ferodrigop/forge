import { describe, it, expect } from "vitest";
import { restartStartArgs } from "../../src/cli.js";

describe("restartStartArgs", () => {
  it("defaults to detached so restart hands the shell back", () => {
    expect(restartStartArgs([])).toEqual(["-d"]);
  });

  it("does not double up when -d is already given", () => {
    expect(restartStartArgs(["-d"])).toEqual(["-d"]);
    expect(restartStartArgs(["--detach"])).toEqual(["--detach"]);
  });

  it("drops --foreground to run the server in this process", () => {
    expect(restartStartArgs(["--foreground"])).toEqual([]);
    expect(restartStartArgs(["--foreground", "--port", "4000"])).toEqual(["--port", "4000"]);
  });

  it("preserves daemon options alongside the detach flag", () => {
    expect(restartStartArgs(["--port", "4000"])).toEqual(["-d", "--port", "4000"]);
    expect(restartStartArgs(["--verbose", "--max-sessions", "20"])).toEqual([
      "-d",
      "--verbose",
      "--max-sessions",
      "20",
    ]);
  });
});
