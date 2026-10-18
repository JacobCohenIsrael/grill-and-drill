// What one scene, prefab or .asset file says (ADR 0007), before any GUID is
// resolved: its GameObjects, their components and scripts, nested prefab
// instances, the assets its serialized fields assign, and its UnityEvent
// calls. Plain data, so it caches per file like FileFacts.

import { parseRef, readUnityYaml, scalar, type ObjectRef, type UnityDoc } from "./yaml.js";

export type AssetKind = "scene" | "prefab" | "asset";

export interface AssetObject {
  /** A GameObject's fileID, or `pi:<fileID>` for the root of a nested prefab instance. */
  id: string;
  /** Empty for a nested instance that keeps its prefab's name. */
  name: string;
  parent: string | null;
  /** Position among its siblings, from the parent Transform's m_Children. */
  index: number;
  line: number;
}

export interface AssetComponent {
  id: string;
  go: string | null;
  /** The serialized class: Transform, SpriteRenderer, MonoBehaviour, … */
  className: string;
  /** A MonoBehaviour's script. */
  script: ObjectRef | null;
  /** Unity 6 writes `Assembly::Namespace.Type` here: a fallback when the script's GUID is unknown. */
  scriptClass: string | null;
  line: number;
}

export interface AssetNested {
  id: string;
  source: ObjectRef;
  /** The object standing for the instance's root (`pi:<id>`). */
  go: string;
  /** A prefab variant's base: the instance at the root of a .prefab. */
  variant: boolean;
  line: number;
}

export interface AssetAssign {
  go: string | null;
  field: string;
  target: ObjectRef;
  line: number;
}

export interface AssetCall {
  go: string | null;
  target: ObjectRef;
  method: string;
  /** `Namespace.Type, Assembly` as Unity records it, when it does. */
  typeName: string | null;
  line: number;
}

export interface AssetFacts {
  path: string;
  kind: AssetKind;
  objects: AssetObject[];
  components: AssetComponent[];
  nested: AssetNested[];
  assigns: AssetAssign[];
  calls: AssetCall[];
  /** Local stand-ins for objects inside nested prefabs: fileID -> the object in the source prefab, and the instance. */
  stripped: Record<string, { source: ObjectRef; instance: string; className: string }>;
  /** An .asset's main object, when it is a ScriptableObject. */
  root: { script: ObjectRef | null; scriptClass: string | null; name: string; line: number } | null;
}

/** Fields Unity itself writes on every object: never an assignment. */
const INTERNAL = new Set(["m_Script", "m_GameObject", "m_PrefabInstance", "m_PrefabAsset", "m_CorrespondingSourceObject", "m_ObjectHideFlags"]);
const CALL = /^(.*)\.m_PersistentCalls\.m_Calls\[(\d+)\]\.(m_Target|m_MethodName|m_TargetAssemblyTypeName)$/;
const MODIFICATION = /^m_Modification\.m_Modifications\[(\d+)\]\.(target|propertyPath|value|objectReference)$/;

export function assetKind(path: string): AssetKind | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".unity")) return "scene";
  if (lower.endsWith(".prefab")) return "prefab";
  if (lower.endsWith(".asset")) return "asset";
  return null;
}

/** Reads one asset file; an .asset that is not a ScriptableObject gives facts with no root and nothing else. */
export function readAssetFacts(path: string, text: string): AssetFacts {
  const kind = assetKind(path) ?? "asset";
  const facts: AssetFacts = { path, kind, objects: [], components: [], nested: [], assigns: [], calls: [], stripped: {}, root: null };
  const docs = readUnityYaml(text);
  const value = (d: UnityDoc, p: string) => d.fields.find((f) => f[0] === p);
  const ref = (d: UnityDoc, p: string) => {
    const f = value(d, p);
    return f ? parseRef(f[1]) : null;
  };

  for (const d of docs) {
    if (!d.stripped) continue;
    const source = ref(d, "m_CorrespondingSourceObject");
    const instance = ref(d, "m_PrefabInstance");
    if (source && instance) facts.stripped[d.fileId] = { source, instance: instance.fileID, className: d.className };
  }
  /** A local object, seen through any stand-in: a stripped object becomes its instance's root. */
  const local = (fileId: string | undefined | null): string | null => {
    if (!fileId || fileId === "0") return null;
    const s = facts.stripped[fileId];
    return s ? `pi:${s.instance}` : fileId;
  };

  // Transform -> GameObject, to turn m_Father into a parent GameObject
  const goOfTransform = new Map<string, string>();
  const fatherOf = new Map<string, string>(); // GameObject -> its transform's parent transform
  const childIndex = new Map<string, number>(); // transform -> position under its parent
  for (const d of docs) {
    if (d.stripped || (d.className !== "Transform" && d.className !== "RectTransform")) continue;
    const go = ref(d, "m_GameObject")?.fileID;
    if (!go) continue;
    goOfTransform.set(d.fileId, go);
    const father = ref(d, "m_Father")?.fileID;
    if (father && father !== "0") fatherOf.set(go, father);
    let i = 0;
    for (const [p, v] of d.fields) {
      if (!p.startsWith("m_Children[")) continue;
      const child = parseRef(v)?.fileID;
      if (child) childIndex.set(child, i++);
    }
  }
  // a scene lists its root objects in order (Unity 2022 and later)
  for (const d of docs) {
    if (d.className !== "SceneRoots") continue;
    let i = 0;
    for (const [p, v] of d.fields) {
      const root = p.startsWith("m_Roots[") ? parseRef(v)?.fileID : undefined;
      if (root) childIndex.set(root, i++);
    }
  }
  const transformOf = new Map([...goOfTransform].map(([t, go]) => [go, t]));
  const parentOfTransform = (t: string | undefined): string | null => {
    if (!t || t === "0") return null;
    return goOfTransform.get(t) ?? local(t);
  };

  for (const d of docs) {
    if (d.stripped) continue;
    if (d.className === "GameObject") {
      const index = childIndex.get(transformOf.get(d.fileId) ?? "") ?? Number.MAX_SAFE_INTEGER;
      facts.objects.push({ id: d.fileId, name: scalar(value(d, "m_Name")?.[1] ?? ""), parent: parentOfTransform(fatherOf.get(d.fileId)), index, line: d.line });
      continue;
    }
    if (d.className === "PrefabInstance") {
      readPrefabInstance(d, facts, kind, parentOfTransform, (instance) => {
        // the instance's root transform is a stripped stand-in listed in its parent's m_Children
        for (const [id, s] of Object.entries(facts.stripped)) if (s.instance === instance && childIndex.has(id)) return childIndex.get(id)!;
        return Number.MAX_SAFE_INTEGER;
      });
      continue;
    }
    const goRef = ref(d, "m_GameObject");
    if (goRef === null) continue; // not a component (settings, meshes)
    const go = local(goRef.fileID);
    if (d.className !== "MonoBehaviour") {
      facts.components.push({ id: d.fileId, go, className: d.className, script: null, scriptClass: null, line: d.line });
      continue;
    }
    const scriptField = value(d, "m_Script");
    const script = scriptField ? parseRef(scriptField[1]) : null;
    const scriptClass = scalar(value(d, "m_EditorClassIdentifier")?.[1] ?? "") || null;
    if (go === null && kind === "asset") {
      // a ScriptableObject: the main object is 11400000, else the first one
      if (!facts.root || d.fileId === "11400000") facts.root = { script, scriptClass, name: scalar(value(d, "m_Name")?.[1] ?? ""), line: scriptField?.[2] ?? d.line };
    } else {
      facts.components.push({ id: d.fileId, go, className: "MonoBehaviour", script, scriptClass, line: scriptField?.[2] ?? d.line });
    }
    readFields(d, go, facts);
  }
  if (kind === "asset" && !facts.root) {
    // a mesh, a lighting asset, settings: not a node
    return { ...facts, objects: [], components: [], nested: [], assigns: [], calls: [], stripped: {} };
  }
  return facts;
}

