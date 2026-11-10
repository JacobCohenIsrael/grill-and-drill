// What the setup page and the startup report say about the project: a Unity
// project (its version, the editor whose DLLs are read, and where the
// assemblies come from) or a plain .NET folder (its solution).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isDotnetFolder, loadDotnetProjects } from "../dotnet/load.js";
import type { ProjectSummary } from "../shared/types.js";
import { readAsmdefProjects } from "./asmdef.js";
import { readCsprojs, type Csproj } from "./csproj.js";

const HUB = "/Applications/Unity/Hub/Editor";

export type ProjectFacts = ProjectSummary;

export function loadProjects(root: string): { projects: Csproj[]; facts: ProjectFacts } {
  const unityVersion = readUnityVersion(root);
  // every Unity project has ProjectSettings/ProjectVersion.txt (and a Unity-written .sln besides)
  if (unityVersion === null && isDotnetFolder(root)) {
    const { projects, solutions } = loadDotnetProjects(root);
    return {
      projects,
      facts: { kind: "dotnet", name: basename(root), unityVersion: null, standIn: null, unityInstalled: false, source: solutions.length ? "sln" : "folder", solutions },
    };
  }
  const installed = listInstalled();
  const unityInstalled = !!unityVersion && installed.includes(unityVersion);
  const standIn = unityInstalled ? null : (installed[0] ?? null);
  const csprojs = readCsprojs(root);
  const facts: ProjectFacts = { kind: "unity", name: basename(root), unityVersion, standIn, unityInstalled, source: csprojs.length ? "csproj" : "asmdef" };
  if (!existsSync(join(root, "Assets"))) return { projects: csprojs, facts };
  const editor = unityInstalled ? unityVersion : standIn;
  const managed = editor ? [join(HUB, editor, "Unity.app/Contents/Resources/Scripting/Managed"), join(HUB, editor, "Unity.app/Contents/Managed")].find(existsSync) : undefined;
  const folders = readAsmdefProjects(root, managed ?? null);
  if (!csprojs.length) return { projects: folders, facts };
  const { projects, notInCsproj } = lendCsprojs(folders, csprojs);
  if (notInCsproj) facts.notInCsproj = notInCsproj;
  return { projects, facts };
}

/**
 * Which files make up each assembly comes from the folders, because Unity
 * only rewrites its .csproj files when it opens the project, and they go
 * stale while code is written without it (ADR 0010). An assembly's .csproj
 * still lends what the folders can't say exactly: its defines and DLL
 * references. A .csproj whose files all lie outside Assets/ and Packages/
 * (a registry package's source in Library/PackageCache) is kept as it is.
 */
export function lendCsprojs(folders: Csproj[], csprojs: Csproj[]): { projects: Csproj[]; notInCsproj: number } {
  const inProjectFolders = (f: string) => f.startsWith("Assets/") || f.startsWith("Packages/");
  const listed = new Set(csprojs.flatMap((c) => c.compile));
  const notInCsproj = folders.flatMap((p) => p.compile).filter((f) => f.endsWith(".cs") && !listed.has(f)).length;
  const byName = new Map(csprojs.map((c) => [c.assembly, c]));
  // an assembly Unity hasn't written a .csproj for yet compiles with the same defines as the others
  const fallback = [...csprojs].sort((a, b) => b.compile.length - a.compile.length)[0];
  const projects = folders.map((p): Csproj => {
    const c = byName.get(p.assembly);
    const references = c ? [...c.references, ...p.references.filter((r) => !c.references.some((cr) => cr.name === r.name))] : p.references;
    return { ...p, defines: (c ?? fallback).defines, references };
  });
  const names = new Set(folders.map((p) => p.assembly));
  for (const c of csprojs) {
    if (!names.has(c.assembly) && c.compile.length && !c.compile.some(inProjectFolders)) projects.push(c);
  }
  return { projects: projects.sort((a, b) => a.assembly.localeCompare(b.assembly)), notInCsproj };
}

/** Unity or plain .NET, without loading the projects. */
export function projectKind(root: string): ProjectSummary["kind"] {
  return readUnityVersion(root) === null && isDotnetFolder(root) ? "dotnet" : "unity";
}

export function readUnityVersion(root: string): string | null {
  try {
    return /m_EditorVersion:\s*(\S+)/.exec(readFileSync(join(root, "ProjectSettings", "ProjectVersion.txt"), "utf8"))?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Installed editor versions, newest first. */
function listInstalled(): string[] {
  try {
    return readdirSync(HUB).sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
  } catch {
    return [];
  }
}
