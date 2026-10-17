// codezoom <TypeName>: index the Unity project in the current folder and
// open the browser at that Focus.

import { spawn } from "node:child_process";
import { indexProject } from "./indexer.js";
import { startServer } from "./server.js";
import { findFocus } from "./shared/search.js";
import { CONFIG_FILE } from "./unity/ownCode.js";

const USAGE = `Usage: codezoom [TypeName] [--port N] [--no-open] [--report]

Run from a Unity project root. Indexes own code, then opens the browser
at TypeName (a Jump), or at the search page when no name is given.

Own code comes from ${CONFIG_FILE} when present:
  { "assemblies": ["My.Game", "My.Editor"],
    "excludeFolders": ["Assets/Plugins"], "includeFolders": [] }
Without it: every assembly with files under Assets/, minus test
assemblies and vendor folders.`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const portArg = args.indexOf("--port");
  const port = portArg >= 0 ? Number(args[portArg + 1]) : 4777;
  const open = !args.includes("--no-open");
  const report = args.includes("--report");
  const positional = args.filter((a, i) => !a.startsWith("--") && !(portArg >= 0 && i === portArg + 1));
  const query = positional[0];
  const root = process.cwd();

  console.log(`codezoom: indexing ${root}`);
  const index = indexProject(root);
  const { own, timings, screens } = index;
  const s = screens.meta.stats;
  console.log(
    `  own code: ${own.assemblies.map((a) => a.assembly).join(", ")} (${own.configPath ? CONFIG_FILE : "defaults; add " + CONFIG_FILE + " to change"})`,
  );
  for (const k of own.skipped) console.log(`  left out: ${k.assembly} (${k.reason})`);
  if (own.vendorFiles.length) console.log(`  vendor files read as foreign: ${own.vendorFiles.length}`);
  if (index.dlls.missing.length) console.log(`  foreign DLLs not found: ${index.dlls.missing.length} (run Unity once to build Library/)`);
  console.log(
    `  ${s.files} files, ${s.types} types, ${s.libraries} foreign libraries, ${s.edges} edges, ${s.references} References (${s.unresolved} names not resolved)`,
  );
  console.log(`  indexed in ${timings.total} ms (${Object.entries(timings).filter(([k]) => k !== "total").map(([k, v]) => `${k} ${v}`).join(", ")})`);
  if (report) {
    const top = [...index.graph.unresolved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
    console.log("  most common unresolved names:");
    for (const [n, c] of top) console.log(`    ${c}\t${n}`);
  }

  const server = await startServer(screens, port);
  const base = `http://127.0.0.1:${server.port}`;
  let url = `${base}/`;
  if (query) {
    const found = findFocus(screens.meta.nodes, query);
    if (found.length === 1) url = `${base}/n/${encodeURIComponent(found[0].id)}`;
    else {
      url = `${base}/?q=${encodeURIComponent(query)}`;
      console.log(found.length ? `  "${query}" matches ${found.length} nodes; pick one in the search box` : `  no node matches "${query}"`);
    }
  }
  console.log(`  open ${url}   (Ctrl+C to stop)`);
  if (open) spawn("open", [url], { stdio: "ignore", detached: true }).unref();
}

main().catch((e) => {
  console.error(`codezoom: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
