#!/usr/bin/env node
// Writes the foreign type names a project's code mentions, read from the
// installed Unity editor's DLLs, to a small JSON list the tests use instead
// of Unity. Run after `npm run build:server`:
//
//   node scripts/extract-foreign-types.mjs ../examples/TinyTowers test/fixtures/tinytowers-foreign-types.json
//
// Only types whose simple name appears in the project's source are kept (and
// attributes written without their "Attribute" suffix), so names resolve the
// same as with the full DLLs; the script checks that before writing.

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { indexProject } from "../dist/server/indexer.js";
import { fromForeignList, toForeignList } from "../dist/server/dotnet/foreignList.js";

const [root, out] = process.argv.slice(2);
if (!root || !out) {
  console.error("usage: node scripts/extract-foreign-types.mjs <project root> <out.json>");
  process.exit(2);
}

const full = indexProject(resolve(root));
const words = new Set();
for (const p of full.projects) {
  for (const f of p.compile) {
    if (!f.endsWith(".cs")) continue;
    for (const w of readFileSync(join(root, f), "utf8").match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) words.add(w);
  }
}
// types read from source (vendor folders, assemblies without a DLL) come back from source anyway
const fromDlls = full.foreign.filter((t) => !t.lib.key.startsWith("Assets/") && !t.lib.key.startsWith("Packages/"));
const kept = fromDlls.filter((t) => words.has(t.name) || (t.name.endsWith("Attribute") && words.has(t.name.slice(0, -"Attribute".length))));
const editor = full.project.unityVersion ?? "unknown";
const list = toForeignList(kept, `Foreign type names ${root} mentions, read from Unity ${editor}'s DLLs by scripts/extract-foreign-types.mjs. Tests use this list instead of Unity.`);

// the list must give the same index as the DLLs
const small = indexProject(resolve(root), undefined, undefined, { foreignTypes: fromForeignList(list) });
const same = [...full.screens.json].every(([id, json]) => small.screens.json.get(id) === json) && full.screens.json.size === small.screens.json.size;
if (!same) {
  console.error("the list does not reproduce the index from the DLLs; not written");
  process.exit(1);
}
// one type per line: the list diffs well when Unity or the project changes
const body = [
  "{",
  `  "about": ${JSON.stringify(list.about)},`,
  `  "libraries": ${JSON.stringify(list.libraries)},`,
  `  "types": [`,
  list.types.map((t) => `    ${JSON.stringify(t)}`).join(",\n"),
  "  ]",
  "}",
].join("\n");
writeFileSync(out, `${body}\n`);
console.log(`wrote ${out}: ${list.types.length} of ${fromDlls.length} foreign types, same index as the DLLs`);
