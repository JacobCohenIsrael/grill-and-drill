// Unity assets as nodes (ADR 0007): scenes, prefabs and ScriptableObject
// assets in own folders that are wired to own code. Their edges start at the
// asset (Inherits for a variant, then Instance of, Contains, Assigns, Calls)
// and never add an edge between two types. GameObjects show up only in
// References, as paths.

import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, posix } from "node:path";
import type { IndexCache } from "../cache.js";
import type { OwnType } from "../csharp/resolver.js";
import { readTypeDefs, type ForeignTypeDef } from "../dotnet/metadata.js";
import { linkEdge, type AssetNode, type Graph } from "../graph/build.js";
import { FolderRules, isSkipped, type Config } from "../shared/ownRules.js";
import type { AssetOutline, EdgeKind, OutlineObject } from "../shared/types.js";
import { assetKind, readAssetFacts, type AssetCall, type AssetFacts } from "./assetFacts.js";
import type { Csproj } from "./csproj.js";
import type { LibraryInfo, LibraryMap } from "./libraries.js";
import { dllScriptFileId } from "./md4.js";
import { vendorLibrary, type OwnCode } from "./ownCode.js";
import type { ObjectRef } from "./yaml.js";

/** Scripts built into the engine (UIDocument and friends) carry this GUID. */
const ENGINE_GUID = "0000000000000000e000000000000000";
const ENGINE_SCRIPTS: Record<string, string> = { "19102": "UIDocument", "19101": "PanelSettings" };
const UNITY_ENGINE: LibraryInfo = { key: "UnityEngine", name: "UnityEngine", hidden: false };
/** An .asset bigger than this whose start shows no MonoBehaviour is data (a mesh, a font atlas), not a ScriptableObject. */
const HEAD_BYTES = 64 * 1024;

type Target = { type: string } | { lib: LibraryInfo } | { asset: string };

interface Pending {
  to: Target;
  kind: EdgeKind;
  member: string;
  line: number;
}

interface ScriptInfo {
  name: string;
  target: Target | null;
}

export type { AssetOutline, OutlineObject } from "../shared/types.js";

export interface AssetIndex {
  /** Asset files looked at, read (or taken from the cache), and kept as nodes. */
  stats: { files: number; read: number; kept: number; metas: number };
  outline(id: string): AssetOutline | null;
}

export interface AssetContext {
  root: string;
  graph: Graph;
  own: OwnCode;
  projects: Csproj[];
  config: Config | null;
  cache: IndexCache;
  libraries: LibraryMap;
}

