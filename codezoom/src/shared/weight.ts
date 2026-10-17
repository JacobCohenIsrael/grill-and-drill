// Box sizes from Weight: a dependency the Focus leans on more draws bigger,
// so the dominant ones stand out. Shared by the page and the diagnostics.

import type { Neighbour } from "./types.js";

export type BoxSize = "large" | "medium" | "small";

// ---- thresholds: tune by eye --------------------------------------------
/** Large from this share of the heaviest own-code Weight in the row. */
export const LARGE_SHARE = 1 / 2;
/** Medium from this share; small below it. */
export const MEDIUM_SHARE = 1 / 5;
/** When the heaviest own-code Weight in a row is at most this, nothing dominates: all medium. */
export const FLAT_ROW_MAX = 2;
// -------------------------------------------------------------------------

export type Row = "dependents" | "dependencies";

/**
 * The size of each box in a row, in the row's order. Foreign libraries are
 * always small and do not count toward the row's heaviest Weight. A base
 * class (the target of Inherits, so only in the Dependencies row) is never small.
 */
export function sizeRow(items: Neighbour[], row: Row, isLibrary: (id: string) => boolean): BoxSize[] {
  let max = 0;
  for (const n of items) if (!isLibrary(n.id) && n.weight > max) max = n.weight;
  return items.map((n) => {
    if (isLibrary(n.id)) return "small";
    let size: BoxSize = max <= FLAT_ROW_MAX ? "medium" : n.weight >= max * LARGE_SHARE ? "large" : n.weight >= max * MEDIUM_SHARE ? "medium" : "small";
    if (size === "small" && row === "dependencies" && n.edge === "inherits") size = "medium";
    return size;
  });
}

const RANK: Record<BoxSize, number> = { large: 0, medium: 1, small: 2 };

/**
 * Row order: the previous Focus pinned first, then large, medium, small.
 * Within a size the index's order holds: namespace distance, Weight, name.
 */
export function orderBySize<T extends { n: Neighbour; size: BoxSize }>(items: T[], previousId: string | null): T[] {
  const sorted = items.map((item, i) => ({ item, i })).sort((a, b) => RANK[a.item.size] - RANK[b.item.size] || a.i - b.i);
  const out = sorted.map((s) => s.item);
  const pin = previousId ? out.findIndex((s) => s.n.id === previousId) : -1;
  return pin > 0 ? [out[pin], ...out.slice(0, pin), ...out.slice(pin + 1)] : out;
}
