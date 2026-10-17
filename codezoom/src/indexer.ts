// Full index of a Unity project: own code, foreign libraries, graph, screens.
// The first slice re-indexes on every launch (no cache, no watching).

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readFile } from "./csharp/reader.js";
import type { FileFacts } from "./csharp/facts.js";
import type { ForeignType } from "./csharp/resolver.js";
import { readTypeDefs } from "./dotnet/metadata.js";
import { buildGraph, type Graph } from "./graph/build.js";
import { buildScreens, type Screens } from "./graph/screens.js";
import { readCsprojs } from "./unity/csproj.js";
import { LibraryMap } from "./unity/libraries.js";
import { chooseOwnCode, loadConfig, vendorLibrary, type OwnCode } from "./unity/ownCode.js";

export interface Index {
  root: string;
  own: OwnCode;
  graph: Graph;
  screens: Screens;
  timings: Record<string, number>;
  dlls: { read: number; missing: string[] };
}

export function indexProject(root: string): Index {
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
  const { config, path: configPath } = loadConfig(root);
  const own = chooseOwnCode(projects, config, configPath);
  lap("projects");

  const libraries = new LibraryMap(root);
  lap("packages");

  // foreign types: every DLL the own assemblies reference, plus assemblies
  // they reference by project that are not own code
  const ownNames = new Set(own.assemblies.map((p) => p.assembly));
  const dllPaths = new Map<string, string>(); // hint path -> assembly name
  for (const p of own.assemblies) {
    for (const r of p.references) dllPaths.set(r.hintPath, r.name);
    for (const ref of p.projectReferences) {
      if (ownNames.has(ref)) continue;
      dllPaths.set(join(root, "Library", "ScriptAssemblies", `${ref}.dll`), ref);
    }
  }
  const foreign: ForeignType[] = [];
  const missing: string[] = [];
  let read = 0;
  for (const [path, assembly] of dllPaths) {
    if (!existsSync(path)) {
      missing.push(path);
      continue;
    }
    const lib = libraries.forAssembly(assembly, path);
    try {
      for (const d of readTypeDefs(path)) {
        foreign.push({ full: d.namespace ? `${d.namespace}.${d.name}` : d.name, name: d.name, arity: d.arity, namespace: d.namespace, lib, isInterface: d.isInterface });
      }
      read++;
    } catch {
      missing.push(path);
    }
  }
  lap("foreign");

  // vendor source inside own assemblies: its types are foreign
  for (const f of own.vendorFiles) {
    const facts = readSource(root, f.path, f.assembly);
    if (!facts) continue;
    const lib = vendorLibrary(f.path);
    for (const t of facts.types) {
      if (t.outer) continue;
      foreign.push({ full: t.key, name: t.name, arity: t.arity, namespace: t.namespace, lib, isInterface: t.kind === "interface" });
    }
  }
  lap("vendor");

  const files: FileFacts[] = [];
  for (const f of own.files) {
    const facts = readSource(root, f.path, f.assembly);
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
  timings.total = Math.round(performance.now() - start);
  return { root, own, graph, screens, timings, dlls: { read, missing } };
}

function readSource(root: string, path: string, assembly: string): FileFacts | null {
  let text: string;
  try {
    text = readFileSync(join(root, path), "utf8");
  } catch {
    return null;
  }
  return readFile(path, assembly, text.replace(/^﻿/, ""));
}
