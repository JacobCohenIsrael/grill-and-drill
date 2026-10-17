// Which code is own code: the round-3 rules and codezoom.config.json, shared
// by the indexer and the setup page so both count files the same way. A
// plain .NET folder (ADR 0006) has simpler defaults: every project in the
// solution but the test projects.

export const CONFIG_FILE = "codezoom.config.json";

export type ProjectKind = "unity" | "dotnet";

/** What the default rules need to know about an assembly beyond its name and files. */
export interface VerdictHints {
  kind?: ProjectKind;
  /** .NET: IsTestProject, or a test framework package. */
  isTest?: boolean;
  /** .NET: referenced by a project of the solution, not listed in it: a foreign library until ticked. */
  outsideSolution?: boolean;
}

export interface Config {
  /** Assemblies that are own code. */
  assemblies?: string[];
  /** Assemblies reviewed and left out. An assembly in neither list is new and follows the default rules. */
  excluded?: string[];
  /** Folders (project-relative) whose files are not own code. */
  excludeFolders?: string[];
  /** Folders that are own code even when a default rule would leave them out. */
  includeFolders?: string[];
}

/** Folders that are never read, wherever they appear. */
export const ALWAYS_SKIP = ["Library/", "Temp/", "obj/", ".git/", ".claude/worktrees/"];

/** Folders that hold other people's code, one library per subfolder. */
export const VENDOR_CONTAINERS = new Set(["plugins", "thirdparty", "third party", "third-party", "3rdparty", "vendor", "vendors", "external", "externals"]);
/** Folders that are one vendor's code. */
export const VENDOR_FOLDERS = new Set(["textmesh pro", "demigiant", "photon", "assetstoretools"]);

export function isTestAssembly(name: string): boolean {
  return /(^|\.)Tests?(\.|$)/i.test(name) || /Tests$/.test(name);
}

export function isSkipped(path: string): boolean {
  return ALWAYS_SKIP.some((s) => path.startsWith(s) || path.includes("/" + s));
}

/**
 * Container folders (Plugins, ThirdParty, …) mark vendor code at any depth.
 * A vendor's own folder name (Photon, Demigiant, …) only counts right under
 * Assets/ or a container: Assets/Scripts/Game/Photon/ is the user's code.
 */
export function isVendorPath(path: string): boolean {
  const folders = path.split("/").slice(0, -1).map((f) => f.toLowerCase());
  return folders.some((f, i) => VENDOR_CONTAINERS.has(f) || (VENDOR_FOLDERS.has(f) && (i === 1 || VENDOR_CONTAINERS.has(folders[i - 1]))));
}

export function folderPrefix(f: string): string {
  const clean = f.replace(/\\/g, "/").replace(/^\.\//, "");
  return clean.endsWith("/") ? clean : clean + "/";
}

/** The folder rules of a config, ready to ask about a file. */
export class FolderRules {
  private exclude: string[];
  private include: string[];

  private kind: ProjectKind;

  constructor(config: Config, kind: ProjectKind = "unity") {
    this.exclude = (config.excludeFolders ?? []).map(folderPrefix);
    this.include = (config.includeFolders ?? []).map(folderPrefix);
    this.kind = kind;
  }

  /** A file in a chosen assembly is own code unless a folder says otherwise; the most specific folder wins. */
  isOwnFile(path: string): boolean {
    const longest = (list: string[]) => list.reduce((n, f) => (path.startsWith(f) && f.length > n ? f.length : n), -1);
    const ex = longest(this.exclude);
    const inc = longest(this.include);
    if (ex >= 0 || inc >= 0) return inc > ex;
    // Unity projects carry vendors' code in Plugins/ and the like; a .NET project's files are its own
    return this.kind === "dotnet" || !isVendorPath(path);
  }
}

export interface Verdict {
  own: boolean;
  /** Why it is left out, for the startup report and the setup page. */
  reason: string | null;
  /** In neither list of a config that has both: follows the default rules until reviewed. */
  isNew: boolean;
}

/** The default rules (round 3) for an assembly no config decides. */
export function defaultVerdict(name: string, files: string[], hints: VerdictHints = {}): Omit<Verdict, "isNew"> {
  if (!files.some((f) => f.endsWith(".cs"))) return { own: false, reason: "no source files" };
  if (hints.kind === "dotnet") {
    if (hints.isTest) return { own: false, reason: "test project" };
    if (hints.outsideSolution) return { own: false, reason: "outside the solution" };
    return { own: true, reason: null };
  }
  if (isTestAssembly(name)) return { own: false, reason: "test assembly" };
  if (!files.some((f) => f.startsWith("Assets/"))) return { own: false, reason: "outside Assets/" };
  return { own: true, reason: null };
}

/**
 * Whether an assembly is own code under a config. A config without
 * `excluded` (written by hand before the wizard) lists everything that is own.
 */
export function verdict(name: string, files: string[], config: Config | null, hints: VerdictHints = {}): Verdict {
  if (!config?.assemblies) return { ...defaultVerdict(name, files, hints), isNew: false };
  if (config.assemblies.includes(name)) return { own: true, reason: null, isNew: false };
  if (!config.excluded) return { own: false, reason: "not listed in config", isNew: false };
  if (config.excluded.includes(name)) return { own: false, reason: "left out in setup", isNew: false };
  return { ...defaultVerdict(name, files, hints), isNew: files.some((f) => f.endsWith(".cs")) };
}
