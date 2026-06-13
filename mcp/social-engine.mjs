#!/usr/bin/env node
/**
 * Social Engine publishing MCP server (stdio, zero-dependency).
 *
 * Why this exists: Aso publishes content to LinkedIn through Navid's already-built
 * "SoloDev Social Engine" (navidshad/SoloDev-Social-Engine), which already holds
 * the LinkedIn connection, the PDF-carousel logic, and the list of publishable
 * accounts/pages. This MCP is a thin client that knocks on the engine's headless
 * `socialApi` endpoint with a shared API key. PUBLISHING ONLY — social activity
 * (likes, comments, DMs, browsing) stays on the browser MCP.
 *
 * Protocol: MCP over stdio, newline-delimited JSON-RPC 2.0. Node 22's global
 * `fetch`, no SDK — same zero-dependency shape as gemini-image.mjs.
 *
 * Config (in the server's `env` block in ~/.claude.json, never the app env):
 *   SOCIAL_ENGINE_URL      full https URL of the deployed `socialApi` function
 *   SOCIAL_ENGINE_API_KEY  the shared key matching the engine's PUBLISH_API_KEY secret
 */

const BASE_URL = (process.env.SOCIAL_ENGINE_URL || "").trim().replace(/\/+$/, "");
const API_KEY = (process.env.SOCIAL_ENGINE_API_KEY || "").trim();

// --- stdio JSON-RPC plumbing ---------------------------------------------

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function result(id, res) {
  send({ jsonrpc: "2.0", id, result: res });
}
function rpcError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

const TOOLS = [
  {
    name: "list_accounts",
    description:
      "List the LinkedIn accounts/pages this engine can publish to, so you can pick which one. " +
      "Returns each account's id, displayName, type ('person' or 'organization'), and whether " +
      "it's the default. Pass the chosen `id` to publish_post as `accountId`. Call this first " +
      "when the user hasn't specified which profile/page to post as.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "publish_post",
    description:
      "Publish a post to LinkedIn through the Social Engine (it holds the LinkedIn connection). " +
      "PUBLISHING ONLY — for likes/comments/DMs/browsing use the browser. Posts text, optionally " +
      "with images, optionally as a PDF carousel. Choose the target account with accountId (omit " +
      "for the default personal profile; use list_accounts to see options). Returns the post id and permalink.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The post body / commentary." },
        images: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional image URLs to attach (max 9). Must be publicly fetchable http(s) URLs — " +
            "the engine downloads them. For local files, upload them somewhere reachable first.",
        },
        as_pdf: {
          type: "boolean",
          description: "If true, the images are merged into a PDF document for a carousel-style post. Needs ≥1 image.",
        },
        account_id: {
          type: "string",
          description:
            "Which account/page to post as (from list_accounts). Omit or 'default' for the personal profile.",
        },
        visibility: {
          type: "string",
          description: "'PUBLIC' (default) or 'CONNECTIONS'. Pages always render PUBLIC.",
        },
      },
      required: ["text"],
    },
  },
];

// --- engine calls ---------------------------------------------------------

function configError() {
  return {
    isError: true,
    text:
      "Social Engine is not configured for this MCP server. Set SOCIAL_ENGINE_URL and " +
      "SOCIAL_ENGINE_API_KEY in the server's env block in ~/.claude.json and restart the agent.",
  };
}

async function callEngine(method, path, body) {
  const url = path ? `${BASE_URL}${path}` : BASE_URL;
  let resp;
  try {
    resp = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (e) {
    return { ok: false, text: `Network error reaching the Social Engine: ${e.message}` };
  }
  const raw = await resp.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, text: `Engine returned non-JSON (${resp.status}): ${raw.slice(0, 400)}` };
  }
  if (!resp.ok || data?.success === false) {
    return { ok: false, text: `Engine error (${resp.status}): ${data?.error || raw.slice(0, 400)}` };
  }
  return { ok: true, data };
}

async function listAccounts() {
  if (!BASE_URL || !API_KEY) return configError();
  const r = await callEngine("GET", "?action=accounts");
  if (!r.ok) return { isError: true, text: r.text };
  const accounts = r.data.accounts || [];
  if (accounts.length === 0) {
    return { isError: false, text: "No publishable LinkedIn accounts are connected in the engine yet." };
  }
  const lines = ["Publishable LinkedIn accounts:"];
  for (const a of accounts) {
    const tags = [a.type, a.isDefault ? "default" : null, a.connected ? null : "NOT CONNECTED"]
      .filter(Boolean)
      .join(", ");
    lines.push(`  • ${a.displayName} — id: ${a.id} (${tags})`);
  }
  return { isError: false, text: lines.join("\n") };
}

async function publishPost(args) {
  if (!BASE_URL || !API_KEY) return configError();
  const text = String(args.text || "").trim();
  if (!text) return { isError: true, text: "text is required and was empty." };

  const body = {
    action: "publish",
    text,
    images: Array.isArray(args.images) ? args.images : [],
    asPdf: !!args.as_pdf,
    accountId: args.account_id || undefined,
    visibility: args.visibility || undefined,
  };

  const r = await callEngine("POST", "", body);
  if (!r.ok) return { isError: true, text: r.text };

  const d = r.data;
  const acct = d.account ? `${d.account.displayName} (${d.account.urn})` : "the default account";
  const lines = [`Published to LinkedIn as ${acct}.`];
  if (d.postId) lines.push(`Post id: ${d.postId}`);
  if (d.permalink) lines.push(`Permalink: ${d.permalink}`);
  return { isError: false, text: lines.join("\n") };
}

// --- request dispatch -----------------------------------------------------

async function handle(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      result(id, {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "social-engine", version: "1.0.0" },
      });
      return;
    case "notifications/initialized":
      return;
    case "ping":
      result(id, {});
      return;
    case "tools/list":
      result(id, { tools: TOOLS });
      return;
    case "tools/call": {
      const name = params?.name;
      let out;
      if (name === "list_accounts") out = await listAccounts();
      else if (name === "publish_post") out = await publishPost(params.arguments || {});
      else {
        rpcError(id, -32602, `Unknown tool: ${name}`);
        return;
      }
      result(id, { content: [{ type: "text", text: out.text }], isError: out.isError });
      return;
    }
    default:
      if (id !== undefined) rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// --- newline-delimited stdin reader ---------------------------------------

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    Promise.resolve(handle(msg)).catch((e) => {
      if (msg && msg.id !== undefined) rpcError(msg.id, -32603, `Internal error: ${e.message}`);
    });
  }
});
process.stdin.on("end", () => process.exit(0));
