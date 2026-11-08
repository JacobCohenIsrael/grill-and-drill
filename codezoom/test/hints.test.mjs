// Hints from the graph alone (ADR 0008): Tangles, and the shortest Cycles
// through a Focus, on small made-up graphs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findTangles, shortestCycles } from "../dist/server/graph/hints.js";

/** A graph from "A>B" edge strings: sorted neighbour lists both ways. */
function graph(...edges) {
  const out = new Map();
  const inn = new Map();
  const add = (m, k, v) => m.set(k, [...(m.get(k) ?? []), v].sort());
  for (const e of edges) {
    const [a, b] = e.split(">");
    add(out, a, b);
    add(inn, b, a);
    for (const id of [a, b]) for (const m of [out, inn]) if (!m.has(id)) m.set(id, []);
  }
  return { ids: [...out.keys()].sort(), out: (id) => out.get(id) ?? [], inn: (id) => inn.get(id) ?? [] };
}

const sets = (tangles) => tangles.map((t) => [...t].sort()).sort();

test("Tangles: groups of two or more that each reach the others; a lone node is in none", () => {
  const g = graph("A>B", "B>A", "B>C", "C>D", "D>E", "E>C", "E>F", "F>G");
  assert.deepEqual(sets(findTangles(g.ids, g.out)), [["A", "B"], ["C", "D", "E"]]);
  const chain = graph("A>B", "B>C", "C>D");
  assert.deepEqual(findTangles(chain.ids, chain.out), []);
});

test("Tangles: a long chain closing on itself does not overflow the stack", () => {
  const n = 50_000;
  const edges = Array.from({ length: n }, (_, i) => `N${i}>N${(i + 1) % n}`);
  const g = graph(...edges);
  const tangles = findTangles(g.ids, g.out);
  assert.equal(tangles.length, 1);
  assert.equal(tangles[0].length, n);
});

test("Cycles: two-way neighbours are the shortest Cycles, and longer ones are left unmarked", () => {
  // F <-> A, and F -> B -> C -> F
  const g = graph("F>A", "A>F", "F>B", "B>C", "C>F");
  const marks = shortestCycles("F", new Set(["F", "A", "B", "C"]), g.out, g.inn);
  assert.equal(marks.length, 2);
  assert.deepEqual([...marks.dependencies], [["A", ["F", "A", "F"]]]);
  assert.deepEqual([...marks.dependents], [["A", ["F", "A", "F"]]]);
});

test("Cycles: with no two-way neighbour, the next Dependency and previous Dependent on the shortest Cycle", () => {
  // F -> A -> B -> F (length 3), and F -> C -> D -> E -> F (length 4)
  const g = graph("F>A", "A>B", "B>F", "F>C", "C>D", "D>E", "E>F");
  const tangle = new Set(["F", "A", "B", "C", "D", "E"]);
  const marks = shortestCycles("F", tangle, g.out, g.inn);
  assert.equal(marks.length, 3);
  assert.deepEqual([...marks.dependencies], [["A", ["F", "A", "B", "F"]]]);
  assert.deepEqual([...marks.dependents], [["B", ["F", "A", "B", "F"]]]);
});

test("Cycles: of two equally short ways, the first in name order is shown, and both ends are marked", () => {
  // F -> A -> {X, Y} -> B -> F: two Cycles of length 4 through A and B
  const g = graph("F>A", "A>Y", "A>X", "X>B", "Y>B", "B>F");
  const marks = shortestCycles("F", new Set(["F", "A", "B", "X", "Y"]), g.out, g.inn);
  assert.equal(marks.length, 4);
  assert.deepEqual(marks.dependencies.get("A"), ["F", "A", "X", "B", "F"]);
  assert.deepEqual(marks.dependents.get("B"), ["F", "A", "X", "B", "F"]);
});

test("Cycles: a Focus outside every Tangle has none", () => {
  const g = graph("F>A", "A>B", "B>A");
  assert.equal(shortestCycles("F", new Set(["A", "B"]), g.out, g.inn), null);
});
