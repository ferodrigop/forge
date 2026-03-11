# Road to Publish

Temporary checklist for open source launch. Delete this file after publishing.

## Pre-requisites (need from user)

- [ ] **GitHub username** — needed for repo creation
- [ ] **Repo name** — `forge`, `forge-terminal-mcp`, or something else?
- [ ] **Public or private** initially?

## Must-do before publishing

### Code & Config
- [ ] Commit all pending changes (code-review → Changes rename, Codex title fix, screenshots)
- [ ] Update `.gitignore` — add: `desktop/release/`, `desktop/dist/`, `desktop/node_modules/`, `.claude/`, `.env*`, `coverage/`
- [ ] Add to `package.json`: `homepage`, `bugs`, `author` fields
- [ ] Verify tests pass (`npm test` — 179 tests)
- [ ] Verify build succeeds (`npm run build`)

### Documentation
- [ ] Create `CONTRIBUTING.md` — dev setup, PR process, code style, testing
- [ ] Create `CODE_OF_CONDUCT.md` — Contributor Covenant or similar
- [ ] Add contributing/changelog links to README

### GitHub Setup
- [ ] Create GitHub repo (public)
- [ ] Push all branches (`master` → `main`)
- [ ] Enable branch protection on `main`
- [ ] Set up required status checks (CI passing)

## Publish to npm

- [ ] Verify `npm whoami` (logged in)
- [ ] Create GitHub Release tag (`v0.8.0`)
- [ ] CI/CD auto-publishes via `.github/workflows/publish.yml` on release
- [ ] Verify package on npmjs.com

## Landing Page

- [ ] Landing page is at `landing/index.html` + `landing/forge-logo.png`
- [ ] Deploy: push to GitHub → create `gh-pages` branch → enable GitHub Pages
- [ ] Domain: register domain, add CNAME, configure DNS
- [ ] Assets: favicon, OG image, SVG logo
- [ ] Polish: mobile, cross-browser, Lighthouse audit

## Desktop App (.dmg)

- [ ] Build universal binary (`cd desktop && npm run package`)
- [ ] Upload `.dmg` to GitHub Releases
- [ ] Link download button on landing page
- [ ] Code signing + notarization (requires Apple Developer $99/yr — can defer)

## Post-launch

- [ ] `SECURITY.md` — vulnerability disclosure policy
- [ ] GitHub Actions CI badge in README
- [ ] Issue templates (bug report, feature request)
- [ ] Enable GitHub Discussions
- [ ] Promotion: awesome-mcp list, Hacker News, Reddit, X/Twitter
- [ ] Submit to Claude Code MCP template directory
