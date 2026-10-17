// Writes the type-name lists codezoom ships for machines without a .NET SDK:
// data/dotnet-base-types.json (the base library, hidden on screen) and
// data/aspnetcore-types.json (ASP.NET Core's shared framework, one node).
// Read from an SDK's targeting packs:
//   npm run build:server
//   node scripts/extract-base-library.mjs /usr/local/share/dotnet [net8.0]

import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readTypeDefs } from "../dist/server/dotnet/metadata.js";
import { findRefPack } from "../dist/server/dotnet/packages.js";

const [dotnetRoot, tfm = "net8.0"] = process.argv.slice(2);
if (!dotnetRoot) {
  console.error("usage: node scripts/extract-base-library.mjs DOTNET_ROOT [net8.0]");
  process.exit(2);
}
const data = join(dirname(fileURLToPath(import.meta.url)), "../data");

for (const [pack, file, what] of [
  ["Microsoft.NETCore.App.Ref", "dotnet-base-types.json", "the .NET base library"],
  ["Microsoft.AspNetCore.App.Ref", "aspnetcore-types.json", "ASP.NET Core's shared framework"],
]) {
  const dir = findRefPack(pack, tfm, [dotnetRoot]);
  if (!dir) {
    console.error(`no ${pack} for ${tfm} under ${dotnetRoot}`);
    process.exit(1);
  }
  const byNs = new Map();
  let count = 0;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".dll")).sort()) {
    for (const d of readTypeDefs(join(dir, f))) {
      const entry = `${d.isInterface ? "^" : ""}${d.name}${d.arity ? "`" + d.arity : ""}`;
      if (!byNs.has(d.namespace)) byNs.set(d.namespace, new Set());
      byNs.get(d.namespace).add(entry);
      count++;
    }
  }
  const version = dir.split(/[\\/]/).at(-3);
  const namespaces = [...byNs.keys()].sort();
  const lines = namespaces.map((ns) => `    ${JSON.stringify(ns)}: ${JSON.stringify([...byNs.get(ns)].sort())}`);
  const about = `Public type names of ${what} (${pack} ${version}, ${tfm}), for indexing without a .NET SDK. Made by scripts/extract-base-library.mjs; ^ marks an interface, \`N the arity.`;
  writeFileSync(join(data, file), `{\n  "about": ${JSON.stringify(about)},\n  "types": {\n${lines.join(",\n")}\n  }\n}\n`);
  console.log(`${file}: ${count} types in ${namespaces.length} namespaces from ${pack} ${version}`);
}
