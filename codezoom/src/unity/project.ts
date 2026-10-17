// What the setup page and the startup report say about the project: its
// Unity version, the editor whose DLLs are read, and where the assemblies
// come from (.csproj files, or .asmdef files and folder rules).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readAsmdefProjects } from "./asmdef.js";
import { readCsprojs, type Csproj } from "./csproj.js";

const HUB = "/Applications/Unity/Hub/Editor";

export interface ProjectFacts {
  name: string;
  /** From ProjectSettings/ProjectVersion.txt. */
  unityVersion: string | null;
  /** The installed editor read for UnityEngine types, when it is not the project's own. */
  standIn: string | null;
  unityInstalled: boolean;
  /** "csproj": exact, from Unity/Rider. "asmdef": a fresh clone, from .asmdef files and folder rules. */
  source: "csproj" | "asmdef";
}

export function loadProjects(root: string): { projects: Csproj[]; facts: ProjectFacts } {
  const unityVersion = readUnityVersion(root);
  const installed = listInstalled();
  const unityInstalled = !!unityVersion && installed.includes(unityVersion);
  const standIn = unityInstalled ? null : (installed[0] ?? null);
  const csprojs = readCsprojs(root);
  const facts: ProjectFacts = { name: basename(root), unityVersion, standIn, unityInstalled, source: csprojs.length ? "csproj" : "asmdef" };
  if (csprojs.length) return { projects: csprojs, facts };
  const editor = unityInstalled ? unityVersion : standIn;
  const managed = editor ? [join(HUB, editor, "Unity.app/Contents/Resources/Scripting/Managed"), join(HUB, editor, "Unity.app/Contents/Managed")].find(existsSync) : undefined;
  return { projects: readAsmdefProjects(root, managed ?? null), facts };
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
