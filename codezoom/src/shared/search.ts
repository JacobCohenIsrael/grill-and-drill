// Name matching for the Jump search box, the row filters and the CLI
// argument. A query matches by substring, or by word pieces: "CA" and
// "CampAp" both find CampaignApplication.

import type { NodeInfo } from "./types.js";

export function simpleName(n: NodeInfo): string {
  return n.name.replace(/<.*$/, "").split(".").pop() ?? n.name;
}

/** The words of a name: CampaignApplication -> Campaign, Application; HUDView -> HUD, View. */
function words(name: string): string[] {
  return (name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+/g) ?? []).map((w) => w.toLowerCase());
}

/** The pieces of a query, one per word it names: "CampAp" -> camp, ap; "CA" -> c, a. */
function pieces(query: string): string[] {
  return (query.match(/[A-Z][a-z0-9]*|[a-z0-9]+/g) ?? []).map((p) => p.toLowerCase());
}

/** Each piece starts a word, in order, from the first word on with none skipped. */
function fromStart(ws: string[], ps: string[]): boolean {
  return ps.length > 0 && ps.length <= ws.length && ps.every((p, i) => ws[i].startsWith(p));
}

/** Each piece starts a word, in order; words may be skipped. */
function inOrder(ws: string[], ps: string[], w = 0, p = 0): boolean {
  if (p === ps.length) return true;
  for (let i = w; i < ws.length; i++) if (ws[i].startsWith(ps[p]) && inOrder(ws, ps, i + 1, p + 1)) return true;
  return false;
}

/** Ways to read a query as word pieces. All lower case also reads as initials: "bs" -> b, s. */
function readings(query: string): string[][] {
  const ps = pieces(query);
  const result = ps.length ? [ps] : [];
  if (query.length >= 2 && /^[a-z0-9]+$/.test(query)) result.push([...query]);
  return result;
}

/** 0: the pieces start the name's words from the first; 1: they start words in order; -1: no match. */
function wordMatch(name: string, query: string): number {
  const ws = words(name);
  const rs = readings(query);
  if (rs.some((ps) => fromStart(ws, ps))) return 0;
  if (rs.some((ps) => inOrder(ws, ps))) return 1;
  return -1;
}

/** The row filter: substring of the name or full name, or word pieces of the name. */
export function matchesName(n: NodeInfo, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const ql = q.toLowerCase();
  return n.name.toLowerCase().includes(ql) || n.full.toLowerCase().includes(ql) || wordMatch(n.name, q) >= 0;
}

function tier(n: NodeInfo, q: string, ql: string): number {
  const simple = simpleName(n);
  const sl = simple.toLowerCase();
  if (sl === ql || n.full.toLowerCase() === ql) return 0;
  // "CA" or "CampAp" names several words: that reading beats a plain prefix (CameraRig)
  const severalWords = pieces(q).length > 1;
  if (sl.startsWith(ql)) return severalWords && wordMatch(simple, q) !== 0 ? 2 : 1;
  if (wordMatch(simple, q) === 0) return severalWords ? 1 : 2;
  if (wordMatch(n.name, q) >= 0) return 3;
  if (n.name.toLowerCase().includes(ql)) return 4;
  if (n.full.toLowerCase().includes(ql)) return 5;
  return -1;
}

export function search(nodes: NodeInfo[], query: string, limit = 50): NodeInfo[] {
  const q = query.trim();
  if (!q) return [];
  const ql = q.toLowerCase();
  const scored: { n: NodeInfo; t: number }[] = [];
  for (const n of nodes) {
    const t = tier(n, q, ql);
    if (t >= 0) scored.push({ n, t });
  }
  scored.sort((a, b) => a.t - b.t || b.n.dependents - a.n.dependents || a.n.name.localeCompare(b.n.name));
  return scored.slice(0, limit).map((s) => s.n);
}

/** The node a CLI argument names: one when it is unambiguous, else the candidates. */
export function findFocus(nodes: NodeInfo[], query: string): NodeInfo[] {
  const exact = nodes.filter((n) => n.id === query || n.full === query || simpleName(n) === query);
  if (exact.length) return exact;
  const ql = query.toLowerCase();
  const loose = nodes.filter((n) => simpleName(n).toLowerCase() === ql || n.full.toLowerCase().endsWith("." + ql));
  if (loose.length) return loose;
  const results = search(nodes, query);
  const best = results.filter((n) => tier(n, query, ql) <= 1);
  return best.length === 1 ? best : results;
}
