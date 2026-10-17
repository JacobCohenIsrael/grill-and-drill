// Talks to the local server. Screens are cached and preloaded so a move
// never waits for the network (ADR 0004).

import type { Meta, Screen, SetupData } from "../../src/shared/types";
import type { Config } from "../../src/shared/ownRules";
import { highlightLines } from "./highlight";

const cache = new Map<string, Screen>();
const pending = new Map<string, Promise<void>>();

export async function loadMeta(): Promise<Meta> {
  const res = await fetch("/api/meta");
  if (!res.ok) throw new Error(`meta: ${res.status}`);
  return res.json();
}

export function cachedScreen(id: string): Screen | undefined {
  return cache.get(id);
}

/** Loads the screens not yet cached, in batches. */
export async function loadScreens(ids: string[]): Promise<void> {
  const missing = [...new Set(ids)].filter((id) => !cache.has(id) && !pending.has(id));
  for (let i = 0; i < missing.length; i += 200) {
    const batch = missing.slice(i, i + 200);
    const p = fetch("/api/screens", { method: "POST", body: JSON.stringify(batch) })
      .then((r) => r.json())
      .then((obj: Record<string, Screen>) => {
        for (const [k, v] of Object.entries(obj)) cache.set(k, v);
      })
      .finally(() => batch.forEach((id) => pending.delete(id)));
    for (const id of batch) pending.set(id, p);
  }
  await Promise.all(ids.map((id) => pending.get(id)).filter(Boolean));
}

export interface Source {
  path: string;
  /** One HTML string per line, already highlighted. */
  lines: string[];
}

/** Forgets every screen and source: the index changed. */
export function clearCaches() {
  cache.clear();
  sources.clear();
}

/** Calls back each time the server has rebuilt the index (files changed). */
export function onIndexUpdate(callback: (event: { version: number; changed: string[]; reason: "files" | "setup" }) => void): () => void {
  const events = new EventSource("/api/events");
  events.addEventListener("index", (e) => callback(JSON.parse((e as MessageEvent).data)));
  return () => events.close();
}

const sources = new Map<string, Promise<Source>>();

/** An own-code file's text, highlighted; kept until the index changes. */
export function loadSource(file: string): Promise<Source> {
  let p = sources.get(file);
  if (!p) {
    p = fetch(`/api/source?path=${encodeURIComponent(file)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`source: ${r.status}`);
        return r.json() as Promise<{ path: string; text: string }>;
      })
      .then(({ path, text }) => ({ path, lines: highlightLines(text) }));
    p.catch(() => sources.delete(file));
    sources.set(file, p);
  }
  return p;
}

/** Asks the server to open the file at the line in the editor (Rider). */
export async function openInEditor(path: string, line: number): Promise<boolean> {
  const r = await fetch("/api/open", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Codezoom": "1" },
    body: JSON.stringify({ path, line }),
  });
  return r.ok;
}

export async function loadSetup(): Promise<SetupData> {
  const r = await fetch("/api/setup");
  if (!r.ok) throw new Error(`setup: ${r.status}`);
  return r.json();
}

/** Writes codezoom.config.json and re-indexes; resolves with the new type count. */
export async function saveSetup(config: Config): Promise<{ types: number }> {
  const r = await fetch("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Codezoom": "1" },
    body: JSON.stringify(config),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
