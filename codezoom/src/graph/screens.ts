// Computes every node's screen at index time (ADR 0004), so a move only
// has to draw.

import type { MemberDecl } from "../csharp/facts.js";
import type { OwnType } from "../csharp/resolver.js";
import type { FocusBox, FocusMember, Meta, Neighbour, NodeInfo, Screen, Visibility } from "../shared/types.js";
import type { Edge, Graph } from "./build.js";

/** Distance given to foreign libraries so they sort after every own type. */
const FOREIGN_DISTANCE = 1000;

export interface Screens {
  meta: Meta;
  /** Each node's screen, already serialized. */
  json: Map<string, string>;
}

export function buildScreens(graph: Graph, project: string, stats: Meta["stats"]): Screens {
  const files: string[] = [];
  const fileIndex = new Map<string, number>();
  const fileId = (f: string) => {
    let i = fileIndex.get(f);
    if (i === undefined) {
      i = files.length;
      files.push(f);
      fileIndex.set(f, i);
    }
    return i;
  };

  const nodes: NodeInfo[] = [];
  const names = displayNames(graph);
  for (const t of graph.types.values()) {
    nodes.push({
      id: t.key,
      name: names.get(t.key)!,
      full: fullName(t),
      namespace: t.namespace,
      kind: t.kind,
      label: labelOf(t),
      abstract: t.modifiers.has("abstract"),
      dependents: graph.in.get(t.key)?.size ?? 0,
      dependencies: graph.out.get(t.key)?.size ?? 0,
      file: fileId(t.parts[0].file),
      line: t.parts[0].line,
    });
  }
  for (const l of graph.libraries.values()) {
    nodes.push({
      id: l.id,
      name: names.get(l.id)!,
      full: l.lib.key === l.lib.name ? l.lib.name : `${l.lib.name} (${l.lib.key})`,
      namespace: "",
      kind: "library",
      label: "library",
      abstract: false,
      dependents: graph.in.get(l.id)?.size ?? 0,
      dependencies: 0,
    });
  }
  const info = new Map(nodes.map((n) => [n.id, n]));

  const json = new Map<string, string>();
  for (const n of nodes) {
    const outgoing = [...(graph.out.get(n.id)?.values() ?? [])];
    const incoming = [...(graph.in.get(n.id)?.values() ?? [])];
    const outIds = new Set(outgoing.map((e) => e.to));
    const inIds = new Set(incoming.map((e) => e.from));
    const row = (edges: Edge[], other: (e: Edge) => string, otherRow: Set<string>): Neighbour[] =>
      edges
        .map((e) => {
          const id = other(e);
          const o = info.get(id)!;
          const members = new Set(e.refs.map((r) => (r.typeLevel ? "\u0000declaration" : r.member))).size;
          return {
            id,
            edge: e.kind,
            count: e.refs.length,
            members,
            weight: Math.round(Math.sqrt(e.refs.length * members) * 10) / 10,
            distance: o.kind === "library" ? FOREIGN_DISTANCE : namespaceDistance(n.namespace, o.namespace),
            cycle: otherRow.has(id),
            refs: e.refs.map((r) => [r.member, fileId(r.file), r.line] as [string, number, number]),
          };
        })
        // the page groups by size first (shared/weight.ts); this order holds within a size
        .sort((a, b) => a.distance - b.distance || b.weight - a.weight || compareNames(info.get(a.id)!.name, info.get(b.id)!.name));
    const t = graph.types.get(n.id);
    const screen: Screen = {
      focus: t ? focusBox(t, fileId) : { id: n.id, attributes: [], operations: [], hidden: 0, file: -1, line: 0, parts: [], assembly: "" },
      dependents: row(incoming, (e) => e.from, outIds),
      dependencies: row(outgoing, (e) => e.to, inIds),
    };
    json.set(n.id, JSON.stringify(screen));
  }
  return { meta: { project, nodes, files, stats }, json };
}

