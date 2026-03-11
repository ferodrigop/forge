# Contributing to Forge

Thanks for your interest in contributing to Forge! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/ferodrigop/forge.git
cd forge
npm install
npm run build
```

## Running Locally

```bash
# Start the daemon
node dist/cli.js start -d

# Open the dashboard
open http://127.0.0.1:3141

# Stop the daemon
node dist/cli.js stop
```

## Testing

```bash
npm test          # Run all tests
npm run test:watch  # Watch mode
```

All PRs must pass the existing test suite. Add tests for new features or bug fixes.

## Code Style

- TypeScript strict mode
- ESM modules
- No external linters enforced — keep code consistent with what's already there

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add or update tests as needed
4. Ensure `npm test` passes
5. Open a PR with a clear title and description

CI must pass (typecheck, build, tests). PRs are squash-merged to keep history clean.

## What to Protect

- **Tool schemas are API contracts.** Renaming a tool or changing param types breaks every user's CLAUDE.md instructions. Treat tool names and param shapes as semver-public.
- **Ring buffer is the core differentiator.** Reject PRs that replace it with unbounded arrays or simple string concatenation — the whole point is bounded memory.
- **Stdout is sacred.** Nothing except MCP JSON-RPC goes to stdout. Any PR that adds console.log is wrong.

## Versioning

- **Patch (0.x.y):** Bug fixes, docs, test improvements
- **Minor (0.x.0):** New tools, new templates, new config options
- **Major (x.0.0):** Breaking changes to tool schemas, removed tools, Node version bump

## Reporting Issues

Use [GitHub Issues](https://github.com/ferodrigop/forge/issues) for bug reports and feature requests. Include:

- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Node.js version and OS

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
