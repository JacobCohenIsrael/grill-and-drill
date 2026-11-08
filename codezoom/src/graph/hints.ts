// Hints (ADR 0008): marks that point the reader at evidence that the code
// around a node may break a design principle. The first ones need nothing
// but the graph: Tangles, and the shortest Cycles through each Focus.

/** Each node's Dependencies, in a fixed order (it decides which of several equally short Cycles is shown). */
export type Adjacency = (id: string) => readonly string[];

/**
 * The Tangles among `ids`: strongly connected components of two or more nodes
 * (Tarjan's algorithm, iterative so a long chain can't overflow the stack).
 */
export function findTangles(ids: Iterable<string>, out: Adjacency): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const tangles: string[][] = [];
  let next = 0;
  for (const root of ids) {
    if (index.has(root)) continue;
    const work: { v: string; edges: readonly string[]; i: number }[] = [];
    const open = (v: string) => {
      index.set(v, next);
      low.set(v, next);
      next++;
      stack.push(v);
      onStack.add(v);
      work.push({ v, edges: out(v), i: 0 });
    };
    open(root);
    while (work.length) {
      const top = work[work.length - 1];
      if (top.i < top.edges.length) {
        const w = top.edges[top.i++];
        if (!index.has(w)) open(w);
        else if (onStack.has(w)) low.set(top.v, Math.min(low.get(top.v)!, index.get(w)!));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].v;
        low.set(parent, Math.min(low.get(parent)!, low.get(top.v)!));
      }
      if (low.get(top.v) !== index.get(top.v)) continue;
      const group: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        group.push(w);
      } while (w !== top.v);
      if (group.length > 1) tangles.push(group);
    }
  }
  return tangles;
}

export interface CycleMarks {
  /** Nodes on the shortest Cycles through the Focus: the length of those Cycles. */
  length: number;
  /** Each marked Dependency, with one shortest Cycle through it: Focus first and last. */
  dependencies: Map<string, string[]>;
  /** Each marked Dependent, with one shortest Cycle through it: Focus first and last. */
  dependents: Map<string, string[]>;
}

/**
 * The neighbours on the shortest Cycles through `focus`. Every Cycle through
 * a node stays inside its Tangle, so the search does too.
 */
export function shortestCycles(focus: string, tangle: ReadonlySet<string>, out: Adjacency, inn: Adjacency): CycleMarks | null {
  if (!tangle.has(focus)) return null;
  // toward: the next node on a shortest way from a node to the Focus
  const toFocus = bfs(focus, inn, tangle);
  // back: the node before, on a shortest way from the Focus
  const fromFocus = bfs(focus, out, tangle);
  let length = Infinity;
  for (const d of out(focus)) if (d !== focus && toFocus.dist.has(d)) length = Math.min(length, toFocus.dist.get(d)! + 1);
  if (length === Infinity) return null;

  const dependencies = new Map<string, string[]>();
  for (const d of out(focus)) {
    if (d === focus || toFocus.dist.get(d) !== length - 1) continue;
    const path = [focus, d];
    for (let x = d; x !== focus; ) path.push((x = toFocus.via.get(x)!));
    dependencies.set(d, path);
  }
  const dependents = new Map<string, string[]>();
  for (const p of inn(focus)) {
    if (p === focus || fromFocus.dist.get(p) !== length - 1) continue;
    const path = [p, focus];
    for (let x = p; x !== focus; ) path.unshift((x = fromFocus.via.get(x)!));
    dependents.set(p, path);
  }
  return { length, dependencies, dependents };
}

/** Breadth-first from `start` along `step`, inside `within`: each node's distance and the node it was reached from. */
function bfs(start: string, step: Adjacency, within: ReadonlySet<string>) {
  const dist = new Map([[start, 0]]);
  const via = new Map<string, string>();
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i];
    for (const w of step(v)) {
      if (dist.has(w) || !within.has(w)) continue;
      dist.set(w, dist.get(v)! + 1);
      via.set(w, v);
      queue.push(w);
    }
  }
  return { dist, via };
}
