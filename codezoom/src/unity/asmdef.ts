// The project without .csproj files (a fresh clone): assemblies from .asmdef
// and .asmref files, and Unity's folder rules for the rest (ADR 0003).
// Opening the project once in Unity or Rider gives exact .csproj files.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Csproj, DllReference } from "./csproj.js";
import { isSkipped } from "../shared/ownRules.js";

interface Asmdef {
  name: string;
  dir: string;
  references: string[];
}

/** Defines Unity would set for the editor; only used to read files whose #if splits a declaration. */
const EDITOR_DEFINES = ["UNITY_EDITOR", "DEBUG", "TRACE", "UNITY_5_3_OR_NEWER", "UNITY_2019_1_OR_NEWER", "UNITY_2021_1_OR_NEWER", "UNITY_6000_0_OR_NEWER", "NET_STANDARD_2_1"];

export function readAsmdefProjects(root: string, unityManaged: string | null): Csproj[] {
  const asmdefs: Asmdef[] = [];
  const asmrefs: { dir: string; reference: string }[] = [];
  const sources: string[] = [];
  const dlls: string[] = [];
  const guids = new Map<string, string>(); // asmdef guid -> name

  const walk = (rel: string) => {
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name.endsWith("~")) continue; // Unity ignores these
      const path = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (!isSkipped(path + "/")) walk(path);
      } else if (e.name.endsWith(".cs")) sources.push(path);
      else if (e.name.endsWith(".dll")) dlls.push(path);
      else if (e.name.endsWith(".asmdef")) {
        const json = readJson(join(root, path));
        if (typeof json?.name !== "string") continue;
        const references = Array.isArray(json.references) ? json.references.filter((r: unknown) => typeof r === "string") : [];
        asmdefs.push({ name: json.name, dir: rel, references });
        const guid = /guid:\s*([0-9a-f]+)/.exec(readText(join(root, `${path}.meta`)))?.[1];
        if (guid) guids.set(guid, json.name);
      } else if (e.name.endsWith(".asmref")) {
        const json = readJson(join(root, path));
        if (typeof json?.reference === "string") asmrefs.push({ dir: rel, reference: json.reference });
      }
    }
  };
  for (const top of ["Assets", "Packages"]) if (existsSync(join(root, top))) walk(top);

  const byGuid = (ref: string) => (ref.startsWith("GUID:") ? guids.get(ref.slice(5)) : ref);
  const owner = new Map<string, string>(); // folder -> assembly
  for (const a of asmdefs) owner.set(a.dir, a.name);
  for (const r of asmrefs) {
    const name = byGuid(r.reference);
    if (name) owner.set(r.dir, name);
  }

  const files = new Map<string, string[]>();
  for (const path of sources) {
    const assembly = assemblyOf(path, owner);
    if (!assembly) continue;
    if (!files.has(assembly)) files.set(assembly, []);
    files.get(assembly)!.push(path);
  }

  // every assembly sees Unity, the .NET reference set, loose DLLs and what Unity last built
  const references: DllReference[] = [];
  if (unityManaged) {
    for (const f of safeList(join(unityManaged, "UnityEngine"))) if (f.endsWith(".dll")) references.push({ name: f.slice(0, -4), hintPath: join(unityManaged, "UnityEngine", f) });
    const netstandard = join(unityManaged, "..", "NetStandard", "ref", "2.1.0", "netstandard.dll");
    if (existsSync(netstandard)) references.push({ name: "netstandard", hintPath: netstandard });
  }
  for (const d of dlls) references.push({ name: d.slice(d.lastIndexOf("/") + 1, -4), hintPath: join(root, d) });
  const built = join(root, "Library", "ScriptAssemblies");
  const names = new Set([...files.keys()]);
  for (const f of safeList(built)) {
    if (f.endsWith(".dll") && !names.has(f.slice(0, -4))) references.push({ name: f.slice(0, -4), hintPath: join(built, f) });
  }

  const asmdefNames = asmdefs.map((a) => a.name);
  return [...files.entries()]
    .map(([assembly, compile]) => {
      const def = asmdefs.find((a) => a.name === assembly);
      return {
        assembly,
        file: def ? `${def.dir}/${assembly}.asmdef` : "(Unity folder rules)",
        compile: compile.sort(),
        references,
        // predefined assemblies see every assembly definition
        projectReferences: def ? def.references.map(byGuid).filter((n): n is string => !!n) : asmdefNames,
        defines: EDITOR_DEFINES,
      };
    })
    .sort((a, b) => a.assembly.localeCompare(b.assembly));
}

/** The nearest .asmdef/.asmref up the folders, else Unity's predefined assemblies. */
function assemblyOf(path: string, owner: Map<string, string>): string | null {
  for (let dir = path.slice(0, path.lastIndexOf("/")); dir; dir = dir.slice(0, Math.max(0, dir.lastIndexOf("/")))) {
    const name = owner.get(dir);
    if (name) return name;
  }
  if (!path.startsWith("Assets/")) return null; // package code needs an assembly definition
  const firstpass = /^Assets\/(Plugins|Standard Assets|Pro Standard Assets)\//.test(path);
  const editor = path.split("/").slice(0, -1).includes("Editor");
  return `Assembly-CSharp${editor ? "-Editor" : ""}${firstpass ? "-firstpass" : ""}`;
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readText(path).replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
