// MSBuild-style file globs (`**/*.cs`, `..\Shared\*.cs`, `Legacy/**`) over a
// project folder, the way the SDK's default Compile items use them.

import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Every file under `dir`, relative to it with forward slashes, skipping folders that never hold sources. */
export function listFiles(dir: string, skipTop: Set<string>, maxDepth = Infinity): string[] {
  const out: string[] = [];
  const walk = (abs: string, rel: string, depth = 0) => {
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        // the SDK leaves out folders that start with a dot; bin/ and obj/ are the build's own
        if (e.name.startsWith(".") || e.name === "node_modules" || (!rel && skipTop.has(e.name.toLowerCase()))) continue;
        if (depth < maxDepth) walk(join(abs, e.name), r, depth + 1);
      } else if (e.isFile()) out.push(r);
    }
  };
  walk(dir, "");
  return out;
}

/** A glob as a regex over forward-slash paths relative to the folder it is written in. */
export function globRegex(glob: string): RegExp {
  const g = normalize(glob);
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") {
      // `**/` is any number of folders, `**` at the end is anything
      if (g[i + 2] === "/") {
        re += "(?:[^/]*/)*";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

export function isGlob(spec: string): boolean {
  return /[*?]/.test(spec);
}

/** Backslashes to slashes, `./` and duplicate slashes dropped. */
export function normalize(spec: string): string {
  return spec.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^(\.\/)+/, "");
}
