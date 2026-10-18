// Golden walks: a written-down sequence of moves through a project, with the
// neighbours each screen must (and must not) show. `codezoom walk <file>`
// replays one against the index and says which screens differ.
//
// Walk file (JSON):
//   {
//     "name": "Towers and their config",            // optional
//     "start": "TinyTowers.Towers.Tower",           // like the CLI argument: one node
//     "expect": { ...screen },                      // optional, for the start screen
//     "steps": [
//       { "drill": "TowerConfig", "expect": { ...screen } },  // a neighbour on the screen
//       { "back": true,           "expect": { ...screen } },  // the previous Focus
//       { "jump": "WSp",          "expect": { ...screen } }   // the first search result
//     ]
//   }
//   screen = {
//     "focus": "Tower",                              // optional
//     "dependents":   [ "BuildGrid", { "name": "TowerConfig", "cycle": true } ],
//     "dependencies": [ { "name": "ITargetable", "edge": "has", "size": "large" } ],
//     "absent": { "dependents": [ ... ], "dependencies": [ ... ] }
//   }
// Listed neighbours must be in that row; absent ones must not. Edge kind
// (inherits, implements, has, uses; from an asset: inherits, instance of,
// contains, assigns, calls), size (small, medium, large) and cycle
// are checked only where given. Anything unlisted is allowed. Names match a
// node's id, full name, shown name or simple name, the row's own nodes first.

import type { Screens } from "./graph/screens.js";
import { findFocus, search, simpleName } from "./shared/search.js";
import type { EdgeKind, Neighbour, NodeInfo, Screen } from "./shared/types.js";
import { sizeRow, type BoxSize, type Row } from "./shared/weight.js";

export interface NeighbourExpectation {
  name: string;
  edge?: EdgeKind;
  size?: BoxSize;
  cycle?: boolean;
}

export interface ScreenExpectation {
  focus?: string;
  /** A plain name stands for { name }. */
  dependents?: (NeighbourExpectation | string)[];
  dependencies?: (NeighbourExpectation | string)[];
  absent?: { dependents?: string[]; dependencies?: string[] };
}

export type Step = ({ drill: string } | { back: true } | { jump: string }) & { expect?: ScreenExpectation };

export interface Walk {
  name?: string;
  start: string;
  expect?: ScreenExpectation;
  steps: Step[];
}

export interface StepResult {
  /** "start", "drill X", "back", "jump X". */
  move: string;
  /** The Focus the step landed on, if it got anywhere. */
  focus: string | null;
  problems: string[];
}

const EDGES: EdgeKind[] = ["inherits", "implements", "has", "uses", "instance of", "contains", "assigns", "calls"];
const SIZES: BoxSize[] = ["small", "medium", "large"];
const ROWS: Row[] = ["dependents", "dependencies"];
const TITLE: Record<Row, string> = { dependents: "Dependents", dependencies: "Dependencies" };

/** Reads and checks a walk file; throws with the line to fix. */
export function parseWalk(text: string): Walk {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`not JSON: ${e instanceof Error ? e.message : e}`);
  }
  const w = object(raw, "walk", ["name", "start", "expect", "steps"]);
  if (typeof w.start !== "string") throw new Error(`"start" must name the first Focus`);
  if (!Array.isArray(w.steps)) throw new Error(`"steps" must be a list (it may be empty)`);
  return {
    name: w.name === undefined ? undefined : string(w.name, "name"),
    start: w.start,
    expect: w.expect === undefined ? undefined : screenExpectation(w.expect, "expect"),
    steps: w.steps.map((s, i) => {
      const where = `steps[${i}]`;
      const step = object(s, where, ["drill", "back", "jump", "expect"]);
      const moves = ["drill", "back", "jump"].filter((k) => step[k] !== undefined);
      if (moves.length !== 1) throw new Error(`${where} needs exactly one of "drill", "back", "jump"`);
      const expect = step.expect === undefined ? undefined : screenExpectation(step.expect, `${where}.expect`);
      if (step.drill !== undefined) return { drill: string(step.drill, `${where}.drill`), expect };
      if (step.jump !== undefined) return { jump: string(step.jump, `${where}.jump`), expect };
      if (step.back !== true) throw new Error(`${where}.back must be true`);
      return { back: true, expect };
    }),
  };
}