/** Adds the project's own assets to the graph; returns what the outline and the report need. */
export function indexAssets(ctx: AssetContext): AssetIndex {
  const { root, graph, cache } = ctx;
  const scan = scanProject(root, cache);
  const rules = new FolderRules(ctx.config ?? {}, "unity");
  const ownFolder = (p: string) => p.startsWith("Assets/") && !isSkipped(p) && rules.isOwnFile(p);

  // read the candidates: asset files in own folders
  const facts = new Map<string, AssetFacts>();
  let read = 0;
  for (const path of scan.assets) {
    if (!ownFolder(path)) continue;
    let stamp;
    try {
      stamp = statSync(join(root, path));
    } catch {
      continue;
    }
    const f = cache.assetFacts(path, stamp, () => readAsset(join(root, path), path));
    read++;
    if (f && (f.kind !== "asset" || f.root)) facts.set(path, f);
  }

  const scripts = new ScriptResolver(ctx, scan.guids);
  const assetPath = (r: ObjectRef | null | undefined) => {
    const p = r?.guid ? scan.guids.get(r.guid) : undefined;
    return p && assetKind(p) ? p : null;
  };
  /** Where an assigned or nested asset leads: an own candidate, a library (vendor, package), or nowhere (art in own folders). */
  const assetTarget = (r: ObjectRef | null | undefined): Target | null => {
    const p = assetPath(r);
    if (!p) return null;
    if (facts.has(p)) return { asset: p };
    if (ownFolder(p)) return null;
    const lib = p.startsWith("Assets/") ? vendorLibrary(p) : ctx.libraries.forPath(p);
    return lib ? { lib } : null;
  };
  const nameOfAsset = (p: string) => basename(p);

  // each candidate's edges, before we know which assets stay
  const pending = new Map<string, Pending[]>();
  const boxes = new Map<string, { text: string; own: boolean }[]>();
  const labels = new Map<string, string>();
  for (const [path, f] of facts) {
    const out: Pending[] = [];
    const paths = goPaths(f, (r) => {
      const p = assetPath(r);
      return p ? basename(p, extname(p)) : "Prefab";
    });
    const counts = new Map<string, { n: number; own: boolean }>();
    const count = (name: string, own: boolean) => {
      const c = counts.get(name) ?? { n: 0, own };
      c.n++;
      counts.set(name, c);
    };
    for (const c of f.components) {
      if (c.className !== "MonoBehaviour") {
        if (c.className !== "Transform" && c.className !== "RectTransform") count(c.className, false);
        continue;
      }
      const s = scripts.resolve(c.script, c.scriptClass);
      count(s?.name ?? "Missing script", !!s?.target && "type" in s.target);
      if (s?.target) out.push({ to: s.target, kind: "contains", member: paths(c.go), line: c.line });
    }
    for (const n of f.nested) {
      const t = assetTarget(n.source);
      if (t) out.push({ to: t, kind: n.variant ? "inherits" : "contains", member: paths(n.go), line: n.line });
    }
    if (f.root) {
      const s = scripts.resolve(f.root.script, f.root.scriptClass);
      labels.set(path, s?.name ?? "ScriptableObject");
      if (s?.target) out.push({ to: s.target, kind: "instance of", member: "", line: f.root.line });
    }
    const fields: { text: string; own: boolean }[] = [];
    for (const a of f.assigns) {
      const p = assetPath(a.target);
      if (!p) continue;
      if (f.kind === "asset") fields.push({ text: `${a.field} = ${nameOfAsset(p)}`, own: facts.has(p) });
      const t = assetTarget(a.target);
      if (t) out.push({ to: t, kind: "assigns", member: f.kind === "asset" ? "" : paths(a.go), line: a.line });
    }
    for (const call of f.calls) {
      const t = callTarget(call, f, facts, scripts, scan.guids);
      if (t) out.push({ to: t, kind: "calls", member: paths(call.go), line: call.line });
    }
    pending.set(path, out);
    boxes.set(
      path,
      f.kind === "asset"
        ? fields
        : [...counts]
            .sort((a, b) => Number(b[1].own) - Number(a[1].own) || b[1].n - a[1].n || a[0].localeCompare(b[0]))
            .map(([name, c]) => ({ text: `${name} ×${c.n}`, own: c.own })),
    );
  }

  // own assets: wired to an own type, or to an asset that is (until nothing changes)
  const kept = new Set<string>();
  for (const [path, out] of pending) if (out.some((e) => "type" in e.to && graph.types.has(e.to.type))) kept.add(path);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [path, out] of pending) {
      if (kept.has(path) || !out.some((e) => "asset" in e.to && kept.has(e.to.asset))) continue;
      kept.add(path);
      grew = true;
    }
  }

  for (const path of kept) {
    const f = facts.get(path)!;
    const id = assetId(path);
    graph.assets.set(id, { id, path, kind: f.kind === "asset" ? "asset" : f.kind, label: f.kind === "asset" ? labels.get(path)! : f.kind, box: boxes.get(path) ?? [] });
  }
  for (const path of kept) {
    const from = assetId(path);
    for (const e of pending.get(path)!) {
      let to: string;
      if ("type" in e.to) {
        if (!graph.types.has(e.to.type)) continue;
        to = e.to.type;
      } else if ("asset" in e.to) {
        if (!kept.has(e.to.asset)) continue; // art: an asset not wired to own code
        to = assetId(e.to.asset);
      } else {
        if (e.to.lib.hidden) continue;
        to = `lib:${e.to.lib.key}`;
        if (!graph.libraries.has(to)) graph.libraries.set(to, { id: to, lib: e.to.lib });
      }
      if (to === from) continue;
      linkEdge(graph, from, to, e.kind, { member: e.member, typeLevel: false, file: path, line: e.line });
    }
    for (const edge of graph.out.get(from)?.values() ?? []) edge.refs.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  }

  return {
    stats: { files: scan.assets.length, read, kept: kept.size, metas: scan.guids.size },
    outline: (id) => {
      const path = id.startsWith("asset:") ? id.slice(6) : id;
      const f = kept.has(path) ? facts.get(path) : undefined;
      return f ? outlineOf(id, f, scripts, assetTarget, assetPath, (call) => callTarget(call, f, facts, scripts, scan.guids), kept) : null;
    },
  };
}

