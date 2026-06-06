/**
 * HTTPS listener for ClickUp webhooks (PRD §4.1). Captures the raw body for
 * HMAC verification, verifies `X-Signature`, **acks 200 immediately**, then
 * hands the event to the dispatcher off the request path so the ack stays fast.
 *
 * Public TLS is terminated at Cloudflare (SSL mode "Full"); this origin serves
 * a self-signed cert. The HMAC check — not the transport — is the authenticity
 * control, so a self-signed origin is fine.
 */

import { readFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { PORT, SERVER_TLS, TLS_CERT_PATH, TLS_KEY_PATH, WEBHOOK_PATH } from "../config.js";
import { dispatch } from "../dispatch/dispatcher.js";
import { getWebhookSecret } from "../state/webhooks.js";
import { verifySignature } from "./signature.js";

const MAX_BODY = 5_000_000; // 5 MB guard

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "POST" && req.url === WEBHOOK_PATH) {
    let raw: Buffer;
    try {
      raw = await readBody(req);
    } catch {
      res.writeHead(413);
      res.end();
      return;
    }

    const secret = await getWebhookSecret();
    const sigHeader = req.headers["x-signature"];
    const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!verifySignature(raw, sig, secret)) {
      res.writeHead(401, { "content-type": "text/plain" });
      res.end("bad signature");
      return;
    }

    // Authentic — ack immediately, then process off the request path.
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");

    let ev: unknown;
    try {
      ev = JSON.parse(raw.toString("utf8"));
    } catch {
      console.error("[http] valid signature but unparseable JSON body");
      return;
    }
    setImmediate(() => {
      dispatch(ev as Parameters<typeof dispatch>[0]).catch((e) =>
        console.error("[http] dispatch error:", (e as Error).message),
      );
    });
    return;
  }

  res.writeHead(404);
  res.end();
}

export function startServer(): Server {
  const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
    handle(req, res).catch((e) => {
      console.error("[http] handler error:", (e as Error).message);
      try {
        res.writeHead(500);
        res.end();
      } catch {
        /* response already sent */
      }
    });
  };

  let server: Server;
  if (SERVER_TLS) {
    let cert: Buffer;
    let key: Buffer;
    try {
      cert = readFileSync(TLS_CERT_PATH);
      key = readFileSync(TLS_KEY_PATH);
    } catch (err) {
      throw new Error(
        `Could not read TLS cert/key (${TLS_CERT_PATH}, ${TLS_KEY_PATH}): ${(err as Error).message}. ` +
          "Generate a self-signed cert into data/tls/ first, or set SERVER_TLS=false behind a tunnel.",
      );
    }
    server = createHttpsServer({ cert, key }, onRequest);
  } else {
    // Behind a Cloudflare Tunnel: plain HTTP on loopback; cloudflared handles public TLS.
    server = createHttpServer(onRequest);
  }

  const scheme = SERVER_TLS ? "HTTPS" : "HTTP";
  server.listen(PORT, () => console.log(`[http] ${scheme} listening on :${PORT} (POST ${WEBHOOK_PATH})`));
  return server;
}
