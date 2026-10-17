// codezoom <TypeName>: index the Unity project in the current folder and
// open the browser at that Focus.

import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { IndexCache } from "./cache.js";
import { indexProject } from "./indexer.js";
import { watchProject } from "./watch.js";
import { startServer } from "./server.js";
import { findRider } from "./editor.js";
import { findFocus } from "./shared/search.js";
import { CONFIG_FILE } from "./unity/ownCode.js";

const CACHE_DIR = ".codezoom";

const USAGE = `Usage: codezoom [TypeName] [--port N] [--config FILE] [--cache-dir DIR] [--no-cache] [--no-watch] [--no-open] [--report]

Run from a Unity project root. Indexes own code, then opens the browser
at TypeName (a Jump), or at the search page when no name is given. What
each file gave is cached in .codezoom/ (it ignores itself in git), so a
relaunch re-reads only changed files; while open, changed files are
re-read and the page offers the new index.

Own code comes from ${CONFIG_FILE} (or --config FILE) when present:
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
  const valueOf = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const port = Number(valueOf("--port") ?? 4777);
  const configPath = valueOf("--config");
  const open = !args.includes("--no-open");
  const report = args.includes("--report");
  const positional = args.filter((a, i) => !a.startsWith("--") && !["--port", "--config", "--cache-dir"].includes(args[i - 1]));
  const query = positional[0];
  const root = process.cwd();
  const cacheDirArg = valueOf("--cache-dir");
  const cacheDir = args.includes("--no-cache") ? null : cacheDirArg ? resolve(cacheDirArg) : join(root, CACHE_DIR);

  console.log(`codezoom: indexing ${root}`);
  const cache = IndexCache.load(cacheDir);
  const index = indexProject(root, configPath, cache);
  const { own, timings, screens } = index;
  const s = screens.meta.stats;
  console.log(
    `  own code: ${own.assemblies.map((a) => a.assembly).join(", ")} (${own.configPath ?? "defaults; add " + CONFIG_FILE + " to change"})`,
  );
  const notListed = own.skipped.filter((k) => k.reason === "not listed in config");
  for (const k of own.skipped) if (!notListed.includes(k)) console.log(`  left out: ${k.assembly} (${k.reason})`);
  if (notListed.length) console.log(`  left out: ${notListed.length} assemblies not listed in the config`);
  if (own.vendorFiles.length) console.log(`  vendor files read as foreign: ${own.vendorFiles.length}`);
  const { dlls } = index;
  if (dlls.substituted) {
    console.log(
      `  Unity ${[...dlls.editors.missingVersions].join(", ")} not installed: read ${dlls.substituted} of its DLLs from ${[...dlls.editors.used].join(", ")}` +
        (dlls.extraModules ? `, plus its ${dlls.extraModules} other UnityEngine/UnityEditor modules` : ""),
    );
  }
  if (dlls.missing.length) {
    console.log(`  foreign DLLs not found: ${dlls.missing.length}; names from them stay unresolved`);
    if (report) for (const m of dlls.missing.slice(0, 20)) console.log(`    ${m}`);
  }
  console.log(
    `  ${s.files} files, ${s.types} types, ${s.libraries} foreign libraries, ${s.edges} edges, ${s.references} References (${s.unresolved} names not resolved)`,
  );
  if (cacheDir) console.log(`  cache ${cacheDir}: ${index.fromCache} files reused, ${index.changed.length} read`);
  console.log(`  indexed in ${timings.total} ms (${Object.entries(timings).filter(([k]) => k !== "total").map(([k, v]) => `${k} ${v}`).join(", ")})`);
  if (report) {
    const top = [...index.graph.unresolved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
    console.log("  most common unresolved names:");
    for (const [n, c] of top) console.log(`    ${c}\t${n}`);
  }

  const editor = findRider();
  const server = await startServer(screens, port, root, editor);
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
  const saved = () => cache.save().catch((e) => console.log(`  could not write the cache: ${e instanceof Error ? e.message : e}`));
  void saved();

  if (args.includes("--no-watch")) return;
  let ownFiles = new Set(index.own.files.map((f) => f.path));
  watchProject(root, (paths) => {
    const t0 = performance.now();
    try {
      const next = indexProject(root, configPath, cache);
      const nextOwn = new Set(next.own.files.map((f) => f.path));
      const removed = [...ownFiles].filter((f) => !nextOwn.has(f));
      ownFiles = nextOwn;
      const project = paths.filter((p) => !p.endsWith(".cs")); // .csproj files, the config
      const changed = [...next.changed, ...removed, ...project];
      if (!changed.length) return; // touched, not changed
      server.update(next.screens, changed);
      const st = next.screens.meta.stats;
      const list = `${changed.slice(0, 3).join(", ")}${changed.length > 3 ? ", …" : ""}`;
      console.log(`  index updated in ${Math.round(performance.now() - t0)} ms: ${changed.length} changed (${list}); ${st.types} types, ${st.edges} edges`);
      void saved();
    } catch (e) {
      // a .csproj caught mid-write, say: keep serving the last good index
      console.log(`  index update failed, keeping the last one: ${e instanceof Error ? e.message : e}`);
    }
  });
}

main().catch((e) => {
  console.error(`codezoom: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
