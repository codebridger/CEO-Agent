#!/usr/bin/env node
/**
 * LinkedIn publishing MCP server (stdio, zero-dependency).
 *
 * Why this exists: Aso publishes content to LinkedIn through a controlled API
 * tool rather than driving the browser. (Browsing/social activity — likes,
 * comments, DMs — stays on the browser MCP; this server does *publishing only*.)
 *
 * Mechanism is lifted from navidshad/SoloDev-Social-Engine's LinkedIn service:
 *   - text post:  POST https://api.linkedin.com/v2/ugcPosts
 *   - image post: register upload -> upload binary -> ugcPosts with media[]
 *   - author URN comes from GET /v2/userinfo (urn:li:person:{sub})
 *
 * Protocol: MCP over stdio, newline-delimited JSON-RPC 2.0. Node 22 ships a
 * global `fetch`, so no SDK or npm install is needed — same zero-dependency
 * shape as gemini-image.mjs, trivially auditable and off the project dep tree.
 *
 * Auth: LINKEDIN_ACCESS_TOKEN is supplied via the `env` block of the MCP server
 * config in ~/.claude.json (NOT the app's process env), so it never lands in the
 * agent's general environment. Token needs scopes: w_member_social openid profile.
 * Optionally set LINKEDIN_URN to skip the /v2/userinfo lookup.
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const ACCESS_TOKEN = (process.env.LINKEDIN_ACCESS_TOKEN || "").trim();
let AUTHOR_URN = (process.env.LINKEDIN_URN || "").trim(); // cached after first derive
const RESTLI = "2.0.0";

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

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

const TOOL = {
  name: "publish_post",
  description:
    "Publish a post to LinkedIn (the configured member's feed) via the LinkedIn API. " +
    "PUBLISHING ONLY — for browsing, likes, comments, or DMs use the browser. " +
    "Posts text, optionally with up to 9 images. Images may be local file paths " +
    "(e.g. output from the gemini image tool) or http(s) URLs. The post goes out " +
    "immediately and is PUBLIC by default. Returns the post id and a permalink.",
  inputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The post body / commentary. Plain text; line breaks are preserved.",
      },
      images: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional local file paths or http(s) URLs to attach as images (max 9). " +
          "Local paths are read directly; URLs are downloaded then uploaded.",
      },
      visibility: {
        type: "string",
        description: "'PUBLIC' (default) or 'CONNECTIONS'.",
      },
    },
    required: ["text"],
  },
};

// --- LinkedIn helpers -----------------------------------------------------

async function getAuthorUrn() {
  if (AUTHOR_URN) return AUTHOR_URN;
  const resp = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  const body = await resp.text();
  if (!resp.ok) {
    const hint =
      resp.status === 401
        ? " (token invalid or expired)"
        : resp.status === 403
        ? " (token missing the openid/profile scopes)"
        : "";
    throw new Error(`Could not resolve LinkedIn author URN: ${resp.status}${hint} ${body.slice(0, 300)}`);
  }
  let sub;
  try {
    sub = JSON.parse(body).sub;
  } catch {
    throw new Error(`Could not parse /v2/userinfo response: ${body.slice(0, 200)}`);
  }
  if (!sub) throw new Error("LinkedIn /v2/userinfo returned no `sub` — cannot build author URN.");
  AUTHOR_URN = `urn:li:person:${sub}`;
  return AUTHOR_URN;
}

// Fetch image bytes from a local path or an http(s) URL; returns {buffer, contentType}.
async function loadImageBytes(src) {
  if (/^https?:\/\//i.test(src)) {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`Failed to fetch image ${src}: ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    return { buffer: buf, contentType: r.headers.get("content-type") || "image/png" };
  }
  const buf = await readFile(src);
  const contentType = MIME_BY_EXT[extname(src).toLowerCase()] || "image/png";
  return { buffer: buf, contentType };
}

// register upload -> upload binary -> return asset URN
async function uploadImage(src, ownerUrn) {
  const registerBody = {
    registerUploadRequest: {
      recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
      owner: ownerUrn,
      serviceRelationships: [
        { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
      ],
    },
  };
  const reg = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(registerBody),
  });
  if (!reg.ok) throw new Error(`registerUpload failed: ${reg.status} ${(await reg.text()).slice(0, 300)}`);
  const registration = await reg.json();
  const uploadUrl =
    registration?.value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]?.uploadUrl;
  const assetUrn = registration?.value?.asset;
  if (!uploadUrl || !assetUrn) throw new Error("registerUpload response missing uploadUrl/asset.");

  const { buffer, contentType } = await loadImageBytes(src);
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": contentType },
    body: buffer,
  });
  if (!up.ok) throw new Error(`image binary upload failed: ${up.status} ${(await up.text()).slice(0, 300)}`);
  return assetUrn;
}

function permalink(postId) {
  // ugcPosts returns ids like urn:li:share:123 or urn:li:ugcPost:123.
  return `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/`;
}

async function publishPost(args) {
  if (!ACCESS_TOKEN) {
    return {
      isError: true,
      text:
        "LINKEDIN_ACCESS_TOKEN is not set for the linkedin MCP server. Add it to the " +
        "server's env block in ~/.claude.json (scopes: w_member_social openid profile) " +
        "and restart the agent. Cannot publish without it.",
    };
  }

  const text = String(args.text || "").trim();
  if (!text) return { isError: true, text: "text is required and was empty." };

  const visibility = String(args.visibility || "PUBLIC").trim().toUpperCase();
  if (visibility !== "PUBLIC" && visibility !== "CONNECTIONS") {
    return { isError: true, text: "visibility must be 'PUBLIC' or 'CONNECTIONS'." };
  }

  let ownerUrn;
  try {
    ownerUrn = await getAuthorUrn();
  } catch (e) {
    return { isError: true, text: e.message };
  }

  // Upload images (best-effort per image, mirroring the source engine's behaviour).
  const mediaAssets = [];
  const skipped = [];
  const images = Array.isArray(args.images) ? args.images.slice(0, 9) : [];
  for (const src of images) {
    try {
      mediaAssets.push(await uploadImage(src, ownerUrn));
    } catch (e) {
      skipped.push(`${src} — ${e.message}`);
    }
  }

  const shareContent = {
    shareCommentary: { text },
    shareMediaCategory: mediaAssets.length > 0 ? "IMAGE" : "NONE",
  };
  if (mediaAssets.length > 0) {
    shareContent.media = mediaAssets.map((asset) => ({
      status: "READY",
      media: asset,
    }));
  }

  const postData = {
    author: ownerUrn,
    lifecycleState: "PUBLISHED",
    specificContent: { "com.linkedin.ugc.ShareContent": shareContent },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": visibility },
  };

  let resp;
  try {
    resp = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": RESTLI,
      },
      body: JSON.stringify(postData),
    });
  } catch (e) {
    return { isError: true, text: `Network error calling LinkedIn: ${e.message}` };
  }

  const bodyText = await resp.text();
  if (!resp.ok) {
    return { isError: true, text: `LinkedIn ugcPosts ${resp.status}: ${bodyText.slice(0, 800)}` };
  }

  let postId = resp.headers.get("x-restli-id") || "";
  try {
    postId = JSON.parse(bodyText).id || postId;
  } catch {
    /* keep header id */
  }

  const lines = [`Published to LinkedIn as ${ownerUrn} (${visibility}).`];
  if (postId) {
    lines.push(`Post id: ${postId}`, `Permalink: ${permalink(postId)}`);
  }
  if (mediaAssets.length) lines.push(`Images attached: ${mediaAssets.length}`);
  if (skipped.length) lines.push("", `Images skipped (${skipped.length}):`, ...skipped.map((s) => `  ${s}`));
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
        serverInfo: { name: "linkedin", version: "1.0.0" },
      });
      return;
    case "notifications/initialized":
      return; // notification, no response
    case "ping":
      result(id, {});
      return;
    case "tools/list":
      result(id, { tools: [TOOL] });
      return;
    case "tools/call": {
      if (params?.name !== TOOL.name) {
        rpcError(id, -32602, `Unknown tool: ${params?.name}`);
        return;
      }
      const out = await publishPost(params.arguments || {});
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
      continue; // ignore non-JSON lines
    }
    Promise.resolve(handle(msg)).catch((e) => {
      if (msg && msg.id !== undefined) rpcError(msg.id, -32603, `Internal error: ${e.message}`);
    });
  }
});
process.stdin.on("end", () => process.exit(0));