export function assetId(path: string): string {
  return `asset:${path}`;
}

// ---- scanning: asset files, and the GUIDs .meta files give scripts, DLLs and assets

interface Scan {
  /** Scenes, prefabs and .asset files, root-relative. */
  assets: string[];
  /** GUID -> root-relative path of the script, DLL or asset file. */
  guids: Map<string, string>;
}

const GUID_EXTENSIONS = new Set([".cs", ".dll", ".prefab", ".unity", ".asset"]);

function scanProject(root: string, cache: IndexCache): Scan {
  const scan: Scan = { assets: [], guids: new Map() };
  const walk = (rel: string, scriptsOnly: boolean) => {
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      // Unity ignores dot-folders and folders ending in ~
      if (e.name.startsWith(".") || e.name.endsWith("~")) continue;
      const path = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        // the package cache sits under Library/, which own-code rules skip
        if (scriptsOnly || !isSkipped(`${path}/`)) walk(path, scriptsOnly);
        continue;
      }
      if (e.name.endsWith(".meta")) {
        const target = path.slice(0, -5);
        const ext = extname(target).toLowerCase();
        if (!GUID_EXTENSIONS.has(ext) || (scriptsOnly && ext !== ".cs" && ext !== ".dll")) continue;
        let stamp;
        try {
          stamp = statSync(join(root, path));
        } catch {
          continue;
        }
        const guid = cache.metaGuid(path, stamp, () => readGuid(join(root, path)));
        if (guid) scan.guids.set(guid, target);
      } else if (!scriptsOnly && assetKind(e.name)) scan.assets.push(path);
    }
  };
  walk("Assets", false);
  // local packages sit in Packages/; the ones Unity downloads, in Library/PackageCache/ (their scripts only)
  walk("Packages", false);
  walk("Library/PackageCache", true);
  scan.assets.sort();
  return scan;
}

