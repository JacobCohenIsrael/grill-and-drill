// The foreign side of a plain .NET folder (ADR 0006): every restored
// package's types from its DLLs, the base library (hidden) from an installed
// targeting pack or the list codezoom ships, and for a project that has not
// been restored, its packages by root namespace.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { IndexCache } from "../cache.js";
import type { FallbackRoot, ForeignType } from "../csharp/resolver.js";
import type { Csproj } from "../unity/csproj.js";
import type { LibraryInfo } from "../unity/libraries.js";
import type { OwnCode } from "../unity/ownCode.js";
import { isWebSdk } from "./frameworks.js";
import { readTypeDefs, type ForeignTypeDef } from "./metadata.js";
import { ASPNETCORE_LIBRARY, DOTNET_LIBRARY, dotnetRoots, findRefPack, packageLibrary, readAssets, rootNamespaces, shippedTypes } from "./packages.js";

export interface DotnetForeign {
  foreign: ForeignType[];
  /** Projects own code references that are not own code: their declarations are read as foreign. */
  fromSource: { project: Csproj; lib: LibraryInfo }[];
  fallback: FallbackRoot[];
  globalUsings: string[];
  /** Own projects with no obj/project.assets.json. */
  unrestored: string[];
  /** Where the base library's names came from. */
  baseLibrary: "targeting pack" | "codezoom's list" | "given";
  dlls: { read: number; missing: string[] };
}

const OTHER_FRAMEWORKS: Record<string, string> = { "Microsoft.WindowsDesktop.App": "Windows Desktop" };

export function dotnetForeign(projects: Csproj[], own: OwnCode, cache: IndexCache, given?: ForeignType[], sdkRoots = dotnetRoots()): DotnetForeign {
  const ownNames = new Set(own.assemblies.map((p) => p.assembly));
  const byAssembly = new Map(projects.map((p) => [p.assembly, p]));
  const globalUsings = [...new Set(own.assemblies.flatMap((p) => p.dotnet?.globalUsings ?? []))];
  const fromSource = new Map<string, { project: Csproj; lib: LibraryInfo }>();
  for (const p of own.assemblies) {
    for (const ref of p.projectReferences) {
      const proj = byAssembly.get(ref);
      if (proj && !ownNames.has(ref)) fromSource.set(ref, { project: proj, lib: { key: ref, name: ref, hidden: false } });
    }
  }
  const result: DotnetForeign = { foreign: [], fromSource: [...fromSource.values()], fallback: [], globalUsings, unrestored: [], baseLibrary: "given", dlls: { read: 0, missing: [] } };
  if (given) {
    // a committed list stands in for restored DLLs and the SDK: exact, on any machine
    result.foreign = [...given];
    return result;
  }

  const read = (path: string, lib: LibraryInfo) => {
    try {
      for (const d of cache.typeDefs(path, statSync(path), () => readTypeDefs(path))) result.foreign.push(foreignOf(d, lib));
      result.dlls.read++;
    } catch {
      result.dlls.missing.push(path);
    }
  };
  const seenDlls = new Set<string>();
  const roots = new Map<string, FallbackRoot>();
  // a project sees its own packages and those of the projects it references, as NuGet passes them on
  const visible = (p: Csproj, seen = new Set<string>()): string[] => {
    if (seen.has(p.assembly)) return [];
    seen.add(p.assembly);
    return [...(p.dotnet?.packages ?? []), ...p.projectReferences.flatMap((r) => (byAssembly.has(r) ? visible(byAssembly.get(r)!, seen) : []))];
  };
  const frameworks = new Set<string>();
  let tfm: string | null = null;
  for (const p of own.assemblies) {
    const d = p.dotnet;
    if (!d) continue;
    if (d.targetFramework && (!tfm || d.targetFramework.localeCompare(tfm, "en", { numeric: true }) > 0)) tfm = d.targetFramework;
    for (const f of d.frameworkReferences) frameworks.add(f);
    if (isWebSdk(d.sdk)) frameworks.add(ASPNETCORE_LIBRARY.key);
    const assets = d.assets ? readAssets(d.assets, d.targetFramework) : null;
    if (assets) {
      for (const f of assets.frameworks) frameworks.add(f);
      for (const pkg of assets.packages) {
        const lib = packageLibrary(pkg.id);
        for (const dll of pkg.dlls) {
          if (seenDlls.has(dll)) continue;
          seenDlls.add(dll);
          read(dll, lib);
        }
      }
      continue;
    }
    // with no packages to match, a restore would change nothing
    const packages = new Set(visible(p));
    if (packages.size) result.unrestored.push(p.assembly);
    for (const id of packages) {
      for (const r of rootNamespaces(id)) {
        const key = `${r.root}\u0000${id}`;
        let root = roots.get(key);
        if (!root) roots.set(key, (root = { ...r, lib: packageLibrary(id), assemblies: [] }));
        root.assemblies!.push(p.assembly);
      }
    }
  }
  result.fallback = [...roots.values()];

  // the base library, hidden: the SDK's reference DLLs when one is installed, else the list codezoom ships
  const basePack = findRefPack("Microsoft.NETCore.App.Ref", tfm, sdkRoots);
  if (basePack) {
    for (const f of dllsIn(basePack)) read(f, DOTNET_LIBRARY);
    result.baseLibrary = "targeting pack";
  } else {
    for (const d of shippedTypes("dotnet-base-types.json")) result.foreign.push(foreignOf(d, DOTNET_LIBRARY));
    result.baseLibrary = "codezoom's list";
  }
  for (const fw of frameworks) {
    if (fw === "Microsoft.NETCore.App") continue;
    const lib = fw === ASPNETCORE_LIBRARY.key ? ASPNETCORE_LIBRARY : { key: fw, name: OTHER_FRAMEWORKS[fw] ?? fw.replace(/\.App$/, ""), hidden: false };
    const pack = findRefPack(`${fw}.Ref`, tfm, sdkRoots);
    if (pack) for (const f of dllsIn(pack)) read(f, lib);
    else if (lib === ASPNETCORE_LIBRARY) for (const d of shippedTypes("aspnetcore-types.json")) result.foreign.push(foreignOf(d, lib));
  }
  return result;
}

/** The note every Screen and answer carries while some projects are not restored. */
export function restoreNote(unrestored: string[]): string | null {
  if (!unrestored.length) return null;
  const names = `${unrestored.slice(0, 4).join(", ")}${unrestored.length > 4 ? ", …" : ""}`;
  return `Not restored: ${names}. Their packages are matched by root namespace; run \`dotnet restore\` to make it exact.`;
}

function foreignOf(d: ForeignTypeDef, lib: LibraryInfo): ForeignType {
  return { full: d.namespace ? `${d.namespace}.${d.name}` : d.name, name: d.name, arity: d.arity, namespace: d.namespace, lib, isInterface: d.isInterface };
}

function dllsIn(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".dll"))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}
