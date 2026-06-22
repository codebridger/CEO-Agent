#!/usr/bin/env node
/**
 * WordPress media MCP server (stdio, zero-dependency).
 *
 * Why this exists: the claude.ai WordPress.com MCP can only upload media as an
 * inline base64 blob. Base64 tokenises at ~3-4 tokens/char, so a normal featured
 * image (~58KB) is ~260K tokens for the agent to emit over slow MCP round-trips —
 * which is why every blog featured-image attempt timed out. It also rides the
 * claude.ai connector's intermittent headless-OAuth bug.
 *
 * This MCP sidesteps both: it talks to the site's own WordPress REST API with an
 * application password (Basic auth) and uploads the image BYTES directly from a
 * file path. The bytes never enter the agent's token stream — the agent just
 * passes a path. MEDIA ONLY — post text/category/tags/publish stay on the
 * claude.ai WordPress.com MCP (those are cheap text calls).
 *
 * Protocol: MCP over stdio, newline-delimited JSON-RPC 2.0. Node 22's global
 * `fetch`, no SDK — same zero-dependency shape as social-engine.mjs.
 *
 * Config (in the server's `env` block in ~/.claude.json, never the app env):
 *   WORDPRESS_API_URL       wp-json root, e.g. https://blog.subturtle.app/wp-json
 *   WORDPRESS_APP_USER      the WordPress username the app password belongs to
 *   WORDPRESS_APP_PASSWORD  an application password (wp-admin -> Users -> Profile)
 */

import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";

const API_URL = (process.env.WORDPRESS_API_URL || "https://blog.subturtle.app/wp-json").trim().replace(/\/+$/, "");
const APP_USER = (process.env.WORDPRESS_APP_USER || "").trim();
const APP_PASSWORD = (process.env.WORDPRESS_APP_PASSWORD || "").trim();

// Site root (drop the trailing /wp-json) for building admin/preview links.
const SITE_ROOT = API_URL.replace(/\/wp-json$/, "");

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
    name: "set_featured_image",
    description:
      "Set the featured image of a WordPress post on blog.subturtle.app from a LOCAL FILE PATH. " +
      "This uploads the image binary directly — do NOT base64-encode or shrink it, and do NOT use the " +
      "claude.ai WordPress media.create tool (that path blows the token/time budget). Give the post id " +
      "and the path to the image on disk (e.g. a Gemini hero in data/images/). Returns the media id, the " +
      "image URL, and the post's edit/preview links. Keeps the post's current status (it does not publish).",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "integer", description: "The WordPress post id to set the featured image on (e.g. 474)." },
        file_path: { type: "string", description: "Absolute or cwd-relative path to the image file on this machine." },
        alt_text: { type: "string", description: "Alt text for accessibility (strongly recommended)." },
        title: { type: "string", description: "Optional media library title; defaults to the filename." },
      },
      required: ["post_id", "file_path"],
    },
  },
  {
    name: "upload_media",
    description:
      "Upload an image from a LOCAL FILE PATH to the WordPress media library on blog.subturtle.app and " +
      "return its media id and URL — without attaching it to any post. Uploads the binary directly (no " +
      "base64, no shrinking). Use this for inline post images; use set_featured_image to also set a post's " +
      "featured image.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute or cwd-relative path to the image file on this machine." },
        alt_text: { type: "string", description: "Alt text for accessibility (strongly recommended)." },
        title: { type: "string", description: "Optional media library title; defaults to the filename." },
      },
      required: ["file_path"],
    },
  },
];

// --- WordPress REST calls --------------------------------------------------

function configError() {
  return {
    isError: true,
    text:
      "WordPress MCP is not configured. Set WORDPRESS_APP_USER and WORDPRESS_APP_PASSWORD (and optionally " +
      "WORDPRESS_API_URL) in the server's env block in ~/.claude.json and restart the agent. Generate an " +
      "application password at " + SITE_ROOT + "/wp-admin/authorize-application.php.",
  };
}

function authHeader() {
  return "Basic " + Buffer.from(`${APP_USER}:${APP_PASSWORD}`).toString("base64");
}

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function mimeFor(path) {
  return MIME_BY_EXT[extname(path).toLowerCase()] || "application/octet-stream";
}

