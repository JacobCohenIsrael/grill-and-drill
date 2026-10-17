// Chooses own code: which assemblies, and which of their files, are the
// user's. The rules themselves live in shared/ownRules.ts (the setup page
// uses them too); this applies them to the project's .csproj files.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Csproj } from "./csproj.js";
import type { LibraryInfo } from "./libraries.js";
import { CONFIG_FILE, FolderRules, VENDOR_CONTAINERS, VENDOR_FOLDERS, isSkipped, verdict, type Config, type ProjectKind, type VerdictHints } from "../shared/ownRules.js";

export { CONFIG_FILE, type Config } from "../shared/ownRules.js";

export interface OwnCode {
  configPath: string | null;
  assemblies: Csproj[];
  /** Project-relative paths of own-code files, with their assembly. */
  files: { path: string; assembly: string }[];
  /** Assemblies left out, and why, for the startup report. */
  skipped: { assembly: string; reason: string }[];
  /** Files of chosen assemblies left out as vendor code. */
  vendorFiles: { path: string; assembly: string }[];
  /** Assemblies the config has not reviewed yet (it lists neither way). */
  newAssemblies: string[];
}

/**
 * The project's codezoom.config.json, or the file given with --config. A
 * missing file means no config yet: the defaults apply and setup saves there.
 */
export function loadConfig(root: string, explicitPath?: string): { config: Config | null; path: string } {
  const path = explicitPath ? resolve(explicitPath) : join(root, CONFIG_FILE);
  if (!existsSync(path)) return { config: null, path };
  return { config: JSON.parse(readFileSync(path, "utf8")) as Config, path };
}

/** What the default rules need to know about a project beyond its files. */
export function hintsFor(p: Csproj, kind: ProjectKind): VerdictHints {
  return kind === "dotnet" ? { kind, isTest: p.dotnet?.isTest ?? false, outsideSolution: p.dotnet ? !p.dotnet.inSolution : false } : { kind };
}

export function chooseOwnCode(projects: Csproj[], config: Config | null, configPath: string | null, kind: ProjectKind = "unity"): OwnCode {
  const rules = new FolderRules(config ?? {}, kind);
  const assemblies: Csproj[] = [];
  const skipped: OwnCode["skipped"] = [];
  const newAssemblies: string[] = [];

  for (const p of projects) {
    const v = verdict(p.assembly, p.compile, config, hintsFor(p, kind));
    if (v.isNew) newAssemblies.push(p.assembly);
    if (v.own) assemblies.push(p);
    else skipped.push({ assembly: p.assembly, reason: v.reason ?? "left out" });
  }

  const files: OwnCode["files"] = [];
  const vendorFiles: OwnCode["vendorFiles"] = [];
  const kept: Csproj[] = [];
  for (const p of assemblies) {
    const own: OwnCode["files"] = [];
    const vendor: OwnCode["vendorFiles"] = [];
    for (const path of p.compile) {
      if (!path.endsWith(".cs") || isSkipped(path)) continue;
      (rules.isOwnFile(path) ? own : vendor).push({ path, assembly: p.assembly });
    }
    if (own.length === 0) {
      // all of it is someone else's: a foreign library, read like any other
      skipped.push({ assembly: p.assembly, reason: p.compile.length ? "only vendor folders" : "no source files" });
      continue;
    }
    kept.push(p);
    files.push(...own);
    vendorFiles.push(...vendor);
  }
  return { configPath: config ? configPath : null, assemblies: kept, files, skipped, vendorFiles, newAssemblies };
}

/** The foreign library a vendor source file belongs to, e.g. Assets/Plugins/Foo/... -> "Foo". */
export function vendorLibrary(path: string): LibraryInfo {
  const parts = path.split("/");
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i].toLowerCase();
    if (VENDOR_CONTAINERS.has(p) && i + 1 < parts.length - 1) {
      return { key: parts.slice(0, i + 2).join("/"), name: parts[i + 1], hidden: false };
    }
    if (VENDOR_FOLDERS.has(p)) return { key: parts.slice(0, i + 1).join("/"), name: parts[i], hidden: false };
  }
  // no vendor folder: the top folder under Assets/ (Assets/UniWebView/Script/x.cs -> UniWebView)
  const top = parts[0] === "Assets" && parts.length > 2 ? 2 : parts.length - 1;
  return { key: parts.slice(0, top).join("/"), name: parts[top - 1] ?? path, hidden: false };
}
