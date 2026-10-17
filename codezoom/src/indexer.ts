// Full index of a Unity project: own code, foreign libraries, graph, screens.
// The first slice re-indexes on every launch (no cache, no watching).

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { readFile } from "./csharp/reader.js";
import type { FileFacts } from "./csharp/facts.js";
import type { ForeignType } from "./csharp/resolver.js";
import { readTypeDefs } from "./dotnet/metadata.js";
import { IndexCache } from "./cache.js";
import { buildGraph, type Graph } from "./graph/build.js";
import { buildScreens, type Screens } from "./graph/screens.js";
import { readCsprojs, type Csproj } from "./unity/csproj.js";
import { InstalledEditors } from "./unity/editors.js";
import { LibraryMap } from "./unity/libraries.js";
import { chooseOwnCode, loadConfig, vendorLibrary, type OwnCode } from "./unity/ownCode.js";

export interface Index {
  root: string;
  own: OwnCode;
  graph: Graph;
  screens: Screens;
  timings: Record<string, number>;
  dlls: { read: number; missing: string[]; substituted: number; extraModules: number; editors: InstalledEditors };
  /** Every foreign type name read, for diagnostics. */
  foreign: ForeignType[];
  /** Source files read afresh in this run; the rest came from the cache. */
  changed: string[];
  fromCache: number;
}

export function indexProject(root: string, configFile?: string, cache: IndexCache = IndexCache.load(null)): Index {
  cache.begin();
  const timings: Record<string, number> = {};
  let mark = performance.now();
  const lap = (name: string) => {
    const now = performance.now();
    timings[name] = Math.round(now - mark);
    mark = now;
  };
  const start = mark;

  const projects = readCsprojs(root);
  if (projects.length === 0) {
    throw new Error(
      `No .csproj files in ${root}. Open the project in Unity once with Rider (or Visual Studio) as the external editor so Unity generates them.`,
    );
  }
  const { config, path: configPath } = loadConfig(root, configFile);
  const own = chooseOwnCode(projects, config, configPath);
  lap("projects");

  const libraries = new LibraryMap(root);
  lap("packages");

  // foreign types: every DLL the own assemblies reference, plus assemblies
  // they reference by project that are not own code
  const ownNames = new Set(own.assemblies.map((p) => p.assembly));
  const byAssembly = new Map(projects.map((p) => [p.assembly, p]));
  const editors = new InstalledEditors();
  const dllPaths = new Map<string, string>(); // path -> assembly name
  const missing = new Set<string>();
  const fromSource = new Set<Csproj>(); // referenced, not own, no DLL built
  let substituted = 0;
  const seenHints = new Set<string>();
  for (const p of own.assemblies) {
    for (const r of p.references) {
      if (seenHints.has(r.hintPath)) continue;
      seenHints.add(r.hintPath);
      if (existsSync(r.hintPath)) dllPaths.set(r.hintPath, r.name);
      else {
        const alt = editors.substitute(r.hintPath);
        if (alt) {
          dllPaths.set(alt, r.name);
          substituted++;
        } else missing.add(r.hintPath);
      }
    }
    for (const ref of p.projectReferences) {
      if (ownNames.has(ref)) continue;
      const dll = join(root, "Library", "ScriptAssemblies", `${ref}.dll`);
      const proj = byAssembly.get(ref);
      if (existsSync(dll)) dllPaths.set(dll, ref);
      else if (proj) fromSource.add(proj);
      else missing.add(dll);
    }
  }
  // modules move between Unity versions (PreserveAttribute left SharedInternalsModule):
  // when one is missing in the stand-in editor, read all of its modules
  let extraModules = 0;
  if ([...missing].some((m) => m.includes("/Managed/UnityEngine/"))) {
    const loaded = new Set([...dllPaths.keys()].map((p) => basename(p)));
    for (const folder of editors.moduleFolders()) {
      for (const f of readdirSync(folder)) {
        if (!f.endsWith(".dll") || loaded.has(f)) continue;
        dllPaths.set(join(folder, f), f.slice(0, -4));
        loaded.add(f);
        extraModules++;
      }
    }
  }
  const libraryOf = (assembly: string, path: string) => {
    const proj = byAssembly.get(assembly);
    return proj && !ownNames.has(assembly) ? libraries.forProject(proj) : libraries.forAssembly(assembly, path);
  };
  const foreign: ForeignType[] = [];
  let read = 0;
  for (const [path, assembly] of dllPaths) {
    const lib = libraryOf(assembly, path);
    try {
      for (const d of cache.typeDefs(path, statSync(path), () => readTypeDefs(path))) {
        foreign.push({ full: d.namespace ? `${d.namespace}.${d.name}` : d.name, name: d.name, arity: d.arity, namespace: d.namespace, lib, isInterface: d.isInterface });
      }
      read++;
    } catch {
      missing.add(path);
    }
  }
  lap("foreign");

  // vendor source inside own assemblies, and referenced assemblies with no
  // DLL built: read their declarations, their types are foreign
  const vendorSources = [
    ...own.vendorFiles.map((f) => ({ ...f, lib: vendorLibrary(f.path) })),
    ...[...fromSource].flatMap((p) => p.compile.filter((f) => f.endsWith(".cs")).map((path) => ({ path, assembly: p.assembly, lib: libraries.forProject(p) }))),
  ];
  const definesOf = new Map(projects.map((p) => [p.assembly, new Set(p.defines)]));
  const contextOf = new Map(
    projects.map((p) => [p.assembly, `${p.assembly}:${createHash("sha1").update(p.defines.join(";")).digest("hex").slice(0, 16)}`]),
  );
  const readSource = (path: string, assembly: string): FileFacts | null => {
    let stamp;
    try {
      stamp = statSync(join(root, path));
    } catch {
      return null;
    }
    return cache.fileFacts(path, stamp, contextOf.get(assembly) ?? assembly, () => {
      let text: string;
      try {
        text = readFileSync(join(root, path), "utf8");
      } catch {
        return null;
      }
      return readFile(path, assembly, text.replace(/^\uFEFF/, ""), definesOf.get(assembly));
    });
  };
  for (const f of vendorSources) {
    const facts = readSource(f.path, f.assembly);
    if (!facts) continue;
    for (const t of facts.types) {
      if (t.outer) continue;
      foreign.push({ full: t.key, name: t.name, arity: t.arity, namespace: t.namespace, lib: f.lib, isInterface: t.kind === "interface" });
    }
  }
  lap("vendor");

  const files: FileFacts[] = [];
  for (const f of own.files) {
    const facts = readSource(f.path, f.assembly);
    if (facts) files.push(facts);
  }
  lap("parse");

  const graph = buildGraph(files, foreign);
  lap("resolve");

  const edges = [...graph.out.values()].reduce((n, m) => n + m.size, 0);
  const stats = {
    files: files.length,
    types: graph.types.size,
    libraries: graph.libraries.size,
    edges,
    references: graph.references,
    unresolved: [...graph.unresolved.values()].reduce((a, b) => a + b, 0),
    timings,
  };
  const screens = buildScreens(graph, basename(root), stats);
  lap("screens");
  cache.end();
  timings.total = Math.round(performance.now() - start);
  return {
    root,
    own,
    graph,
    screens,
    timings,
    dlls: { read, missing: [...missing], substituted, extraModules, editors },
    foreign,
    changed: [...cache.changed],
    fromCache: cache.hits,
  };
}