async function wpFetch(method, path, { headers = {}, body } = {}) {
  const url = `${API_URL}${path}`;
  let resp;
  try {
    resp = await fetch(url, { method, headers: { Authorization: authHeader(), ...headers }, body });
  } catch (e) {
    return { ok: false, text: `Network error reaching WordPress: ${e.message}` };
  }
  const raw = await resp.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, text: `WordPress returned non-JSON (${resp.status}): ${raw.slice(0, 400)}` };
  }
  if (!resp.ok) {
    const msg = data?.message || raw.slice(0, 400);
    return { ok: false, text: `WordPress error (${resp.status}${data?.code ? ` ${data.code}` : ""}): ${msg}` };
  }
  return { ok: true, data };
}

/** Upload the file at `file_path` and (optionally) set its alt text / title. */
async function uploadFile(args) {
  const filePath = String(args.file_path || "").trim();
  if (!filePath) return { ok: false, text: "file_path is required and was empty." };

  let bytes;
  try {
    bytes = readFileSync(filePath);
  } catch (e) {
    return { ok: false, text: `Could not read file at ${filePath}: ${e.message}` };
  }
  const name = basename(filePath);
  const mime = mimeFor(filePath);

  const up = await wpFetch("POST", "/wp/v2/media", {
    headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename="${name}"` },
    body: bytes,
  });
  if (!up.ok) return up;
  const mediaId = up.data.id;
  const sourceUrl = up.data.source_url;

  // Set alt text / title in a follow-up JSON call (the upload body was the raw file).
  const meta = {};
  if (args.alt_text) meta.alt_text = String(args.alt_text);
  if (args.title) meta.title = String(args.title);
  if (Object.keys(meta).length) {
    const patch = await wpFetch("POST", `/wp/v2/media/${mediaId}`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });
    if (!patch.ok) {
      // The bytes are up; metadata is non-fatal. Report it but keep the media id.
      return { ok: true, mediaId, sourceUrl, warning: `uploaded, but setting alt/title failed: ${patch.text}` };
    }
  }
  return { ok: true, mediaId, sourceUrl };
}

async function uploadMedia(args) {
  if (!APP_USER || !APP_PASSWORD) return configError();
  const r = await uploadFile(args);
  if (!r.ok) return { isError: true, text: r.text };
  const lines = [`Uploaded to the media library.`, `Media id: ${r.mediaId}`, `URL: ${r.sourceUrl}`];
  if (r.warning) lines.push(`Note: ${r.warning}`);
  return { isError: false, text: lines.join("\n") };
}

async function setFeaturedImage(args) {
  if (!APP_USER || !APP_PASSWORD) return configError();
  const postId = Number(args.post_id);
  if (!Number.isInteger(postId)) return { isError: true, text: "post_id is required and must be an integer." };

  const r = await uploadFile(args);
  if (!r.ok) return { isError: true, text: r.text };

  const set = await wpFetch("POST", `/wp/v2/posts/${postId}`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ featured_media: r.mediaId }),
  });
  if (!set.ok) {
    return {
      isError: true,
      text: `Image uploaded (media id ${r.mediaId}, ${r.sourceUrl}) but setting it as the featured image of post ${postId} failed: ${set.text}`,
    };
  }

  const editUrl = `${SITE_ROOT}/wp-admin/post.php?post=${postId}&action=edit`;
  const previewUrl = `${SITE_ROOT}/?p=${postId}&preview=true`;
  const lines = [
    `Featured image set on post ${postId} (status unchanged: ${set.data.status}).`,
    `Media id: ${r.mediaId}`,
    `Image URL: ${r.sourceUrl}`,
    `Edit: ${editUrl}`,
    `Preview: ${previewUrl}`,
  ];
  if (r.warning) lines.push(`Note: ${r.warning}`);
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
        serverInfo: { name: "wordpress", version: "1.0.0" },
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
      if (name === "set_featured_image") out = await setFeaturedImage(params.arguments || {});
      else if (name === "upload_media") out = await uploadMedia(params.arguments || {});
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