function screenExpectation(raw: unknown, where: string): ScreenExpectation {
  const e = object(raw, where, ["focus", "dependents", "dependencies", "absent"]);
  const out: ScreenExpectation = {};
  if (e.focus !== undefined) out.focus = string(e.focus, `${where}.focus`);
  for (const row of ROWS) {
    if (e[row] === undefined) continue;
    if (!Array.isArray(e[row])) throw new Error(`${where}.${row} must be a list`);
    out[row] = (e[row] as unknown[]).map((n, i) => neighbour(n, `${where}.${row}[${i}]`));
  }
  if (e.absent !== undefined) {
    const a = object(e.absent, `${where}.absent`, ROWS);
    out.absent = {};
    for (const row of ROWS) {
      if (a[row] === undefined) continue;
      if (!Array.isArray(a[row])) throw new Error(`${where}.absent.${row} must be a list of names`);
      out.absent[row] = (a[row] as unknown[]).map((n, i) => string(n, `${where}.absent.${row}[${i}]`));
    }
  }
  return out;
}

function neighbour(raw: unknown, where: string): NeighbourExpectation {
  if (typeof raw === "string") return { name: raw };
  const n = object(raw, where, ["name", "edge", "size", "cycle"]);
  const out: NeighbourExpectation = { name: string(n.name, `${where}.name`) };
  if (n.edge !== undefined) {
    const edge = string(n.edge, `${where}.edge`).toLowerCase() as EdgeKind;
    if (!EDGES.includes(edge)) throw new Error(`${where}.edge must be one of ${EDGES.join(", ")}`);
    out.edge = edge;
  }
  if (n.size !== undefined) {
    const size = string(n.size, `${where}.size`).toLowerCase() as BoxSize;
    if (!SIZES.includes(size)) throw new Error(`${where}.size must be one of ${SIZES.join(", ")}`);
    out.size = size;
  }
  if (n.cycle !== undefined) {
    if (typeof n.cycle !== "boolean") throw new Error(`${where}.cycle must be true or false`);
    out.cycle = n.cycle;
  }
  return out;
}

