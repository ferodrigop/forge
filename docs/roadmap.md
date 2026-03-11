# Forge Roadmap

## Completed

### v0.1–v0.7 (March 2026)
Core terminal engine, pattern matching, agent orchestration, dashboard, chat browser, history/diagnostics. 29 features, 21 tools, 161 tests.

### v0.8 (March 2026)
- Collapsible sidebar with `Cmd+B`
- Changes panel (git diff, staging, commit, stash) with `Cmd+Shift+B`
- Folder picker tree in New Terminal modal
- Delegate task MCP tool (Claude/Codex, oneshot/interactive)
- Chat search (Enter-based with results count)
- Rename terminals (inline edit, three-dot menu)
- DELETE/PATCH session REST endpoints
- Codex full integration (spawn, chat browser, stream parser, worktree, blocked detection)

### Publishing (March 2026)
- GitHub repo (github.com/ferodrigop/forge)
- npm package (forge-terminal-mcp v0.8.0)
- CI/CD (GitHub Actions — typecheck, build, test, auto-publish on release)
- Landing page (forgemcp.dev) with GitHub Pages + custom domain
- Desktop app DMG (universal binary, unsigned)
- CHANGELOG, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue templates

---

## Next Up

### Quick Wins
- [x] Dynamic npm/CI badges in README
- [x] Branch protection on `main` with required status checks
- [x] Favicon + OG image for landing page
- [x] Enable GitHub Discussions
- [x] Glama listing (claimed)
- [ ] Publish to MCP Registry (`server.json` ready)
- [ ] Document `fromSession` param in README tools reference

### Desktop App
- [x] Auto-update via electron-updater + GitHub Releases
- [ ] Code signing + notarization — **blocked: requires Apple Developer $99/yr**
- [ ] Homebrew Cask (`brew install --cask forge`) — **blocked: requires code signing + notarization first**

### Documentation
- [ ] Best practices guide (when to use `run_command` vs `create_terminal`, `waitForExit` patterns)
- [ ] Demo video / GIF for README

### Promotion
- [x] Submit to awesome-mcp-servers list (PR pending)
- [x] Glama directory listing
- [ ] Submit to mcp.so
- [ ] Anthropic Claude Desktop directory (.mcpb packaging)
- [ ] Post on HN, Reddit (r/LocalLLaMA, r/ClaudeAI), X/Twitter
- [ ] Claude Code MCP template directory

---

## Future

### Dashboard
- [ ] Dashboard auth (optional password protection)
- [ ] Session recording / replay (asciinema-style)
- [ ] Notification sounds on session exit / pattern match
- [ ] One-shot prompt form in dashboard UI
- [ ] Custom user templates via `~/.forge/templates.json`

### Agents
- [ ] Gemini CLI support (spawn, chat browser, stream parser — same integration as Codex)

### Platform
- [ ] Windows ConPTY support
- [ ] Docker support
- [ ] Remote sessions / SSH
- [ ] Multiple MCP clients sharing one Forge server
- [ ] VS Code extension

### Protocol
- [ ] MCP Tasks primitive (long-running tool IDs — spec still evolving)
- [ ] A2A protocol support (agent-to-agent discovery — waiting for client adoption)

---

> Size estimates: S (~1 day), M (~2-3 days), L (~1 week), XL (~2+ weeks)
> Dashboard streaming is the highest-impact UX improvement from benchmarking.
> Cross-platform and multi-client features are community-driven — implement based on demand.
