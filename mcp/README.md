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

## `linkedin.mjs` — LinkedIn publishing

Zero-dependency stdio MCP server (same shape as `gemini-image.mjs`). Exposes one
tool, `publish_post`, which posts text + optional images to the configured
member's LinkedIn feed via the API. **Publishing only** — likes, comments, DMs,
and browsing stay on the browser MCP. Mechanism is lifted from
[navidshad/SoloDev-Social-Engine](https://github.com/navidshad/SoloDev-Social-Engine)'s
LinkedIn service (`registerUpload` → upload binary → `POST /v2/ugcPosts`).

- **Auth:** a personal LinkedIn member access token with scopes
  `w_member_social openid profile`. The author URN is derived once from
  `GET /v2/userinfo` (`urn:li:person:{sub}`) and cached; set `LINKEDIN_URN` to
  skip the lookup.
- **Images:** local file paths (e.g. gemini-image output) or http(s) URLs, max 9.

### Register it

Add to the `mcpServers` block of `~/.claude.json`:

```json
"linkedin": {
  "type": "stdio",
  "command": "node",
  "args": ["/home/ubuntu/CEO-Agent/mcp/linkedin.mjs"],
  "env": {
    "LINKEDIN_ACCESS_TOKEN": "<member-access-token>",
    "LINKEDIN_URN": "urn:li:person:XXXX"
  }
}
```

`LINKEDIN_URN` is optional (auto-derived from the token). Restart the agent
(`pm2 restart ...`) so new wakes load the server. The agent reaches the tool as
`mcp__linkedin__publish_post`.

### Smoke test (no token needed — exercises the protocol)

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node mcp/linkedin.mjs
```
