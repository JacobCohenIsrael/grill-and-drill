// Talks to the local server. Screens are cached and preloaded so a move
// never waits for the network (ADR 0004).

import type { Meta, Screen } from "../../src/shared/types";

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
