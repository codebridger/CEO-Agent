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

## `social-engine.mjs` — LinkedIn publishing via the Social Engine

Zero-dependency stdio MCP server (same shape as `gemini-image.mjs`). A thin
client to Navid's already-built
[SoloDev Social Engine](https://github.com/navidshad/SoloDev-Social-Engine),
which holds the LinkedIn connection, the PDF-carousel logic, and the list of
publishable accounts/pages. The MCP just calls the engine's headless `socialApi`
endpoint with a shared API key. **Publishing only** — likes, comments, DMs, and
browsing stay on the browser MCP.

Two tools:

- **`list_accounts`** — lists the LinkedIn accounts/pages the engine can post as
  (personal profile + any connected company Pages). Returns each one's `id`,
  `displayName`, and `type`. Call it to discover what `account_id` to use.
- **`publish_post`** — posts `text` (+ optional `images`, `as_pdf` carousel,
  `account_id`, `visibility`). Returns the post id and permalink.

### How the engine side works

The engine exposes `socialApi` (an `onRequest` function) guarded by an API key
(`PUBLISH_API_KEY` secret). `GET ?action=accounts` lists accounts;
`POST {action:'publish', text, images, asPdf, accountId, visibility}` creates a
draft and publishes it. Posting to a Page (`urn:li:organization:…`) requires a
LinkedIn token with the Community Management API scopes — personal-profile
publishing + carousels work with the standard `w_member_social` token. See the
engine repo's `functions/src/api/socialApi.ts`.

### Register it

Add to the `mcpServers` block of `~/.claude.json`:

```json
"social-engine": {
  "type": "stdio",
  "command": "node",
  "args": ["/home/ubuntu/CEO-Agent/mcp/social-engine.mjs"],
  "env": {
    "SOCIAL_ENGINE_URL": "https://<region>-<project>.cloudfunctions.net/socialApi",
    "SOCIAL_ENGINE_API_KEY": "<same value as the engine's PUBLISH_API_KEY secret>"
  }
}
```

Restart the agent (`pm2 restart ...`) so new wakes load the server. The agent
reaches the tools as `mcp__social-engine__list_accounts` and
`mcp__social-engine__publish_post`.

### Smoke test (no config needed — exercises the protocol)

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node mcp/social-engine.mjs
```
