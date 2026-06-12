# Local MCP servers

Small, self-contained MCP servers the headless agent inherits at runtime. They
are registered **user-scope** in `~/.claude.json` (same place as `browser` /
`browser-daemon`), so every `claude -p` wake picks them up. Secrets live in the
server's `env` block in that file — never in the app's `.env` or process env.

## `gemini-image.mjs` — Gemini image generation

Zero-dependency stdio MCP server (Node 22's global `fetch`, no SDK). Exposes one
tool, `generate_image`, which calls Google's Gemini image API and writes the
result to disk, returning the file path(s).

- **Models:** `gemini-3.1-flash-image` (default) and `gemini-3-pro-image` (pass
  `model: 'pro'`, used only when best quality is requested).
- **Output dir:** `data/images/` by default (git-ignored), or `GEMINI_IMAGE_DIR`.

### Register it

Add to the `mcpServers` block of `~/.claude.json`:

```json
"gemini": {
  "type": "stdio",
  "command": "node",
  "args": ["/home/ubuntu/CEO-Agent/mcp/gemini-image.mjs"],
  "env": { "GEMINI_API_KEY": "<key>" }
}
```

Then restart the agent (`pm2 restart ...`) so new wakes load the server. The
agent reaches the tool as `mcp__gemini__generate_image`.

### Smoke test (no key needed)

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node mcp/gemini-image.mjs
```
