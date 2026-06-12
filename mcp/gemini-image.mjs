#!/usr/bin/env node
/**
 * Gemini image-generation MCP server (stdio, zero-dependency).
 *
 * Why this exists: Aso needs to *make* images (Canva has been unreliable). This
 * exposes Google's Gemini image models as a single MCP tool the headless agent
 * can call. It is registered as a user-scope MCP server in ~/.claude.json exactly
 * like `browser`/`browser-daemon`, so every `claude -p` wake inherits it.
 *
 * Protocol: MCP over stdio is newline-delimited JSON-RPC 2.0. Node 22 ships a
 * global `fetch`, so no SDK or npm install is needed — that keeps this off the
 * project's dependency tree and trivially auditable.
 *
 * Auth: GEMINI_API_KEY is supplied via the `env` block of the MCP server config
 * (NOT the app's process env), so it never lands in the agent's general environment.
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const IMAGE_DIR = process.env.GEMINI_IMAGE_DIR
  ? resolve(process.env.GEMINI_IMAGE_DIR)
  : resolve(REPO_ROOT, "data", "images");

// Friendly aliases → real model ids. Flash is the default; pro is opt-in only.
const MODELS = {
  flash: "gemini-3.1-flash-image",
  pro: "gemini-3-pro-image",
};
const DEFAULT_MODEL = MODELS.flash;

function resolveModel(input) {
  if (!input) return DEFAULT_MODEL;
  const key = String(input).trim().toLowerCase();
  if (MODELS[key]) return MODELS[key];
  // Accept a full model id verbatim (forward-compatible with new releases).
  return String(input).trim();
}

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const EXT_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
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
  name: "generate_image",
  description:
    "Generate (or edit) an image with Google's Gemini image models and save it to disk. " +
    "Returns the saved file path(s); attach them to ClickUp/chat as needed. " +
    "Default model is gemini-3.1-flash-image (fast, cheap). The pro model " +
    "(gemini-3-pro-image) is higher quality but slower/costlier — only pass model:'pro' " +
    "when the request explicitly calls for the best quality. Pass input_images (local " +
    "file paths) to edit or composite existing images instead of generating from scratch.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "What to draw, or how to edit the supplied input_images. Be specific.",
      },
      model: {
        type: "string",
        description:
          "'flash' (default, gemini-3.1-flash-image) or 'pro' (gemini-3-pro-image, only if best quality is requested). A full model id is also accepted.",
      },
      aspect_ratio: {
        type: "string",
        description: "Optional, e.g. '1:1', '16:9', '9:16', '4:3', '3:4'. Omit for the model default.",
      },
      input_images: {
        type: "array",
        items: { type: "string" },
        description: "Optional local file paths to use as source images (for editing/compositing).",
      },
      filename_prefix: {
        type: "string",
        description: "Optional slug for the saved filename (default 'gemini-image').",
      },
    },
    required: ["prompt"],
  },
};

// --- image generation -----------------------------------------------------

async function loadInputImages(paths) {
  const parts = [];
  for (const p of paths) {
    const abs = resolve(p);
    const mime = MIME_BY_EXT[extname(abs).toLowerCase()] || "image/png";
    const buf = await readFile(abs);
    parts.push({ inline_data: { mime_type: mime, data: buf.toString("base64") } });
  }
  return parts;
}

async function generateImage(args) {
  if (!API_KEY) {
    return {
      isError: true,
      text:
        "GEMINI_API_KEY is not set for the gemini MCP server. Add it to the server's env " +
        "block in ~/.claude.json and restart the agent. Cannot generate images without it.",
    };
  }

  const prompt = String(args.prompt || "").trim();
  if (!prompt) return { isError: true, text: "prompt is required and was empty." };

  const model = resolveModel(args.model);
  const parts = [{ text: prompt }];
  if (Array.isArray(args.input_images) && args.input_images.length > 0) {
    try {
      parts.push(...(await loadInputImages(args.input_images)));
    } catch (e) {
      return { isError: true, text: `Could not read an input image: ${e.message}` };
    }
  }

  const generationConfig = { responseModalities: ["TEXT", "IMAGE"] };
  if (args.aspect_ratio) {
    // Image-shape config; only sent when explicitly requested so default calls
    // stay on the most stable request shape.
    generationConfig.imageConfig = { aspectRatio: String(args.aspect_ratio).trim() };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify({ contents: [{ parts }], generationConfig }),
    });
  } catch (e) {
    return { isError: true, text: `Network error calling Gemini: ${e.message}` };
  }

  const bodyText = await resp.text();
  if (!resp.ok) {
    return { isError: true, text: `Gemini API ${resp.status}: ${bodyText.slice(0, 800)}` };
  }

  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return { isError: true, text: `Could not parse Gemini response: ${bodyText.slice(0, 400)}` };
  }

  const candidate = data?.candidates?.[0];
  const respParts = candidate?.content?.parts || [];
  const imageParts = respParts.filter((p) => p.inline_data || p.inlineData);
  const textParts = respParts.filter((p) => typeof p.text === "string").map((p) => p.text);

  if (imageParts.length === 0) {
    const block = candidate?.finishReason || data?.promptFeedback?.blockReason || "no image returned";
    const note = textParts.join(" ").trim();
    return {
      isError: true,
      text: `Gemini returned no image (${block}). ${note}`.trim(),
    };
  }

  await mkdir(IMAGE_DIR, { recursive: true });
  const slug = (String(args.filename_prefix || "gemini-image").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "gemini-image");
  // Counter + pid keep filenames unique without Date.now() flakiness across calls.
  const stamp = `${process.pid}-${++generateImage._n}`;
  const saved = [];
  for (let i = 0; i < imageParts.length; i++) {
    const inline = imageParts[i].inline_data || imageParts[i].inlineData;
    const mime = inline.mime_type || inline.mimeType || "image/png";
    const ext = EXT_BY_MIME[mime] || "png";
    const suffix = imageParts.length > 1 ? `-${i + 1}` : "";
    const file = resolve(IMAGE_DIR, `${slug}-${stamp}${suffix}.${ext}`);
    await writeFile(file, Buffer.from(inline.data, "base64"));
    saved.push(file);
  }

  const lines = [
    `Generated ${saved.length} image(s) with ${model}:`,
    ...saved.map((f) => `  ${f}`),
  ];
  if (textParts.length) lines.push("", `Model note: ${textParts.join(" ").trim()}`);
  return { isError: false, text: lines.join("\n") };
}
generateImage._n = 0;

// --- request dispatch -----------------------------------------------------

async function handle(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      result(id, {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "gemini-image", version: "1.0.0" },
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
      const out = await generateImage(params.arguments || {});
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
