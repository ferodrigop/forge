import { describe, it, expect } from "vitest";
import { generatePlist, resolveProgramArguments, LAUNCHD_LABEL } from "../../src/utils/launchd.js";

const base = {
  programArguments: ["/usr/bin/node", "/opt/forge/cli.js", "start"],
  path: "/usr/local/bin:/usr/bin:/bin",
  home: "/Users/test",
  logDirectory: "/Users/test/Library/Logs/forge",
};

describe("generatePlist", () => {
  it("produces a plist with the forge label and program arguments", () => {
    const plist = generatePlist(base);
    expect(plist).toContain(`<string>${LAUNCHD_LABEL}</string>`);
    expect(plist).toContain("<string>/usr/bin/node</string>");
    expect(plist).toContain("<string>/opt/forge/cli.js</string>");
    expect(plist).toContain("<string>start</string>");
  });

  it("never uses -d: a forking parent would look like a crash to launchd", () => {
    const plist = generatePlist(base);
    expect(plist).not.toContain("<string>-d</string>");
    expect(plist).not.toContain("<string>--detach</string>");
  });

  it("uses KeepAlive SuccessfulExit=false so `forge stop` stays stopped", () => {
    const plist = generatePlist(base);
    expect(plist).toMatch(/<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>/);
    // A bare <true/> would resurrect the daemon after every clean stop.
    expect(plist).not.toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
  });

  it("sets RunAtLoad so the daemon survives reboot", () => {
    expect(generatePlist(base)).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
  });

  it("propagates the login PATH so spawned PTYs can resolve agent CLIs", () => {
    const plist = generatePlist(base);
    expect(plist).toContain("<string>/usr/local/bin:/usr/bin:/bin</string>");
  });

  it("marks the launchd invocation so `start` does not recurse into kickstart", () => {
    expect(generatePlist(base)).toContain("<key>FORGE_LAUNCHD</key>");
  });

  it("runs Interactive so macOS does not throttle PTY sessions", () => {
    expect(generatePlist(base)).toContain("<string>Interactive</string>");
  });

  it("points stdout and stderr at the log directory", () => {
    const plist = generatePlist(base);
    expect(plist).toContain("/Users/test/Library/Logs/forge/daemon.out.log");
    expect(plist).toContain("/Users/test/Library/Logs/forge/daemon.err.log");
  });

  it("omits --port for the default port and includes it otherwise", () => {
    expect(generatePlist({ ...base, port: 3141 })).not.toContain("--port");
    const custom = generatePlist({ ...base, port: 4200 });
    expect(custom).toContain("<string>--port</string>");
    expect(custom).toContain("<string>4200</string>");
  });

  it("escapes XML metacharacters in paths", () => {
    const plist = generatePlist({ ...base, home: "/Users/a&b<c>" });
    expect(plist).toContain("/Users/a&amp;b&lt;c&gt;");
    expect(plist).not.toContain("/Users/a&b<c>");
  });
});

describe("resolveProgramArguments", () => {
  it("passes the script path when running under a node host", () => {
    expect(resolveProgramArguments("/usr/bin/node", "/opt/forge/cli.js")).toEqual([
      "/usr/bin/node",
      "/opt/forge/cli.js",
      "start",
    ]);
  });

  it("execs the binary directly for a compiled build", () => {
    expect(resolveProgramArguments("/usr/local/bin/forge", undefined)).toEqual([
      "/usr/local/bin/forge",
      "start",
    ]);
  });
});
