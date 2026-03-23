# Releasing a New Version

Step-by-step checklist for publishing a new Forge release.

## 1. Pre-release checks

```bash
# Make sure you're on main with latest changes
git checkout main && git pull origin main

# Install deps, typecheck, and run tests
npm install
npx tsc --noEmit
npx vitest run
```

## 2. Version bump

Create a release branch:

```bash
git checkout -b release/vX.Y.Z
```

Update version in all these files:

| File | Field/Location |
|------|---------------|
| `package.json` | `"version"` |
| `server.json` | `"version"` (2 occurrences) |
| `desktop/package.json` | `"version"` |
| `src/server.ts` | `version: "X.Y.Z"` in McpServer + health_check (2 occurrences) |
| `test/integration/mcp-tools.test.ts` | `expect(parsed.version).toBe("X.Y.Z")` |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | `placeholder: "X.Y.Z"` |

Quick find command to verify all occurrences:

```bash
grep -rn '"0\.OLD\.0"' package.json server.json desktop/package.json src/server.ts test/integration/mcp-tools.test.ts .github/ISSUE_TEMPLATE/bug_report.yml
```

## 3. Versioning rules

Per `CONTRIBUTING.md`:

- **Patch (0.x.y)**: Bug fixes, docs, test improvements
- **Minor (0.x.0)**: New tools, new templates, new config options
- **Major (x.0.0)**: Breaking changes to tool schemas, removed tools, Node version bump

Stay on 0.x until tool schemas are stable and battle-tested.

## 4. Commit, PR, and merge

```bash
git add package.json server.json desktop/package.json src/server.ts \
  test/integration/mcp-tools.test.ts .github/ISSUE_TEMPLATE/bug_report.yml

git commit -m "chore: bump version to X.Y.Z"
git push -u origin release/vX.Y.Z
gh pr create --title "chore: release vX.Y.Z" --body "..."
```

Wait for CI (typecheck, build, build-binary, test), then merge.

## 5. Tag and GitHub Release

After merging to main:

```bash
git checkout main && git pull origin main
git tag v0.9.0
git push origin v0.9.0
```

Create a GitHub release (triggers binary uploads to release assets):

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes
```

## 6. Publish to npm

```bash
npm publish
```

## 7. Post-release

- Verify `npm info forge-terminal-mcp version` shows the new version
- Verify `curl -fsSL https://forgemcp.dev/install.sh | sh` downloads the new binary
- Verify the GitHub release has all 4 binary assets (darwin-arm64, darwin-x64, linux-x64, linux-arm64)
- Update any pinned version references in external docs if needed
