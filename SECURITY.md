# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Forge, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Use [GitHub's Security Advisory feature](https://github.com/ferodrigop/forge/security/advisories/new) to report privately
3. Include: description, steps to reproduce, and potential impact

You should receive a response within 48 hours. We will work with you to understand and address the issue before any public disclosure.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.8.x   | Yes       |
| < 0.8   | No        |

## Security Considerations

- **Auth token**: Forge supports `--auth-token` for dashboard/API access. Always use this in shared environments.
- **Local only**: By default, Forge binds to `127.0.0.1` and is not accessible from the network.
- **No remote code execution**: MCP tools execute commands only as requested by the connected AI agent.
- **Timing-safe auth**: Token comparison uses `crypto.timingSafeEqual` to prevent timing attacks.
