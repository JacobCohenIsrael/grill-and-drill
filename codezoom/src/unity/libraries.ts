// Decides which foreign library a referenced assembly belongs to.
// A foreign library is one node: a Unity package, UnityEngine, UnityEditor,
// or a loose DLL. The .NET base library is hidden.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Csproj } from "./csproj.js";
import { vendorLibrary } from "./ownCode.js";

export interface LibraryInfo {
  /** Stable id part, e.g. "UnityEngine" or "com.unity.inputsystem". */
  key: string;
  /** Name shown on screen, e.g. "Input System". */
  name: string;
  hidden: boolean;
}

interface PackageInfo {
  name: string;
  displayName: string;
}

const BCL = /^(mscorlib|netstandard|System(\..*)?|Microsoft\.(CSharp|VisualBasic|Win32\..*))$/;

export class LibraryMap {
  private asmdefToPackage = new Map<string, PackageInfo>();
  private packageDirs = new Map<string, PackageInfo>(); // dir name in PackageCache -> package

  private root: string;

  constructor(root: string) {
    this.root = root;
    for (const base of [join(root, "Library", "PackageCache"), join(root, "Packages")]) {
      if (!existsSync(base)) continue;
      for (const dir of readdirSync(base, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        const pkgDir = join(base, dir.name);
        const pkg = readPackage(pkgDir) ?? { name: dir.name.replace(/@.*$/, ""), displayName: dir.name.replace(/@.*$/, "") };
        this.packageDirs.set(dir.name, pkg);
        for (const asmdef of findAsmdefs(pkgDir)) {
          try {
            const name = JSON.parse(readFileSync(asmdef, "utf8").replace(/^﻿/, "")).name;
            if (typeof name === "string") this.asmdefToPackage.set(name, pkg);
          } catch {
            // unreadable asmdef: the assembly falls back to its own name
          }
        }
      }
    }
  }

  forAssembly(assembly: string, hintPath: string): LibraryInfo {
    if (BCL.test(assembly) || hintPath.includes("/NetStandard/") || hintPath.includes("/BCLExtensions/")) {
      return { key: "dotnet", name: ".NET", hidden: true };
    }
    if (assembly === "UnityEngine" || /^UnityEngine\..*Module$/.test(assembly)) {
      return { key: "UnityEngine", name: "UnityEngine", hidden: false };
    }
    if (assembly === "UnityEditor" || /^UnityEditor\..*Module$/.test(assembly)) {
      return { key: "UnityEditor", name: "UnityEditor", hidden: false };
    }
    const fromAsmdef = this.asmdefToPackage.get(assembly);
    if (fromAsmdef) return { key: fromAsmdef.name, name: fromAsmdef.displayName, hidden: false };
    const cacheMatch = /\/(?:Library\/PackageCache|Packages)\/([^/]+)\//.exec(hintPath);
    const pkg = cacheMatch ? this.packageDirs.get(cacheMatch[1]) : undefined;
    if (pkg) return { key: pkg.name, name: pkg.displayName, hidden: false };
    // a DLL inside Assets/ belongs to its vendor folder (Assets/Plugins/Demigiant/DOTween/DOTween.dll -> Demigiant)
    if (hintPath.startsWith(this.root + "/Assets/")) return vendorLibrary(hintPath.slice(this.root.length + 1));
    return { key: assembly, name: assembly || basename(hintPath), hidden: false };
  }

  /** A non-own assembly that has a .csproj: its package, or the folder its files sit in. */
  forProject(p: Csproj): LibraryInfo {
    const fromAsmdef = this.asmdefToPackage.get(p.assembly);
    if (fromAsmdef) return { key: fromAsmdef.name, name: fromAsmdef.displayName, hidden: false };
    const first = p.compile.find((f) => f.endsWith(".cs"));
    if (!first) return { key: p.assembly, name: p.assembly, hidden: false };
    if (first.startsWith("Assets/")) return vendorLibrary(first);
    return this.forAssembly(p.assembly, join(this.root, first));
  }
}

function readPackage(dir: string): PackageInfo | undefined {
  try {
    const json = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    if (typeof json.name !== "string") return undefined;
    return { name: json.name, displayName: typeof json.displayName === "string" ? json.displayName : json.name };
  } catch {
    return undefined;
  }
}

function findAsmdefs(dir: string): string[] {
  const found: string[] = [];
  const walk = (d: string) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name.startsWith(".") || e.name.endsWith("~")) continue;
        walk(join(d, e.name));
      } else if (e.name.endsWith(".asmdef")) {
        found.push(join(d, e.name));
      }
    }
  };
  walk(dir);
  return found;
}
