// Foreign libraries of a plain .NET project (ADR 0006): one node per NuGet
// package, matched by reading the DLLs `dotnet restore` recorded in
// obj/project.assets.json. The .NET base library is hidden; ASP.NET Core's
// shared framework is one node.

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import type { LibraryInfo } from "../unity/libraries.js";
import type { ForeignTypeDef } from "./metadata.js";

export const DOTNET_LIBRARY: LibraryInfo = { key: "dotnet", name: ".NET", hidden: true };
export const ASPNETCORE_LIBRARY: LibraryInfo = { key: "Microsoft.AspNetCore.App", name: "ASP.NET Core", hidden: false };

/** Out-of-band parts of the base library that ship as packages: hidden like the rest of it. */
const BASE_PACKAGES = /^(System(\..+)?|Microsoft\.(CSharp|VisualBasic|Win32\..+|NETCore\..+|Bcl\..+)|NETStandard\.Library|runtime\..+)$/i;

export function packageLibrary(id: string): LibraryInfo {
  return { key: id, name: id, hidden: BASE_PACKAGES.test(id) };
}

export interface RestoredPackage {
  id: string;
  dlls: string[];
}

/** The packages a restored project compiles against, with their DLLs; null when the file can't be read. */
export function readAssets(path: string, tfm: string | null): { packages: RestoredPackage[]; frameworks: string[] } | null {
  let json: {
    targets?: Record<string, Record<string, { type?: string; compile?: Record<string, unknown> }>>;
    libraries?: Record<string, { path?: string }>;
    packageFolders?: Record<string, unknown>;
    project?: { frameworks?: Record<string, { frameworkReferences?: Record<string, unknown> }> };
  };
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  const targets = Object.keys(json.targets ?? {});
  const want = (tfm ?? "").toLowerCase();
  const key = targets.find((t) => t.toLowerCase() === want) ?? targets.find((t) => !t.includes("/") && t.toLowerCase().startsWith(want)) ?? targets.find((t) => !t.includes("/")) ?? targets[0];
  if (!key) return { packages: [], frameworks: [] };
  const folders = Object.keys(json.packageFolders ?? {});
  const packages: RestoredPackage[] = [];
  for (const [name, entry] of Object.entries(json.targets![key])) {
    if (entry.type !== "package") continue;
    const id = name.slice(0, name.lastIndexOf("/"));
    const rel = json.libraries?.[name]?.path ?? name.toLowerCase();
    const dlls: string[] = [];
    for (const asset of Object.keys(entry.compile ?? {})) {
      if (!asset.toLowerCase().endsWith(".dll")) continue; // `_._` marks "nothing to compile against"
      const found = folders.map((f) => join(f, rel, asset)).find(existsSync);
      if (found) dlls.push(found);
    }
    packages.push({ id, dlls });
  }
  const fw = json.project?.frameworks ?? {};
  const fwKey = Object.keys(fw).find((k) => k.toLowerCase() === want) ?? Object.keys(fw)[0];
  return { packages, frameworks: Object.keys((fwKey && fw[fwKey].frameworkReferences) || {}) };
}

/** Installed .NET SDK folders, from DOTNET_ROOT, PATH and the usual places. */
export function dotnetRoots(): string[] {
  const found = new Set<string>();
  const add = (d: string | undefined) => {
    if (d && existsSync(join(d, "packs"))) found.add(d);
  };
  add(process.env.DOTNET_ROOT);
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    for (const exe of ["dotnet", "dotnet.exe"]) {
      const p = join(dir, exe);
      if (!existsSync(p)) continue;
      try {
        add(dirname(realpathSync(p)));
      } catch {
        // a dangling link: not an SDK
      }
    }
  }
  for (const d of [join(homedir(), ".dotnet"), "/usr/local/share/dotnet", "/usr/share/dotnet", "/usr/lib/dotnet", "C:\\Program Files\\dotnet"]) add(d);
  return [...found];
}

/**
 * The folder of reference DLLs a targeting pack has for a framework
 * (packs/Microsoft.NETCore.App.Ref/8.0.x/ref/net8.0), newest patch first.
 */
export function findRefPack(pack: string, tfm: string | null, roots = dotnetRoots()): string | null {
  const m = /^net(\d+\.\d+)/i.exec(tfm ?? "");
  if (!m) return null;
  const folder = `net${m[1]}`;
  for (const root of roots) {
    const base = join(root, "packs", pack);
    let versions: string[];
    try {
      versions = readdirSync(base).filter((v) => v.startsWith(`${m[1]}.`));
    } catch {
      continue;
    }
    versions.sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
    for (const v of versions) {
      const dir = join(base, v, "ref", folder);
      if (existsSync(dir)) return dir;
    }
  }
  return null;
}

export interface ShippedTypes {
  about: string;
  /** namespace -> names; `^` marks an interface, `Name\`2` the arity. */
  types: Record<string, string[]>;
}

/** A type list that ships with codezoom (data/), for machines without a .NET SDK. */
export function shippedTypes(file: "dotnet-base-types.json" | "aspnetcore-types.json"): ForeignTypeDef[] {
  const list = JSON.parse(readFileSync(new URL(`../../../data/${file}`, import.meta.url), "utf8")) as ShippedTypes;
  const out: ForeignTypeDef[] = [];
  for (const [namespace, names] of Object.entries(list.types)) {
    for (const entry of names) {
      const isInterface = entry.startsWith("^");
      const [name, arity] = entry.replace(/^\^/, "").split("`");
      out.push({ namespace, name, arity: arity ? Number(arity) : 0, isInterface });
    }
  }
  return out;
}

/**
 * Where a package's types live when its DLLs can't be read: its id as a
 * namespace (Newtonsoft.Json), and for an .Abstractions or .Core package the
 * namespace it extends (Microsoft.Extensions.Logging.Abstractions -> Microsoft.Extensions.Logging).
 */
export function rootNamespaces(id: string): { root: string; exact: boolean }[] {
  const out = [{ root: id, exact: true }];
  const m = /^(.+)\.(Abstractions|Core)$/i.exec(id);
  if (m) out.push({ root: m[1], exact: false });
  return out;
}
