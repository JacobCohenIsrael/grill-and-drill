// Local HTTP server, bound to 127.0.0.1 only. Serves the page, the
// precomputed screens, own-code source files, and "Open in Rider".

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import type { Screens } from "./graph/screens.js";
import type { Config } from "./shared/ownRules.js";
import type { SetupData } from "./shared/types.js";
import { openInEditor, type Editor } from "./editor.js";

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
  /** Serves a new index and tells open pages about it. */
  update(screens: Screens, changed: string[], reason: IndexEvent["reason"]): void;
}

/** What an "index" event tells the page. */
export interface IndexEvent {
  version: number;
  changed: string[];
  /** "files": files changed while open. "setup": the setup page saved a new config. */
  reason: "files" | "setup";
}

/** The setup page's two calls, answered by whoever owns the config and the index. */
export interface SetupHooks {
  describe(): Promise<SetupData>;
  /** Writes the config and re-indexes; resolves with the new type count. */
  save(config: Config): Promise<{ types: number }>;
}

export async function startServer(
  screens: Screens,
  preferredPort: number,
  root: string,
  editor: Editor | null,
  setup: SetupHooks,
): Promise<Running> {
  if (!existsSync(join(WEB_ROOT, "index.html"))) {
    throw new Error(`page not built: run "npm run build" in the codezoom folder (looked in ${WEB_ROOT})`);
  }
  // the index being served; replaced whole when files change
  let version = 1;
  const serve = (next: Screens) => ({
    screens: next,
    metaBody: gzipSync(JSON.stringify({ ...next.meta, editor: editor?.name ?? null, version })),
    known: new Set(next.meta.files),
  });
  let current = serve(screens);
  const listeners = new Set<ServerResponse>();
  let port = preferredPort;
  /** Only files the index knows: a page may name one from an older version of the index. */
  const fileAt = (p: unknown) => (typeof p === "string" && current.known.has(p) ? p : undefined);

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith("/api/") && !isLocalHost(req.headers.host, port)) return send(res, 403, "text/plain", "forbidden");
    if (path === "/api/meta") return send(res, 200, TYPES[".json"], current.metaBody, true);
    if (path === "/api/events") {
      // the page hears about a new index here (server-sent events)
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write("retry: 3000\n\n");
      listeners.add(res);
      req.on("close", () => listeners.delete(res));
      return;
    }
    if (path === "/api/source") {
      const file = fileAt(url.searchParams.get("path"));
      if (!file) return send(res, 404, "text/plain", "not an indexed file");
      readFile(join(root, file), "utf8").then(
        (text) => send(res, 200, TYPES[".json"], JSON.stringify({ path: file, text: text.replace(/^\uFEFF/, "") })),
        () => send(res, 404, "text/plain", "file not found"),
      );
      return;
    }
    if (path === "/api/setup" && req.method === "GET") {
      setup.describe().then(
        (data) => send(res, 200, TYPES[".json"], JSON.stringify(data)),
        (e) => send(res, 500, "text/plain", String(e)),
      );
      return;
    }
    if (path === "/api/setup" && req.method === "POST") {
      // writes a file in the project: same guard as /api/open
      if (req.headers["x-codezoom"] !== "1") return send(res, 403, "text/plain", "forbidden");
      readBody(req).then(async (body) => {
        const config = asConfig(body);
        if (!config) return send(res, 400, "text/plain", "bad config");
        try {
          send(res, 200, TYPES[".json"], JSON.stringify(await setup.save(config)));
        } catch (e) {
          send(res, 500, "text/plain", e instanceof Error ? e.message : String(e));
        }
      });
      return;
    }
    if (path === "/api/open" && req.method === "POST") {
      // a custom header: a page on another site cannot send it without our consent
      if (req.headers["x-codezoom"] !== "1") return send(res, 403, "text/plain", "forbidden");
      readBody(req).then(async (body) => {
        const { path: file, line } = (body ?? {}) as { path?: unknown; line?: unknown };
        const rel = fileAt(file);
        if (!rel || typeof line !== "number" || !Number.isInteger(line) || line < 1) return send(res, 400, "text/plain", "bad request");
        if (!editor) return send(res, 409, "text/plain", "no editor found");
        const ok = await openInEditor(editor, join(root, rel), line);
        send(res, ok ? 200 : 500, TYPES[".json"], JSON.stringify({ ok, editor: editor.name }));
      });
      return;
    }
    if (path === "/api/screens" && req.method === "POST") {
      readBody(req).then((ids) => {
        if (!Array.isArray(ids)) return send(res, 400, "text/plain", "expected an array of ids");
        const parts: string[] = [];
        for (const id of ids) {
          const s = typeof id === "string" ? current.screens.json.get(id) : undefined;
          if (s) parts.push(`${JSON.stringify(id)}:${s}`);
        }
        send(res, 200, TYPES[".json"], `{${parts.join(",")}}`);
      });
      return;
    }
    if (path.startsWith("/api/")) return send(res, 404, "text/plain", "not found");
    // the page: every Focus has its own URL under /n/, and setup is /setup
    const file = path === "/" || path === "/setup" || path.startsWith("/n/") ? "index.html" : normalize(path).replace(/^([/\\])+/, "");
    const full = join(WEB_ROOT, file);
    if (!full.startsWith(WEB_ROOT) || !existsSync(full)) return send(res, 404, "text/plain", "not found");
    send(res, 200, TYPES[extname(full)] ?? "application/octet-stream", readFileSync(full));
  };

  const server = createServer(handler);
  for (; port < preferredPort + 20; port++) {
    const ok = await new Promise<boolean>((resolve) => {
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => resolve(true));
    });
    if (ok) {
      // keeps idle connections open through proxies and sleep
      setInterval(() => listeners.forEach((l) => l.write(": ping\n\n")), 30_000).unref();
      const update = (next: Screens, changed: string[], reason: IndexEvent["reason"]) => {
        version++;
        current = serve(next);
        const event: IndexEvent = { version, changed, reason };
        for (const l of listeners) l.write(`event: index\ndata: ${JSON.stringify(event)}\n\n`);
      };
      return { server, port, update };
    }
  }
  throw new Error(`no free port from ${preferredPort} to ${preferredPort + 19}`);
}

/** Only lists of strings: whatever else arrives is not written to disk. */
function asConfig(body: unknown): Config | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null);
  const assemblies = list(b.assemblies);
  const excluded = list(b.excluded);
  const excludeFolders = list(b.excludeFolders ?? []);
  const includeFolders = list(b.includeFolders ?? []);
  if (!assemblies || !excluded || !excludeFolders || !includeFolders) return null;
  return { assemblies, excluded, excludeFolders, includeFolders };
}

/** Requests must name this server, so a rebinding DNS name cannot reach the API. */
function isLocalHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(null);
      }
    });
  });
}

function send(res: ServerResponse, status: number, type: string, body: string | Buffer, gzipped = false) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    ...(gzipped ? { "Content-Encoding": "gzip" } : {}),
  });
  res.end(body);
}
