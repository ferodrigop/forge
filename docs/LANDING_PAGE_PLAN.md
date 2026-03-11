# Forge Landing Page

## Status

**Built**: `landing/index.html` — static HTML + Tailwind CSS via CDN. No build step.

**Decided**:
- Static HTML (no framework)
- GitHub Pages via `gh-pages` branch
- macOS app download via GitHub Releases

---

## Next Steps

### 1. Deploy to GitHub Pages
- [ ] Push forge repo to GitHub (if not already)
- [ ] Create `gh-pages` branch with contents of `landing/`
- [ ] Enable GitHub Pages in repo settings, source: `gh-pages` branch
- [ ] Verify it works at `https://ravn-labs.github.io/forge`

### 2. Custom Domain
- [ ] Pick and register domain (`forgemcp.dev`, `forgemcp.com`, or similar)
- [ ] Add `CNAME` file to `gh-pages` branch with the domain
- [ ] Configure DNS (CNAME to `ravn-labs.github.io` or A records to GitHub's IPs)
- [ ] Enable "Enforce HTTPS" in GitHub Pages settings

### 3. Assets Still Needed
- [ ] **Favicon** — derive from `forge-logo.png`, need `.ico` and `apple-touch-icon.png`
- [ ] **Open Graph image** — 1200x630 for social sharing (Twitter/LinkedIn previews)
- [ ] **SVG logo** — for crisp rendering at any size (currently only PNG)

### 4. macOS App Distribution
- [ ] Build `.dmg` with electron-builder
- [ ] Create a GitHub Release on the `forge` repo
- [ ] Upload `.dmg` to the release
- [ ] Update "Download for macOS" button URL to point to release

### 5. Polish
- [ ] Test on mobile (responsive)
- [ ] Cross-browser check (Safari, Chrome, Firefox)
- [ ] Lighthouse audit (performance, accessibility, SEO)
- [ ] Replace Tailwind CDN with a production build (smaller payload) if needed
- [ ] Add to README: link to landing page

### 6. Promotion
- [ ] Submit to awesome-mcp lists
- [ ] Post on relevant communities (HN, Reddit r/LocalLLaMA, MCP Discord)
- [ ] Add landing page URL to npm package description
