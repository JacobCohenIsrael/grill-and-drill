// When a .csproj points at a Unity editor that is not installed (the
// project's version differs from the installed one), read the same DLL from
// an installed editor instead. Type names barely change between versions,
// so foreign libraries stay exact.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const IN_EDITOR = /^(.*\/Hub\/Editor)\/([^/]+)\/(.*)$/;

export class InstalledEditors {
  /** Installed editor versions that stood in for missing ones. */
  readonly used = new Set<string>();
  /** Editor versions the .csproj files name that are not installed. */
  readonly missingVersions = new Set<string>();
  private installed = new Map<string, string[]>(); // hub folder -> versions, newest first

  /** The same DLL in an installed editor, or null. */
  substitute(path: string): string | null {
    const m = IN_EDITOR.exec(path);
    if (!m) return null;
    const [, hub, version, rest] = m;
    this.missingVersions.add(version);
    // 2021-era editors keep Managed/ and UnityReferenceAssemblies/ under Contents/,
    // Unity 6 under Contents/Resources/Scripting/
    const inApp = /^Unity\.app\/Contents\/(?:Resources\/Scripting\/)?(.*)$/.exec(rest);
    for (const other of this.versions(hub)) {
      if (other === version) continue;
      const candidates = inApp
        ? [join(hub, other, "Unity.app/Contents/Resources/Scripting", inApp[1]), join(hub, other, "Unity.app/Contents", inApp[1])]
        : [join(hub, other, rest)];
      const found = candidates.find((c) => existsSync(c));
      if (found) {
        this.used.add(other);
        return found;
      }
    }
    return null;
  }

  /** The UnityEngine/UnityEditor module folders of the editors that stood in. */
  moduleFolders(): string[] {
    const folders: string[] = [];
    for (const [hub, versions] of this.installed) {
      for (const v of versions) {
        if (!this.used.has(v)) continue;
        for (const f of [join(hub, v, "Unity.app/Contents/Resources/Scripting/Managed/UnityEngine"), join(hub, v, "Unity.app/Contents/Managed/UnityEngine")]) {
          if (existsSync(f)) folders.push(f);
        }
      }
    }
    return folders;
  }

  private versions(hub: string): string[] {
    let list = this.installed.get(hub);
    if (!list) {
      try {
        list = readdirSync(hub, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
          .sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
      } catch {
        list = [];
      }
      this.installed.set(hub, list);
    }
    return list;
  }
}