function readGuid(path: string): string | null {
  try {
    return /^guid: ([0-9a-fA-F]{32})/m.exec(readFileSync(path, "utf8").slice(0, 400))?.[1].toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** Reads an asset file; a big .asset whose start has no MonoBehaviour is data and is not read further. */
function readAsset(abs: string, path: string): AssetFacts | null {
  try {
    if (assetKind(path) === "asset") {
      const fd = openSync(abs, "r");
      try {
        const head = Buffer.alloc(HEAD_BYTES);
        const n = readSync(fd, head, 0, HEAD_BYTES, 0);
        if (n === HEAD_BYTES && !head.includes("\nMonoBehaviour:")) return null;
      } finally {
        closeSync(fd);
      }
    }
    return readAssetFacts(path, readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

// ---- scripts: GUID -> the type Unity serializes, by file name as Unity requires

class ScriptResolver {
  private byFile = new Map<string, OwnType[]>();
  private byFull = new Map<string, OwnType>();
  private projectOfFile = new Map<string, Csproj>();
  private dllNames = new Map<string, Map<string, string>>();
  private memo = new Map<string, ScriptInfo | null>();
  private ownNames: Set<string>;

  constructor(
    private ctx: AssetContext,
    private guids: Map<string, string>,
  ) {
    for (const t of ctx.graph.types.values()) {
      if (t.outer) continue;
      this.byFull.set(t.key, t);
      for (const part of t.parts) {
        const list = this.byFile.get(part.file);
        if (list) list.push(t);
        else this.byFile.set(part.file, [t]);
      }
    }
    this.ownNames = new Set(ctx.own.assemblies.map((p) => p.assembly));
    for (const p of ctx.projects) if (!this.ownNames.has(p.assembly)) for (const f of p.compile) this.projectOfFile.set(f, p);
  }

  resolve(script: ObjectRef | null, scriptClass: string | null): ScriptInfo | null {
    const key = `${script?.guid ?? ""}:${script?.fileID ?? ""}:${scriptClass ?? ""}`;
    if (this.memo.has(key)) return this.memo.get(key)!;
    const info = this.find(script, scriptClass);
    this.memo.set(key, info);
    return info;
  }

  private find(script: ObjectRef | null, scriptClass: string | null): ScriptInfo | null {
    if (script?.guid === ENGINE_GUID) return { name: ENGINE_SCRIPTS[script.fileID] ?? "UnityEngine script", target: { lib: UNITY_ENGINE } };
    const path = script?.guid ? this.guids.get(script.guid) : undefined;
    if (path?.toLowerCase().endsWith(".cs")) {
      const name = basename(path, extname(path));
      const own = this.byFile.get(path)?.find((t) => t.name === name);
      if (own) return { name: own.name, target: { type: own.key } };
      const lib = this.libraryOfFile(path);
      return { name, target: lib ? { lib } : null };
    }
    if (path?.toLowerCase().endsWith(".dll")) {
      const lib = this.ctx.libraries.forAssembly(basename(path, extname(path)), join(this.ctx.root, path));
      return { name: this.dllScriptName(path, script!.fileID) ?? `${basename(path)} script`, target: { lib } };
    }
    // no .meta for it (a package not downloaded yet): Unity 6 names the class itself
    const m = /::(.+)$/.exec(scriptClass ?? "");
    if (m) {
      const own = this.byFull.get(m[1]);
      if (own) return { name: own.name, target: { type: own.key } };
      return { name: m[1].split(".").pop()!, target: null };
    }
    return null;
  }

  /** A script outside own code: its vendor folder, its assembly, or its package. */
  private libraryOfFile(path: string): LibraryInfo | null {
    const project = this.projectOfFile.get(path);
    if (project) return this.ctx.libraries.forProject(project);
    if (path.startsWith("Assets/")) return vendorLibrary(path);
    return this.ctx.libraries.forPath(path);
  }

  /** A class in a DLL, by the fileID Unity derives from its name. */
  private dllScriptName(path: string, fileID: string): string | null {
    let names = this.dllNames.get(path);
    if (!names) {
      names = new Map();
      const abs = join(this.ctx.root, path);
      let defs: ForeignTypeDef[] = [];
      try {
        defs = this.ctx.cache.typeDefs(abs, statSync(abs), () => readTypeDefs(abs));
      } catch {
        // unreadable: the component keeps the DLL's name
      }
      for (const d of defs) names.set(dllScriptFileId(d.namespace, d.name), d.name);
      this.dllNames.set(path, names);
    }
    return names.get(fileID) ?? null;
  }
}

/** The type a UnityEvent call runs a method on. */
function callTarget(call: AssetCall, f: AssetFacts, facts: Map<string, AssetFacts>, scripts: ScriptResolver, guids: Map<string, string>): Target | null {
  const byName = (): Target | null => {
    const full = call.typeName?.split(",")[0].trim();
    if (!full) return null;
    const s = scripts.resolve(null, `x::${full}`);
    return s?.target ?? null;
  };
  const scriptOf = (owner: AssetFacts | undefined, fileID: string): Target | null | undefined => {
    const c = owner?.components.find((x) => x.id === fileID);
    if (!c) return undefined;
    if (c.className !== "MonoBehaviour") return { lib: UNITY_ENGINE };
    return scripts.resolve(c.script, c.scriptClass)?.target ?? null;
  };
  const t = call.target;
  if (t.guid) {
    // a method on an asset: a ScriptableObject's type
    const p = guids.get(t.guid);
    const so = p ? facts.get(p) : undefined;
    if (so?.root) return scripts.resolve(so.root.script, so.root.scriptClass)?.target ?? byName();
    return byName();
  }
  const local = scriptOf(f, t.fileID);
  if (local !== undefined) return local ?? byName();
  if (f.objects.some((o) => o.id === t.fileID)) return { lib: UNITY_ENGINE }; // GameObject.SetActive and the like
  const stripped = f.stripped[t.fileID];
  if (stripped?.source.guid) {
    const p = guids.get(stripped.source.guid);
    const inNested = scriptOf(p ? facts.get(p) : undefined, stripped.source.fileID);
    if (inNested) return inNested;
  }
  return byName();
}

// ---- GameObject paths and the outline

/** GameObject id -> its path (`Canvas/Header/BuyButton`); a nested instance without a name takes its prefab's. */
function goPaths(f: AssetFacts, prefabName: (r: ObjectRef) => string): (go: string | null) => string {
  const objects = new Map(f.objects.map((o) => [o.id, o]));
  const nestedSource = new Map(f.nested.map((n) => [n.go, n.source]));
  const memo = new Map<string, string>();
  const nameOf = (id: string) => {
    const o = objects.get(id);
    if (o?.name) return o.name;
    const src = nestedSource.get(id);
    return src ? prefabName(src) : "?";
  };
  const path = (go: string | null, depth = 0): string => {
    if (!go) return "";
    const hit = memo.get(go);
    if (hit !== undefined) return hit;
    const parent = objects.get(go)?.parent ?? null;
    const p = parent && depth < 64 ? `${path(parent, depth + 1)}/${nameOf(go)}` : nameOf(go);
    memo.set(go, p);
    return p;
  };
  return path;
}

function outlineOf(
  id: string,
  f: AssetFacts,
  scripts: ScriptResolver,
  assetTarget: (r: ObjectRef) => Target | null,
  assetPath: (r: ObjectRef) => string | null,
  callTargetOf: (call: AssetCall) => Target | null,
  kept: Set<string>,
): AssetOutline {
  const nodeOf = (t: Target | null): string | null => {
    if (!t) return null;
    if ("type" in t) return t.type;
    if ("asset" in t) return kept.has(t.asset) ? assetId(t.asset) : null;
    return t.lib.hidden ? null : `lib:${t.lib.key}`;
  };
  const prefabName = (r: ObjectRef) => {
    const p = assetPath(r);
    return p ? basename(p, extname(p)) : "Prefab";
  };
  const paths = goPaths(f, prefabName);
  const kind = f.kind === "asset" ? "asset" : f.kind;
  if (f.kind === "asset") {
    const fields = f.assigns.flatMap((a) => {
      const p = assetPath(a.target);
      return p ? [{ field: a.field, value: posix.basename(p), id: nodeOf(assetTarget(a.target)) }] : [];
    });
    const name = f.root?.name || basename(f.path, extname(f.path));
    return { id, kind, roots: [{ name, path: "", components: [], fields, calls: [], prefab: null, children: [] }] };
  }
  const nodes = new Map<string, OutlineObject>();
  const place = new Map<OutlineObject, { index: number; line: number }>();
  for (const o of f.objects) {
    const path = paths(o.id);
    const n: OutlineObject = { name: path.split("/").pop() ?? o.name, path, components: [], fields: [], calls: [], prefab: null, children: [] };
    nodes.set(o.id, n);
    place.set(n, { index: o.index, line: o.line });
  }
  for (const c of f.components) {
    const n = c.go ? nodes.get(c.go) : undefined;
    if (!n || c.className === "Transform" || c.className === "RectTransform") continue;
    if (c.className !== "MonoBehaviour") {
      n.components.push({ name: c.className, own: false, id: null });
      continue;
    }
    const s = scripts.resolve(c.script, c.scriptClass);
    n.components.push({ name: s?.name ?? "Missing script", own: !!s?.target && "type" in s.target, id: nodeOf(s?.target ?? null) });
  }
  for (const nest of f.nested) {
    const n = nodes.get(nest.go);
    if (n) n.prefab = { name: prefabName(nest.source), id: nodeOf(assetTarget(nest.source)), variant: nest.variant };
  }
  for (const a of f.assigns) {
    const n = a.go ? nodes.get(a.go) : undefined;
    const p = assetPath(a.target);
    if (n && p) n.fields.push({ field: a.field, value: posix.basename(p), id: nodeOf(assetTarget(a.target)) });
  }
  for (const call of f.calls) {
    const n = call.go ? nodes.get(call.go) : undefined;
    if (!n) continue;
    const target = callTargetOf(call);
    const named = call.typeName?.split(",")[0].trim().split(".").pop();
    const type = named || (target && "type" in target ? (target.type.split(".").pop() ?? "") : target && "lib" in target ? target.lib.name : "");
    n.calls.push({ method: call.method, type, id: nodeOf(target) });
  }
  const roots: OutlineObject[] = [];
  for (const o of f.objects) {
    const n = nodes.get(o.id)!;
    const parent = o.parent ? nodes.get(o.parent) : undefined;
    (parent && parent !== n ? parent.children : roots).push(n);
  }
  const sort = (list: OutlineObject[]) => {
    list.sort((a, b) => place.get(a)!.index - place.get(b)!.index || place.get(a)!.line - place.get(b)!.line);
    for (const n of list) sort(n.children);
  };
  sort(roots);
  return { id, kind, roots };
}
