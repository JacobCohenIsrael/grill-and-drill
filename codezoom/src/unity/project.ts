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
  if (csprojs.length) return { projects: csprojs, facts };
  if (!existsSync(join(root, "Assets"))) return { projects: [], facts };
  const editor = unityInstalled ? unityVersion : standIn;
  const managed = editor ? [join(HUB, editor, "Unity.app/Contents/Resources/Scripting/Managed"), join(HUB, editor, "Unity.app/Contents/Managed")].find(existsSync) : undefined;
  return { projects: readAsmdefProjects(root, managed ?? null), facts };
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