export function namespaceDistance(a: string, b: string): number {
  const x = a ? a.split(".") : [];
  const y = b ? b.split(".") : [];
  let common = 0;
  while (common < x.length && common < y.length && x[common] === y[common]) common++;
  return x.length - common + (y.length - common);
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

function genericSuffix(t: OwnType): string {
  return t.typeParams.length ? `<${t.typeParams.join(", ")}>` : "";
}

function shortName(t: OwnType): string {
  return (t.outer ? shortName(t.outer) + "." : "") + t.name + genericSuffix(t);
}

function fullName(t: OwnType): string {
  return (t.namespace ? t.namespace + "." : "") + shortName(t);
}

/** Same-name nodes get the shortest namespace ending that tells them apart. */
function displayNames(graph: Graph): Map<string, string> {
  const result = new Map<string, string>();
  const groups = new Map<string, OwnType[]>();
  for (const t of graph.types.values()) {
    const s = shortName(t);
    const g = groups.get(s);
    if (g) g.push(t);
    else groups.set(s, [t]);
  }
  for (const [short, group] of groups) {
    if (group.length === 1) {
      result.set(group[0].key, short);
      continue;
    }
    for (const t of group) {
      const segs = t.namespace ? t.namespace.split(".") : [];
      let name = fullName(t);
      for (let k = 1; k <= segs.length; k++) {
        const ending = segs.slice(-k).join(".");
        const clash = group.some((o) => o !== t && (o.namespace === ending || o.namespace.endsWith("." + ending)));
        if (!clash) {
          name = `${ending}.${short}`;
          break;
        }
      }
      result.set(t.key, name);
    }
  }
  const libNames = new Map<string, number>();
  for (const l of graph.libraries.values()) libNames.set(l.lib.name, (libNames.get(l.lib.name) ?? 0) + 1);
  for (const l of graph.libraries.values()) result.set(l.id, (libNames.get(l.lib.name) ?? 0) > 1 ? `${l.lib.name} (${l.lib.key})` : l.lib.name);
  return result;
}

/** Nearest foreign base type, else the type kind. */
export function labelOf(t: OwnType): string {
  const seen = new Set<OwnType>();
  let cur: OwnType = t;
  while (cur.baseClass && !seen.has(cur)) {
    seen.add(cur);
    cur = cur.baseClass;
  }
  if (cur.foreignBase) return cur.foreignBase.name;
  if (t.kind === "class" && t.modifiers.has("static")) return "static class";
  return t.kind;
}

const VIS: Record<MemberDecl["access"], Visibility> = {
  public: "+",
  private: "-",
  protected: "#",
  internal: "~",
  "protected internal": "#",
  "private protected": "-",
};

function focusBox(t: OwnType, fileId: (f: string) => number): FocusBox {
  const attributes: FocusMember[] = [];
  const operations: FocusMember[] = [];
  let hidden = 0;
  for (const m of t.members) {
    if (m.access !== "public" && !m.serialized) {
      hidden++;
      continue;
    }
    const fm: FocusMember = {
      vis: VIS[m.access],
      text: memberText(m),
      isStatic: m.isStatic,
      isAbstract: m.isAbstract,
      serialized: m.serialized,
      event: m.kind === "event",
    };
    if (m.kind === "method" || m.kind === "ctor" || m.kind === "dtor" || m.kind === "operator" || m.kind === "indexer") operations.push(fm);
    else attributes.push(fm);
  }
  const first = t.parts[0];
  const parts = t.parts.map((p) => ({ file: fileId(p.file), line: p.line }));
  return { id: t.key, attributes, operations, hidden, file: fileId(first.file), line: first.line, parts, assembly: t.assembly };
}

function memberText(m: MemberDecl): string {
  const params = `(${(m.params ?? []).join(", ")})`;
  switch (m.kind) {
    case "enum-value":
      return m.name;
    case "method":
      return `${m.name}${params}${m.type && m.type !== "void" ? `: ${m.type}` : ""}`;
    case "ctor":
    case "dtor":
      return `${m.name}${params}`;
    case "operator":
      return `${m.name}${params}${m.type ? `: ${m.type}` : ""}`;
    case "indexer":
      return `this[${(m.params ?? []).join(", ")}]${m.type ? `: ${m.type}` : ""}`;
    default:
      return m.type ? `${m.name}: ${m.type}` : m.name;
  }
}
