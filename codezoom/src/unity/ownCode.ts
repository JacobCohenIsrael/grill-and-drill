// Chooses own code: which assemblies, and which of their files, are the
// user's. Without a codezoom.config.json the round-3 defaults apply: test
// assemblies and vendor folders are out, generated and editor code are in.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Csproj } from "./csproj.js";
import type { LibraryInfo } from "./libraries.js";

export const CONFIG_FILE = "codezoom.config.json";

export interface Config {
  /** Assemblies that are own code. Omit to use the defaults. */
  assemblies?: string[];
  /** Folders (project-relative) whose files are never own code. */
  excludeFolders?: string[];
  /** Folders that are own code even when a default rule would leave them out. */
  includeFolders?: string[];
}

/** Folders that are never read, wherever they appear. */
const ALWAYS_SKIP = ["Library/", "Temp/", "obj/", ".git/", ".claude/worktrees/"];

/** Folders that hold other people's code, one library per subfolder. */
const VENDOR_CONTAINERS = new Set(["plugins", "thirdparty", "third party", "third-party", "3rdparty", "vendor", "vendors", "external", "externals"]);
/** Folders that are one vendor's code. */
const VENDOR_FOLDERS = new Set(["textmesh pro", "demigiant", "photon", "assetstoretools"]);


export interface OwnCode {
  configPath: string | null;
  assemblies: Csproj[];
  /** Project-relative paths of own-code files, with their assembly. */
  files: { path: string; assembly: string }[];
  /** Assemblies left out, and why, for the startup report. */
  skipped: { assembly: string; reason: string }[];
  /** Files of chosen assemblies left out as vendor code. */
  vendorFiles: { path: string; assembly: string }[];
}

/** The project's codezoom.config.json, or the file given with --config. */
export function loadConfig(root: string, explicitPath?: string): { config: Config; path: string | null } {
  const path = explicitPath ? resolve(explicitPath) : join(root, CONFIG_FILE);
  if (!existsSync(path)) {
    if (explicitPath) throw new Error(`config file not found: ${path}`);
    return { config: {}, path: null };
  }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return { config: raw as Config, path };
}

export function isTestAssembly(p: Csproj): boolean {
  return /(^|\.)Tests?(\.|$)/i.test(p.assembly) || /Tests$/.test(p.assembly);
}

export function chooseOwnCode(projects: Csproj[], config: Config, configPath: string | null): OwnCode {
  const exclude = (config.excludeFolders ?? []).map(folderPrefix);
  const include = (config.includeFolders ?? []).map(folderPrefix);
  const assemblies: Csproj[] = [];
  const skipped: OwnCode["skipped"] = [];

  for (const p of projects) {
    if (config.assemblies) {
      if (config.assemblies.includes(p.assembly)) assemblies.push(p);
      else skipped.push({ assembly: p.assembly, reason: "not listed in config" });
      continue;
    }
    if (p.compile.length === 0) skipped.push({ assembly: p.assembly, reason: "no source files" });
    else if (isTestAssembly(p)) skipped.push({ assembly: p.assembly, reason: "test assembly" });
    else if (!p.compile.some((f) => f.startsWith("Assets/"))) skipped.push({ assembly: p.assembly, reason: "outside Assets/" });
    else assemblies.push(p);
  }

  const files: OwnCode["files"] = [];
  const vendorFiles: OwnCode["vendorFiles"] = [];
  const kept: Csproj[] = [];
  for (const p of assemblies) {
    const own: OwnCode["files"] = [];
    const vendor: OwnCode["vendorFiles"] = [];
    for (const path of p.compile) {
      if (!path.endsWith(".cs")) continue;
      if (ALWAYS_SKIP.some((s) => path.startsWith(s) || path.includes("/" + s))) continue;
      const included = include.some((f) => path.startsWith(f));
      const isVendor = exclude.some((f) => path.startsWith(f)) || (!included && isVendorPath(path));
      (isVendor ? vendor : own).push({ path, assembly: p.assembly });
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
  return { configPath, assemblies: kept, files, skipped, vendorFiles };
}

function folderPrefix(f: string): string {
  const clean = f.replace(/\\/g, "/").replace(/^\.\//, "");
  return clean.endsWith("/") ? clean : clean + "/";
}

/**
 * Container folders (Plugins, ThirdParty, …) mark vendor code at any depth.
 * A vendor's own folder name (Photon, Demigiant, …) only counts right under
 * Assets/ or a container: Assets/Scripts/Game/Photon/ is the user's code.
 */
function isVendorPath(path: string): boolean {
  const folders = path.split("/").slice(0, -1).map((f) => f.toLowerCase());
  return folders.some(
    (f, i) => VENDOR_CONTAINERS.has(f) || (VENDOR_FOLDERS.has(f) && (i === 1 || VENDOR_CONTAINERS.has(folders[i - 1]))),
  );
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
