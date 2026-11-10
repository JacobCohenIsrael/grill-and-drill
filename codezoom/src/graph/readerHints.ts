// Hints that need more from the reader than the graph's edges (ADR 0011):
// Bypassed interfaces, from the Has References of fields and properties, and
// Type switches, from References that test or cast a value against a type.

import type { MemberDecl } from "../csharp/facts.js";
import type { OwnType } from "../csharp/resolver.js";
import type { Edge, Graph, Reference } from "./build.js";

/** A type holding an own class in fields or properties although the class implements an own interface it doesn't. */
export interface Bypass {
  holder: OwnType;
  held: OwnType;
  edge: Edge;
  /** The Has References: one per field or property line, Unity-serialized fields left out. */
  fields: Reference[];
  /** Own interfaces the held class implements, at any depth, and the holder doesn't. */
  interfaces: OwnType[];
}

/** A member testing or casting against two or more own subtypes of one own base. */
export interface TypeSwitch {
  type: OwnType;
  /** As References name members: `SlowFor()`. */
  member: string;
  base: OwnType;
  /** Each test of a subtype of the base, in source order. */
  tests: { target: OwnType; ref: Reference }[];
}

/**
 * Unity base classes scripts extend that are UnityEngine.Objects, so their
 * public fields are serialized. The DLLs' own inheritance isn't read, so
 * these are listed: MonoBehaviour, ScriptableObject and the common
 * subclasses of each.
 */
const UNITY_OBJECT_BASES = new Set([
  "MonoBehaviour",
  "ScriptableObject",
  "StateMachineBehaviour",
  "Editor",
  "EditorWindow",
  "ScriptableWizard",
  "ScriptedImporter",
  "UIBehaviour",
  "Graphic",
  "MaskableGraphic",
  "Selectable",
  "BaseInputModule",
  "BaseRaycaster",
  "PlayableAsset",
  "NetworkBehaviour",
]);

export function findReaderHints(graph: Graph): { bypasses: Bypass[]; switches: TypeSwitch[] } {
  const ancestors = ancestorsOf(graph);
  const bypasses: Bypass[] = [];
  const switches: TypeSwitch[] = [];
  for (const [from, edges] of graph.out) {
    const holder = graph.types.get(from);
    if (!holder) continue;
    const tests = new Map<string, { target: OwnType; ref: Reference }[]>();
    for (const [to, edge] of edges) {
      const target = graph.types.get(to);
      if (!target) continue;
      for (const r of edge.refs) {
        if (!r.test || r.typeLevel || graph.generated.has(r.file)) continue;
        const list = tests.get(r.member);
        if (list) list.push({ target, ref: r });
        else tests.set(r.member, [{ target, ref: r }]);
      }
      const bypass = bypassOf(graph, holder, target, edge, ancestors);
      if (bypass) bypasses.push(bypass);
    }
    for (const [member, list] of tests) {
      const s = switchOf(graph, holder, member, list, ancestors);
      if (s) switches.push(s);
    }
  }
  return { bypasses, switches };
}

function bypassOf(graph: Graph, holder: OwnType, held: OwnType, edge: Edge, ancestors: (key: string) => Set<string>): Bypass | null {
  if (held.kind !== "class" && held.kind !== "record") return null;
  const fields = edge.refs.filter((r) => r.has && !graph.generated.has(r.file) && !serializedByUnity(holder, r.member));
  if (!fields.length) return null;
  const own = ancestors(holder.key);
  const interfaces = [...ancestors(held.key)]
    .map((k) => graph.types.get(k)!)
    .filter((t) => t.kind === "interface" && t !== holder && !own.has(t.key))
    .sort((a, b) => a.name.localeCompare(b.name));
  return interfaces.length ? { holder, held, edge, fields, interfaces } : null;
}

/** The base that the most tested types descend from; of equals, the most specific, then by name. */
function switchOf(graph: Graph, type: OwnType, member: string, tests: { target: OwnType; ref: Reference }[], ancestors: (key: string) => Set<string>): TypeSwitch | null {
  const targets = new Map(tests.map((t) => [t.target.key, t.target]));
  if (targets.size < 2) return null;
  const under = new Map<string, Set<string>>();
  for (const key of targets.keys()) {
    for (const a of ancestors(key)) {
      if (a === key) continue;
      const set = under.get(a);
      if (set) set.add(key);
      else under.set(a, new Set([key]));
    }
  }
  const best = [...under.entries()]
    .filter(([, set]) => set.size >= 2)
    .sort(([a, x], [b, y]) => y.size - x.size || ancestors(b).size - ancestors(a).size || a.localeCompare(b))[0];
  if (!best) return null;
  const [baseKey, subtypes] = best;
  return {
    type,
    member,
    base: graph.types.get(baseKey)!,
    tests: tests.filter((t) => subtypes.has(t.target.key)).sort((a, b) => a.ref.file.localeCompare(b.ref.file) || a.ref.line - b.ref.line),
  };
}

/** A field or property Unity serializes: [SerializeField], [SerializeReference], or Unity's rule for public fields. */
export function serializedByUnity(holder: OwnType, member: string): boolean {
  const decl = holder.members.find((m) => (m.kind === "field" || m.kind === "property") && m.name === member);
  if (!decl) return false;
  if (decl.serialized) return true;
  return isPublicFieldUnitySerializes(decl) && isUnityObject(holder);
}

function isPublicFieldUnitySerializes(m: MemberDecl): boolean {
  return m.kind === "field" && m.access === "public" && !m.isStatic && !m.readonly && !m.nonSerialized;
}

/** Derives from MonoBehaviour, ScriptableObject or one of their usual subclasses. */
export function isUnityObject(t: OwnType): boolean {
  const seen = new Set<OwnType>();
  let cur = t;
  while (cur.baseClass && !seen.has(cur)) {
    seen.add(cur);
    cur = cur.baseClass;
  }
  const f = cur.foreignBase;
  return !!f && f.namespace.startsWith("Unity") && UNITY_OBJECT_BASES.has(f.name);
}

/** Own types a type inherits or implements, at any depth (its Inherits and Implements edges, followed). */
function ancestorsOf(graph: Graph): (key: string) => Set<string> {
  const memo = new Map<string, Set<string>>();
  const walk = (key: string, visiting: Set<string>): Set<string> => {
    const known = memo.get(key);
    if (known) return known;
    const result = new Set<string>();
    if (visiting.has(key)) return result;
    visiting.add(key);
    for (const [to, e] of graph.out.get(key) ?? []) {
      if ((e.kind !== "inherits" && e.kind !== "implements") || !graph.types.has(to)) continue;
      result.add(to);
      for (const a of walk(to, visiting)) result.add(a);
    }
    visiting.delete(key);
    memo.set(key, result);
    return result;
  };
  return (key: string) => walk(key, new Set());
}