/** A MonoBehaviour's assigned assets and UnityEvent calls. */
function readFields(d: UnityDoc, go: string | null, facts: AssetFacts) {
  const calls = new Map<string, { target?: ObjectRef; method?: string; typeName?: string; line: number }>();
  for (const [path, raw, line] of d.fields) {
    const top = path.split(/[.[]/, 1)[0];
    if (INTERNAL.has(top)) continue;
    const call = CALL.exec(path);
    if (call) {
      const key = `${call[1]}[${call[2]}]`;
      const c = calls.get(key) ?? { line };
      if (call[3] === "m_Target") c.target = parseRef(raw) ?? undefined;
      else if (call[3] === "m_MethodName") {
        c.method = scalar(raw);
        c.line = line;
      } else c.typeName = scalar(raw);
      calls.set(key, c);
      continue;
    }
    const r = raw.startsWith("{fileID:") ? parseRef(raw) : null;
    if (r?.guid) facts.assigns.push({ go, field: path, target: r, line });
  }
  for (const c of calls.values()) {
    if (c.target && c.target.fileID !== "0" && c.method) facts.calls.push({ go, target: c.target, method: c.method, typeName: c.typeName ?? null, line: c.line });
  }
}

/** A nested prefab (or a variant's base), its name override, and the assets its overrides assign. */
function readPrefabInstance(
  d: UnityDoc,
  facts: AssetFacts,
  kind: AssetKind,
  parentOfTransform: (t: string | undefined) => string | null,
  indexOf: (instance: string) => number,
) {
  let source: ObjectRef | null = null;
  let line = d.line;
  let parent: string | undefined;
  const mods = new Map<string, { propertyPath?: string; value?: string; objectReference?: ObjectRef | null; line: number }>();
  for (const [path, raw, l] of d.fields) {
    if (path === "m_SourcePrefab") {
      source = parseRef(raw);
      line = l;
    } else if (path === "m_Modification.m_TransformParent") parent = parseRef(raw)?.fileID;
    else {
      const m = MODIFICATION.exec(path);
      if (!m) continue;
      const entry = mods.get(m[1]) ?? { line: l };
      if (m[2] === "propertyPath") entry.propertyPath = scalar(raw);
      else if (m[2] === "value") entry.value = scalar(raw);
      else if (m[2] === "objectReference") {
        entry.objectReference = parseRef(raw);
        entry.line = l;
      }
      mods.set(m[1], entry);
    }
  }
  if (!source?.guid) return;
  const go = `pi:${d.fileId}`;
  const name = [...mods.values()].find((m) => m.propertyPath === "m_Name")?.value ?? "";
  const variant = kind === "prefab" && (!parent || parent === "0");
  facts.objects.push({ id: go, name, parent: parentOfTransform(parent), index: indexOf(d.fileId), line });
  facts.nested.push({ id: d.fileId, source, go, variant, line });
  for (const m of mods.values()) {
    if (m.objectReference?.guid && m.propertyPath) facts.assigns.push({ go, field: cleanPropertyPath(m.propertyPath), target: m.objectReference, line: m.line });
  }
}

/** `towers.Array.data[0]` -> `towers[0]`, as the field reads in C#. */
export function cleanPropertyPath(p: string): string {
  return p.replace(/\.Array\.data\[(\d+)\]/g, "[$1]");
}
