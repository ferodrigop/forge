# Maintainer Notes

Things to consider as the open source owner of forge-terminal-mcp.

## Before Publishing

- [ ] Review package.json metadata (author, description, keywords, homepage)
- [ ] Add CONTRIBUTING.md with PR guidelines, code style, test requirements
- [ ] Add issue templates (bug report, feature request)
- [ ] Add GitHub Actions CI (typecheck + build + test on PR)
- [ ] Decide on a code of conduct (Contributor Covenant is standard)
- [ ] Add a CHANGELOG.md (retroactive for V0.1.0–V0.5.0)
- [ ] Verify npm publish works (`npm pack` to test, then `npm publish`)
- [ ] Add npm badges to README (version, downloads, license)
- [ ] Create a GitHub release for V0.5.0 with release notes
- [ ] Add `.github/FUNDING.yml` if you want to accept sponsorships later

## PR / Issue Management

### When someone opens a PR:
1. CI must pass (typecheck, build, tests) — make this a branch protection rule
2. Every new tool or behavior change needs a test
3. No breaking changes to existing tool schemas without a major version bump
4. Keep dependencies minimal — every dep is an attack surface and maintenance burden
5. Squash merge to keep history clean

### When someone opens an issue:
- Bug reports need: OS, Node version, Claude Code version, steps to reproduce
- Feature requests: label them, don't commit to timelines
- "It doesn't work" with no details: ask for reproduction steps, close after 14 days if no response

### What to protect:
- **Tool schemas are API contracts.** Renaming a tool or changing param types breaks every user's CLAUDE.md instructions. Treat tool names and param shapes as semver-public.
- **Ring buffer is the core differentiator.** Reject PRs that replace it with unbounded arrays or simple string concatenation — the whole point is bounded memory.
- **Stdout is sacred.** Nothing except MCP JSON-RPC goes to stdout. Any PR that adds console.log is wrong.

## Versioning Strategy

- **Patch (0.5.x):** Bug fixes, docs, test improvements
- **Minor (0.x.0):** New tools, new templates, new config options
- **Major (x.0.0):** Breaking changes to tool schemas, removed tools, Node version bump

## Community Growth (if it takes off)

- Write a blog post or tweet thread showing a real workflow (e.g., "Claude managing 5 terminals to deploy a full-stack app")
- Record a 2-minute demo video showing the dashboard + Claude using multiple sessions
- Submit to MCP server directories (Smithery, awesome-mcp-servers, etc.)
- Consider a Discord or GitHub Discussions for community Q&A
- Tag releases properly so dependabot/renovate users get updates

## Things People Will Ask For

Based on the MCP ecosystem and terminal tool space, expect these requests:

1. **Docker support** — run Forge inside a container (needs PTY in Docker, possible but tricky)
2. **Remote sessions / SSH** — spawn sessions on remote hosts
3. **Session recording / replay** — asciinema-style timestamped capture
4. **Custom templates** — user-defined templates via config file
5. **Rate limiting** — cap how fast Claude can poll read_terminal
6. **Windows support** — node-pty supports ConPTY but spawn-helper and shell defaults are Unix-only
7. **Multiple MCP clients sharing sessions** — ring buffer already supports multi-consumer, just needs discovery

## Time Investment Estimate

- **Low activity (< 50 stars):** ~1 hr/week — triage issues, review occasional PR
- **Medium activity (50–500 stars):** ~3 hrs/week — more PRs, feature discussions, releases
- **High activity (500+ stars):** consider recruiting co-maintainers from active contributors

## When to Say No

- Feature requests that add complexity without clear benefit to the core use case
- PRs that introduce heavy dependencies (ORMs, frameworks, etc.)
- Requests to support non-MCP transports (REST API, gRPC) — stay focused on MCP
- "Can you add AI to X" — Forge is infrastructure, not an AI product itself
