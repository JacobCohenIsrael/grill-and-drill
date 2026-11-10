// Computes every node's screen at index time (ADR 0004), so a move only
// has to draw.

import type { MemberDecl } from "../csharp/facts.js";
import type { OwnType } from "../csharp/resolver.js";
import {
  isAssetKind,
  type BypassedInterface,
  type CycleHop,
  type DuplicateGroup,
  type DuplicateMember,
  type FocusBox,
  type FocusDuplicate,
  type FocusMember,
  type Meta,
  type Neighbour,
  type NeighbourHint,
  type NodeInfo,
  type Screen,
  type Tangle,
  type TypeSwitch,
  type Visibility,
} from "../shared/types.js";
import type { Edge, Graph } from "./build.js";
import { findDuplicates, memberLabel, type Body } from "./duplicates.js";
import { findTangles, shortestCycles } from "./hints.js";
import { findReaderHints } from "./readerHints.js";

/** Distance given to foreign libraries so they sort after every own type and asset. */
const FOREIGN_DISTANCE = 1000;

/** Code first, then assets (ADR 0007), then foreign libraries. */
const GROUP = (n: NodeInfo) => (n.kind === "library" ? 2 : isAssetKind(n.kind) ? 1 : 0);

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
  for (const a of graph.assets.values()) {
    nodes.push({
      id: a.id,
      name: a.path.slice(a.path.lastIndexOf("/") + 1),
      full: a.path,
      namespace: folderOf(a.path),
      kind: a.kind,
      label: a.label,
      abstract: false,
      dependents: graph.in.get(a.id)?.size ?? 0,
      dependencies: graph.out.get(a.id)?.size ?? 0,
      file: fileId(a.path),
      line: 1,
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
  // between an asset and anything else, folders stand in for namespaces
  const folder = (n: NodeInfo) => (isAssetKind(n.kind) ? n.namespace : n.file !== undefined ? folderOf(files[n.file]) : "");
  const distance = (focus: NodeInfo, o: NodeInfo) =>
    o.kind === "library" ? FOREIGN_DISTANCE : isAssetKind(o.kind) || isAssetKind(focus.kind) ? folderDistance(folder(focus), folder(o)) : namespaceDistance(focus.namespace, o.namespace);

  // Hints (ADR 0008): Tangles, and the shortest Cycles through each Focus.
  // Sorted neighbour lists fix which of several equally short Cycles a hover shows.
  const sortedKeys = (m: Map<string, Edge> | undefined) => (m ? [...m.keys()].sort() : []);
  const outList = new Map<string, string[]>();
  const inList = new Map<string, string[]>();
  const out = (id: string) => outList.get(id) ?? outList.set(id, sortedKeys(graph.out.get(id))).get(id)!;
  const inn = (id: string) => inList.get(id) ?? inList.set(id, sortedKeys(graph.in.get(id))).get(id)!;
  const tangleOf = new Map<string, ReadonlySet<string>>();
  const tangles: Tangle[] = findTangles(
    nodes.map((n) => n.id),
    out,
  )
    .map((group) => {
      const members = new Set(group);
      for (const id of group) tangleOf.set(id, members);
      const inside = (id: string) => out(id).filter((x) => members.has(x)).length + inn(id).filter((x) => members.has(x)).length;
      return group.map((id) => ({ id, inside: inside(id) })).sort((a, b) => b.inside - a.inside || compareNames(info.get(a.id)!.name, info.get(b.id)!.name));
    })
    .sort((a, b) => b.length - a.length || GROUP(info.get(a[0].id)!) - GROUP(info.get(b[0].id)!) || compareNames(info.get(a[0].id)!.name, info.get(b[0].id)!.name));
  for (const [id, members] of tangleOf) info.get(id)!.tangle = members.size;
  /** A Cycle hop by hop, each hop with its first Reference. */
  const hops = (path: string[]): CycleHop[] =>
    path.slice(1).map((to, i) => {
      const e = graph.out.get(path[i])!.get(to)!;
      const r = e.refs[0];
      return { from: path[i], to, edge: e.kind, ref: [r.member, fileId(r.file), r.line] };
    });

  // Duplicates (ADR 0009): the biggest body first, then the most members, then by name
  const nameOf = (b: Body) => `${info.get(b.type)!.name}.${b.member}`;
  const groups = findDuplicates(graph.types.values())
    .map((g) => g.sort((a, b) => compareNames(nameOf(a), nameOf(b)) || a.file.localeCompare(b.file) || a.line - b.line))
    .sort((a, b) => b[0].nodes - a[0].nodes || b.length - a.length || compareNames(nameOf(a[0]), nameOf(b[0])));
  const wire = (b: Body): DuplicateMember => ({ id: b.type, member: b.member, file: fileId(b.file), line: b.line });
  const duplicates: DuplicateGroup[] = groups.map((g) => ({ nodes: g[0].nodes, members: g.map(wire) }));
  /** Each type's bodies that are Duplicates, in source order, with their group's index. */
  const bodiesOf = new Map<string, { body: Body; group: number }[]>();
  groups.forEach((g, group) => {
    for (const body of g) {
      const list = bodiesOf.get(body.type);
      if (list) list.push({ body, group });
      else bodiesOf.set(body.type, [{ body, group }]);
    }
  });
  for (const list of bodiesOf.values()) list.sort((a, b) => a.body.file.localeCompare(b.body.file) || a.body.line - b.body.line);

  // Bypassed interfaces and Type switches (ADR 0011), each on the edge it belongs to
  const found = findReaderHints(graph);
  const weightOf = (e: Edge) => Math.round(Math.sqrt(e.refs.length * new Set(e.refs.map((r) => (r.typeLevel ? "\u0000declaration" : r.member))).size) * 10) / 10;
  const byName = (a: string, b: string) => compareNames(info.get(a)!.name, info.get(b)!.name);
  const bypassedInterfaces: BypassedInterface[] = found.bypasses
    .map((b) => ({
      holder: b.holder.key,
      held: b.held.key,
      fields: b.fields.map((r) => ({ member: r.member, file: fileId(r.file), line: r.line })),
      interfaces: b.interfaces.map((i) => i.key),
      weight: weightOf(b.edge),
    }))
    .sort((a, b) => b.weight - a.weight || byName(a.holder, b.holder) || byName(a.held, b.held));
  const subtypesOf = (s: TypeSwitch) => new Set(s.tests.map((t) => t.id)).size;
  const typeSwitches: TypeSwitch[] = found.switches
    .map((s) => ({ type: s.type.key, member: s.member, base: s.base.key, tests: s.tests.map((t) => ({ id: t.target.key, file: fileId(t.ref.file), line: t.ref.line })) }))
    .sort((a, b) => subtypesOf(b) - subtypesOf(a) || b.tests.length - a.tests.length || byName(a.type, b.type) || compareNames(a.member, b.member));
  const edgeKey = (from: string, to: string) => `${from}\u0000${to}`;
  const bypassOn = new Map(bypassedInterfaces.map((b) => [edgeKey(b.holder, b.held), b]));
  const switchesOn = new Map<string, TypeSwitch[]>();
  for (const s of typeSwitches) {
    for (const id of new Set(s.tests.map((t) => t.id))) {
      const key = edgeKey(s.type, id);
      switchesOn.set(key, [...(switchesOn.get(key) ?? []), s]);
    }
  }

  const json = new Map<string, string>();
  for (const n of nodes) {
    const outgoing = [...(graph.out.get(n.id)?.values() ?? [])];
    const incoming = [...(graph.in.get(n.id)?.values() ?? [])];
    const tangle = tangleOf.get(n.id);
    const cycles = tangle ? shortestCycles(n.id, tangle, out, inn) : null;
    const mine = bodiesOf.get(n.id) ?? [];
    /** A neighbour's members with the shape of a Focus member. */
    const duplicateHints = (id: string): NeighbourHint[] =>
      mine.flatMap(({ body, group }) =>
        groups[group]
          .filter((o) => o.type === id)
          .map((o) => ({ kind: "duplicate" as const, of: body.member, nodes: body.nodes, member: o.member, file: fileId(o.file), line: o.line })),
      );
    const row = (edges: Edge[], other: (e: Edge) => string, onCycle: Map<string, string[]> | undefined): Neighbour[] =>
      edges
        .map((e) => {
          const id = other(e);
          const o = info.get(id)!;
          const members = new Set(e.refs.map((r) => (r.typeLevel ? "\u0000declaration" : r.member))).size;
          const cycle = onCycle?.get(id);
          const bypass = bypassOn.get(edgeKey(e.from, e.to));
          const hints: NeighbourHint[] = [
            ...(cycle ? [{ kind: "cycle" as const, hops: hops(cycle) }] : []),
            ...duplicateHints(id),
            ...(bypass ? [{ kind: "bypassed-interface" as const, ...bypass }] : []),
            ...(switchesOn.get(edgeKey(e.from, e.to)) ?? []).map((s) => ({ kind: "type-switch" as const, ...s })),
          ];
          return {
            id,
            edge: e.kind,
            count: e.refs.length,
            members,
            weight: Math.round(Math.sqrt(e.refs.length * members) * 10) / 10,
            distance: distance(n, o),
            cycle: cycle !== undefined,
            refs: e.refs.map((r) => [r.member, fileId(r.file), r.line] as [string, number, number]),
            ...(hints.length ? { hints } : {}),
          };
        })
        // the page groups by size first (shared/weight.ts); this order holds within a size
        .sort(
          (a, b) =>
            GROUP(info.get(a.id)!) - GROUP(info.get(b.id)!) || a.distance - b.distance || b.weight - a.weight || compareNames(info.get(a.id)!.name, info.get(b.id)!.name),
        );
    const t = graph.types.get(n.id);
    const asset = graph.assets.get(n.id);
    const screen: Screen = {
      focus: t
        ? focusBox(
            t,
            fileId,
            mine.map(({ body, group }) => ({
              decl: body.decl,
              duplicate: { member: body.member, file: fileId(body.file), line: body.line, group: group + 1, nodes: body.nodes, duplicates: groups[group].filter((o) => o !== body).map(wire) },
            })),
            bypassedInterfaces.filter((b) => b.holder === n.id).sort((a, b) => byName(a.held, b.held)),
            typeSwitches.filter((s) => s.type === n.id).sort((a, b) => a.tests[0].file - b.tests[0].file || a.tests[0].line - b.tests[0].line),
          )
        : asset
          ? { id: n.id, attributes: [], operations: [], hidden: 0, file: fileId(asset.path), line: 1, parts: [], assembly: "", asset: { items: asset.box } }
          : { id: n.id, attributes: [], operations: [], hidden: 0, file: -1, line: 0, parts: [], assembly: "" },
      dependents: row(incoming, (e) => e.from, cycles?.dependents),
      dependencies: row(outgoing, (e) => e.to, cycles?.dependencies),
    };
    json.set(n.id, JSON.stringify(screen));
  }
  return { meta: { project, nodes, files, stats, tangles, duplicates, bypassedInterfaces, typeSwitches }, json };
}

export function namespaceDistance(a: string, b: string): number {
  const x = a ? a.split(".") : [];
  const y = b ? b.split(".") : [];
  let common = 0;
  while (common < x.length && common < y.length && x[common] === y[common]) common++;
  return x.length - common + (y.length - common);
}

/** Folder steps between two folders: up to the one both share, then down. */
export function folderDistance(a: string, b: string): number {
  const x = a ? a.split("/") : [];
  const y = b ? b.split("/") : [];
  let common = 0;
  while (common < x.length && common < y.length && x[common] === y[common]) common++;
  return x.length - common + (y.length - common);
}

function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
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

/**
 * The Focus box of a type; `duplicates` are its bodies that are Duplicates, in source order, and
 * `bypassed` and `switches` its Bypassed interfaces and Type switches (ADR 0011).
 */
function focusBox(
  t: OwnType,
  fileId: (f: string) => number,
  duplicates: { decl: MemberDecl; duplicate: FocusDuplicate }[],
  bypassed: BypassedInterface[],
  switches: TypeSwitch[],
): FocusBox {
  const dupIndex = new Map<MemberDecl, number[]>();
  duplicates.forEach(({ decl }, i) => dupIndex.set(decl, [...(dupIndex.get(decl) ?? []), i]));
  const indexes = <T>(list: T[], has: (x: T) => boolean) => list.flatMap((x, i) => (has(x) ? [i] : []));
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
      ...(dupIndex.has(m) ? { duplicates: dupIndex.get(m) } : {}),
    };
    const isField = m.kind === "field" || m.kind === "property";
    const bypassedBy = isField ? indexes(bypassed, (b) => b.fields.some((f) => f.member === m.name)) : [];
    if (bypassedBy.length) fm.bypassed = bypassedBy;
    const label = m.kind === "field" || m.kind === "const" ? m.name : memberLabel(m);
    const switchesIn = indexes(switches, (s) => s.member === label);
    if (switchesIn.length) fm.typeSwitches = switchesIn;
    if (m.kind === "method" || m.kind === "ctor" || m.kind === "dtor" || m.kind === "operator" || m.kind === "indexer") operations.push(fm);
    else attributes.push(fm);
  }
  const first = t.parts[0];
  const parts = t.parts.map((p) => ({ file: fileId(p.file), line: p.line }));
  return {
    id: t.key,
    attributes,
    operations,
    hidden,
    file: fileId(first.file),
    line: first.line,
    parts,
    assembly: t.assembly,
    ...(duplicates.length ? { duplicates: duplicates.map((d) => d.duplicate) } : {}),
    ...(bypassed.length ? { bypassedInterfaces: bypassed } : {}),
    ...(switches.length ? { typeSwitches: switches } : {}),
  };
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
