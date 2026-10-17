// Local HTTP server, bound to 127.0.0.1 only. Serves the page and the
// precomputed screens.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import type { Screens } from "./graph/screens.js";

const WEB_ROOT = fileURLToPath(new URL("../web/", import.meta.url));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

export interface Running {
  server: Server;
  port: number;
}

export async function startServer(screens: Screens, preferredPort: number): Promise<Running> {
  if (!existsSync(join(WEB_ROOT, "index.html"))) {
    throw new Error(`page not built: run "npm run build" in the codezoom folder (looked in ${WEB_ROOT})`);
  }
  const metaBody = gzipSync(JSON.stringify(screens.meta));

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = decodeURIComponent(url.pathname);
    if (path === "/api/meta") return send(res, 200, TYPES[".json"], metaBody, true);
    if (path === "/api/screens" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let ids: unknown;
        try {
          ids = JSON.parse(body);
        } catch {
          return send(res, 400, "text/plain", "bad json");
        }
        if (!Array.isArray(ids)) return send(res, 400, "text/plain", "expected an array of ids");
        const parts: string[] = [];
        for (const id of ids) {
          const s = typeof id === "string" ? screens.json.get(id) : undefined;
          if (s) parts.push(`${JSON.stringify(id)}:${s}`);
        }
        send(res, 200, TYPES[".json"], `{${parts.join(",")}}`);
      });
      return;
    }
    if (path.startsWith("/api/")) return send(res, 404, "text/plain", "not found");
    // the page: every Focus has its own URL under /n/
    const file = path === "/" || path.startsWith("/n/") ? "index.html" : normalize(path).replace(/^([/\\])+/, "");
    const full = join(WEB_ROOT, file);
    if (!full.startsWith(WEB_ROOT) || !existsSync(full)) return send(res, 404, "text/plain", "not found");
    send(res, 200, TYPES[extname(full)] ?? "application/octet-stream", readFileSync(full));
  };

  const server = createServer(handler);
  for (let port = preferredPort; port < preferredPort + 20; port++) {
    const ok = await new Promise<boolean>((resolve) => {
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => resolve(true));
    });
    if (ok) return { server, port };
  }
  throw new Error(`no free port from ${preferredPort} to ${preferredPort + 19}`);
}

function send(res: ServerResponse, status: number, type: string, body: string | Buffer, gzipped = false) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    ...(gzipped ? { "Content-Encoding": "gzip" } : {}),
  });
  res.end(body);
}