function object(raw: unknown, where: string, keys: string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${where} must be an object`);
  const unknownKey = Object.keys(raw).find((k) => !keys.includes(k));
  if (unknownKey) throw new Error(`${where} has an unknown key "${unknownKey}" (allowed: ${keys.join(", ")})`);
  return raw as Record<string, unknown>;
}

function string(raw: unknown, where: string): string {
  if (typeof raw !== "string" || !raw) throw new Error(`${where} must be a name`);
  return raw;
}

/** Replays a walk against an index: one result per screen, start first. */
export function runWalk(walk: Walk, screens: Screens): StepResult[] {
  const nodes = new Map(screens.meta.nodes.map((n) => [n.id, n]));
  const screenOf = (id: string): Screen => JSON.parse(screens.json.get(id)!);
  const results: StepResult[] = [];

  const found = findFocus(screens.meta.nodes, walk.start);
  if (found.length !== 1) {
    const why = found.length ? `"${walk.start}" matches ${found.length} nodes (${found.slice(0, 4).map((n) => n.full).join(", ")})` : `no node matches "${walk.start}"`;
    return [{ move: `start ${walk.start}`, focus: null, problems: [why] }];
  }
  const trail = [found[0].id];
  results.push({ move: `start ${walk.start}`, focus: found[0].id, problems: check(walk.expect, screenOf(found[0].id), nodes) });

  for (const step of walk.steps) {
    const here = trail[trail.length - 1];
    let move: string;
    let to: string | null = null;
    let problem: string | null = null;
    if ("drill" in step) {
      move = `drill ${step.drill}`;
      const screen = screenOf(here);
      // a node in a cycle is in both rows: one target
      const onScreen = new Map([...screen.dependents, ...screen.dependencies].map((n) => [n.id, nodes.get(n.id)!]));
      const pick = matchIn(step.drill, [...onScreen.values()]);
      if (pick.length === 1) to = pick[0].id;
      else problem = pick.length ? `"${step.drill}" is ambiguous on this screen` : `"${step.drill}" is not on the screen of ${nodes.get(here)?.name}`;
    } else if ("jump" in step) {
      move = `jump ${step.jump}`;
      to = search(screens.meta.nodes, step.jump, 1)[0]?.id ?? null;
      if (!to) problem = `nothing matches "${step.jump}"`;
    } else {
      move = "back";
      if (trail.length < 2) problem = "nothing to go back to";
    }
    if (problem) {
      results.push({ move, focus: null, problems: [problem] });
      continue; // stay put: later steps still run from here
    }
    // clicking the previous Focus is Back, as on the page
    if (move === "back" || (to !== null && trail.length > 1 && to === trail[trail.length - 2])) trail.pop();
    else trail.push(to!);
    const focus = trail[trail.length - 1];
    results.push({ move, focus, problems: check(step.expect, screenOf(focus), nodes) });
  }
  return results;
}

/** What differs between a screen and what the walk expects of it. */
function check(expect: ScreenExpectation | undefined, screen: Screen, nodes: Map<string, NodeInfo>): string[] {
  if (!expect) return [];
  const problems: string[] = [];
  const focus = nodes.get(screen.focus.id)!;
  if (expect.focus && !matchIn(expect.focus, [focus]).length) problems.push(`Focus is ${focus.name}, expected ${expect.focus}`);
  for (const row of ROWS) {
    const items: Neighbour[] = screen[row];
    const rowNodes = items.map((n) => nodes.get(n.id)!);
    const sizes = sizeRow(items, row, (id) => nodes.get(id)?.kind === "library");
    for (const listed of expect[row] ?? []) {
      const want = typeof listed === "string" ? { name: listed } : listed;
      const hit = matchIn(want.name, rowNodes);
      if (hit.length !== 1) {
        problems.push(hit.length ? `${TITLE[row]}: "${want.name}" is ambiguous` : `${TITLE[row]}: missing ${want.name}`);
        continue;
      }
      const i = items.findIndex((n) => n.id === hit[0].id);
      const n = items[i];
      if (want.edge && n.edge !== want.edge) problems.push(`${TITLE[row]}: ${hit[0].name} is ${n.edge}, expected ${want.edge}`);
      if (want.size && sizes[i] !== want.size) problems.push(`${TITLE[row]}: ${hit[0].name} is ${sizes[i]} (Weight ${n.weight}), expected ${want.size}`);
      if (want.cycle !== undefined && n.cycle !== want.cycle) problems.push(`${TITLE[row]}: ${hit[0].name} is ${n.cycle ? "" : "not "}a cycle, expected ${want.cycle ? "" : "not "}a cycle`);
    }
    for (const name of expect.absent?.[row] ?? []) {
      const hit = matchIn(name, rowNodes);
      if (hit.length) problems.push(`${TITLE[row]}: ${hit[0].name} should not be there`);
    }
  }
  return problems;
}

/** Nodes among `among` a walk's name refers to: id, full name, shown name, then simple name. */
function matchIn(name: string, among: NodeInfo[]): NodeInfo[] {
  const exact = among.filter((n) => n.id === name || n.full === name || n.name === name || n.id === `lib:${name}`);
  return exact.length ? exact : among.filter((n) => simpleName(n) === name);
}

/** The report a terminal shows: one line per screen, the problems under it. */
export function formatWalk(title: string, results: StepResult[], nodes: Map<string, NodeInfo>): { text: string; failed: number } {
  const lines = [`walk: ${title}`];
  let failed = 0;
  results.forEach((r, i) => {
    const label = i === 0 ? r.move : `step ${i}: ${r.move}`;
    const landed = r.focus ? ` → ${nodes.get(r.focus)?.name ?? r.focus}` : "";
    if (r.problems.length) failed++;
    lines.push(`  ${r.problems.length ? "✗" : "✓"} ${label}${landed}`);
    for (const p of r.problems) lines.push(`      ${p}`);
  });
  lines.push(failed ? `  ${failed} of ${results.length} screens differ` : `  all ${results.length} screens as expected`);
  return { text: lines.join("\n"), failed };
}
