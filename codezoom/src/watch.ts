// Watches the project while codezoom is open (round 5) and reports the
// files that changed, in bursts: Unity and Rider often write many at once.
// A .NET folder is watched from its root: sources, project files, and the
// assets file `dotnet restore` writes.

import { existsSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import type { ProjectKind } from "./shared/ownRules.js";
import { CONFIG_FILE } from "./unity/ownCode.js";

const QUIET_MS = 400;

/** Calls `onChange` with project-relative paths after a quiet moment. Returns a stop function. */
export function watchProject(root: string, onChange: (paths: string[]) => void, kind: ProjectKind = "unity"): () => void {
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  const note = (path: string) => {
    pending.add(path);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const paths = [...pending];
      pending.clear();
      onChange(paths);
    }, QUIET_MS);
  };

  const watchers: FSWatcher[] = [];
  if (kind === "dotnet") {
    watchers.push(
      watch(root, { recursive: true }, (_event, name) => {
        if (!name || isTemp(name)) return;
        const path = name.replace(/\\/g, "/");
        if (isDotnetInput(path)) note(path);
      }),
    );
    for (const w of watchers) w.on("error", () => undefined);
    return () => {
      clearTimeout(timer);
      for (const w of watchers) w.close();
    };
  }
  for (const folder of ["Assets", "Packages"]) {
    const dir = join(root, folder);
    if (!existsSync(dir)) continue;
    watchers.push(
      watch(dir, { recursive: true }, (_event, name) => {
        if (name && name.endsWith(".cs") && !isTemp(name)) note(`${folder}/${name.replace(/\\/g, "/")}`);
      }),
    );
  }
  // Unity rewrites the .csproj files when scripts are added, moved or removed
  watchers.push(
    watch(root, (_event, name) => {
      if (name && (name.endsWith(".csproj") || name === CONFIG_FILE) && !isTemp(name)) note(name);
    }),
  );
  for (const w of watchers) w.on("error", () => undefined);
  return () => {
    clearTimeout(timer);
    for (const w of watchers) w.close();
  };
}

/** A file a .NET index is read from: build output and the rest of obj/ are not. */
function isDotnetInput(path: string): boolean {
  const parts = path.split("/");
  const file = parts[parts.length - 1];
  if (file === "project.assets.json") return parts[parts.length - 2] === "obj";
  if (parts.some((p) => p === "bin" || p === "obj" || p === "node_modules")) return false;
  return /\.(cs|csproj|slnx?|props)$/i.test(file) || path === CONFIG_FILE;
}

/** Editors and tools write through hidden temp files (`.!123!Game.csproj`); only the real file counts. */
function isTemp(name: string): boolean {
  return name.split(/[\\/]/).some((part) => part.startsWith("."));
}
