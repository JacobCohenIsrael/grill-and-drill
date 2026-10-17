// Turns the read files into the graph: own types and foreign libraries as
// nodes, and one edge per ordered pair carrying its strongest kind.

import type { FileFacts, RawRef, TypeDecl } from "../csharp/facts.js";
import { Resolver, type ForeignType, type OwnType, type Target } from "../csharp/resolver.js";
import type { LibraryInfo } from "../unity/libraries.js";
import type { EdgeKind } from "../shared/types.js";

export interface Reference {
  member: string;
  file: string;
  line: number;
}

export interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
  refs: Reference[];
}

export interface LibraryNode {
  id: string;
  lib: LibraryInfo;
}

export interface Graph {
  types: Map<string, OwnType>;
  libraries: Map<string, LibraryNode>;
  /** from -> to -> edge */
  out: Map<string, Map<string, Edge>>;
  /** to -> from -> edge */
  in: Map<string, Map<string, Edge>>;
  references: number;
  unresolved: Map<string, number>;
}

const STRENGTH: Record<EdgeKind, number> = { inherits: 4, implements: 3, has: 2, uses: 1 };

export function buildGraph(files: FileFacts[], foreign: ForeignType[]): Graph {
  const types = mergeTypes(files);
  const globalUsings = files.flatMap((f) => f.globalUsings);
  const resolver = new Resolver(types.values(), foreign, globalUsings);
  const ownOf = (d: TypeDecl) => types.get(d.key)!;

  // base classes first: nested-type lookup walks them
  const baseRefs: RawRef[] = [];
  const otherRefs: RawRef[] = [];
  for (const f of files) for (const r of f.refs) (r.role === "base" ? baseRefs : otherRefs).push(r);
  const baseTargets = new Map<RawRef, Target | null>();
  for (const r of baseRefs) {
    const from = ownOf(r.from);
    const t = resolver.resolveBase(r, from);
    baseTargets.set(r, t);
    if (!t || from.baseClass || from.foreignBase) continue;
    if (from.kind !== "class" && from.kind !== "record") continue;
    if (t.own && t.own.kind !== "interface" && t.own !== from) from.baseClass = t.own;
    else if (t.foreign && !t.foreign.isInterface) from.foreignBase = t.foreign;
  }

  const graph: Graph = { types, libraries: new Map(), out: new Map(), in: new Map(), references: 0, unresolved: new Map() };
  const seen = new Set<string>();
  const addRef = (r: RawRef, target: Target | null) => {
    const from = ownOf(r.from);
    if (!target) {
      const n = r.name.segs.map((s) => s.name).join(".");
      const typeParam = r.name.segs.length === 1 && (r.from.scopeTypeParams.includes(n) || r.methodTypeParams?.includes(n));
      if (!r.expr && !typeParam) graph.unresolved.set(n, (graph.unresolved.get(n) ?? 0) + 1);
      return;
    }
    let to: string;
    let isInterface: boolean;
    if (target.own) {
      to = target.own.key;
      isInterface = target.own.kind === "interface";
    } else {
      const lib = target.foreign.lib;
      if (lib.hidden) return;
      to = `lib:${lib.key}`;
      if (!graph.libraries.has(to)) graph.libraries.set(to, { id: to, lib });
      isInterface = target.foreign.isInterface;
    }
    if (to === from.key) return;
    const kind: EdgeKind =
      r.role === "base" ? (isInterface && from.kind !== "interface" ? "implements" : "inherits") : r.role === "has" ? "has" : "uses";
    const place = `${from.key}\u0000${to}\u0000${r.from.file}\u0000${r.line}`;
    let edge = graph.out.get(from.key)?.get(to);
    if (!edge) {
      edge = { from: from.key, to, kind, refs: [] };
      mapOf(graph.out, from.key).set(to, edge);
      mapOf(graph.in, to).set(from.key, edge);
    }
    if (STRENGTH[kind] > STRENGTH[edge.kind]) edge.kind = kind;
    if (seen.has(place)) return;
    seen.add(place);
    edge.refs.push({ member: r.member, file: r.from.file, line: r.line });
    graph.references++;
  };

  for (const r of baseRefs) addRef(r, baseTargets.get(r) ?? null);
  for (const r of otherRefs) addRef(r, resolver.resolve(r, ownOf(r.from)));
  for (const m of graph.out.values()) for (const e of m.values()) e.refs.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return graph;
}

function mapOf<K, V>(m: Map<string, Map<K, V>>, key: string): Map<K, V> {
  let v = m.get(key);
  if (!v) m.set(key, (v = new Map()));
  return v;
}

/** Partial declarations with the same full name become one type. */
function mergeTypes(files: FileFacts[]): Map<string, OwnType> {
  const types = new Map<string, OwnType>();
  const decls: { d: TypeDecl; assembly: string }[] = [];
  for (const f of files) for (const d of f.types) decls.push({ d, assembly: f.assembly });
  for (const { d, assembly } of decls) {
    let t = types.get(d.key);
    if (!t) {
      t = {
        key: d.key,
        name: d.name,
        arity: d.arity,
        namespace: d.namespace,
        outer: null,
        kind: d.kind,
        modifiers: new Set(),
        typeParams: d.typeParams,
        parts: [],
        members: [],
        memberNames: new Set(),
        nested: new Map(),
        assembly,
        baseClass: null,
        foreignBase: null,
      };
      types.set(d.key, t);
    }
    t.parts.push(d);
    for (const m of d.modifiers) t.modifiers.add(m);
    for (const m of d.members) {
      t.members.push(m);
      t.memberNames.add(m.name);
    }
  }
  for (const { d } of decls) {
    if (!d.outer) continue;
    const t = types.get(d.key)!;
    const outer = types.get(d.outer.key)!;
    t.outer = outer;
    const list = outer.nested.get(t.name);
    if (!list) outer.nested.set(t.name, [t]);
    else if (!list.includes(t)) list.push(t);
  }
  return types;
}
