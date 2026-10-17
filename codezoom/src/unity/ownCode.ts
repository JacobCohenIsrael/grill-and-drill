// Chooses own code: which assemblies, and which of their files, are the
// user's. Without a codezoom.config.json the round-3 defaults apply: test
// assemblies and vendor folders are out, generated and editor code are in.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

const isVendorFolder = (name: string) => VENDOR_CONTAINERS.has(name.toLowerCase()) || VENDOR_FOLDERS.has(name.toLowerCase());

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

export function loadConfig(root: string): { config: Config; path: string | null } {
  const path = join(root, CONFIG_FILE);
  if (!existsSync(path)) return { config: {}, path: null };
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
  for (const p of assemblies) {
    for (const path of p.compile) {
      if (!path.endsWith(".cs")) continue;
      if (ALWAYS_SKIP.some((s) => path.startsWith(s) || path.includes("/" + s))) continue;
      const included = include.some((f) => path.startsWith(f));
      const vendor = exclude.some((f) => path.startsWith(f)) || (!included && isVendorPath(path));
      (vendor ? vendorFiles : files).push({ path, assembly: p.assembly });
    }
  }
  return { configPath, assemblies, files, skipped, vendorFiles };
}

function folderPrefix(f: string): string {
  const clean = f.replace(/\\/g, "/").replace(/^\.\//, "");
  return clean.endsWith("/") ? clean : clean + "/";
}

function isVendorPath(path: string): boolean {
  return path.split("/").slice(0, -1).some(isVendorFolder);
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
  return { key: parts.slice(0, -1).join("/"), name: parts[parts.length - 2] ?? path, hidden: false };
}
