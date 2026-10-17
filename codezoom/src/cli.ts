// codezoom <TypeName>: index the Unity project or .NET solution in the
// current folder and open the browser at that Focus. codezoom setup: choose
// own code.
// codezoom mcp, search, screen, references: the agent tools (ADR 0005).

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { IndexCache } from "./cache.js";
import { fromForeignList } from "./dotnet/foreignList.js";
import { indexProject, type IndexOptions } from "./indexer.js";
import { watchProject } from "./watch.js";
import { formatWalk, parseWalk, runWalk, type Walk } from "./walk.js";
import { serveMcp } from "./mcp.js";
import { indexNotes, Query, QueryError, referencesText, screenText, searchText } from "./query.js";
import { startServer } from "./server.js";
import { findRider } from "./editor.js";
import { findFocus } from "./shared/search.js";
import { defaultVerdict, isSkipped, type Config } from "./shared/ownRules.js";
import type { SetupData } from "./shared/types.js";
import { CONFIG_FILE, hintsFor, loadConfig } from "./unity/ownCode.js";
import { projectKind } from "./unity/project.js";

const CACHE_DIR = ".codezoom";

const USAGE = `Usage: codezoom [TypeName] [--port N] [--config FILE] [--cache-dir DIR] [--no-cache] [--no-watch] [--no-open] [--report]
       codezoom setup [same options]
       codezoom walk FILE... [--config FILE] [--cache-dir DIR] [--no-cache]
       codezoom mcp [--config FILE] [--cache-dir DIR] [--no-cache] [--no-watch]
       codezoom search QUERY [--limit N] [--json]
       codezoom screen NODE [--filter TEXT] [--limit N] [--offset N] [--json]
       codezoom references FROM TO [--limit N] [--offset N] [--json]

--foreign-types FILE reads foreign type names from a list (made by
scripts/extract-foreign-types.mjs) instead of Unity's DLLs or a .NET
restore: for tests.

Run from a Unity project root or a .NET solution folder. Indexes own code,
then opens the browser at TypeName (a Jump), or at the search page when no
name is given. What
each file gave is cached in .codezoom/ (it ignores itself in git), so a
relaunch re-reads only changed files; while open, changed files are
re-read and the page offers the new index.

Own code comes from ${CONFIG_FILE} (or --config FILE). Without it the
browser opens the setup page first, pre-ticked by the default rules (Unity:
assemblies with files under Assets/, minus tests and vendor folders; .NET:
the solution's projects, minus test projects); "codezoom setup" or the
Setup link in the page reopens it.

"codezoom walk" replays golden walks (JSON files of moves and the
neighbours each screen must or must not show) against this project and
exits non-zero when a screen differs. See the README for the format.

"codezoom mcp" serves the agent tools search, screen and references over
MCP's stdio transport; "codezoom search|screen|references" answer the same
questions once, as text or, with --json, as the tools' JSON.`;

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
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && !["--port", "--config", "--cache-dir", "--foreign-types", "--filter", "--limit", "--offset"].includes(args[i - 1]),
  );
  const foreignFile = valueOf("--foreign-types");
  const indexOptions: IndexOptions = foreignFile ? { foreignTypes: fromForeignList(JSON.parse(readFileSync(foreignFile, "utf8"))) } : {};
  const setupCommand = positional[0] === "setup";
  const walkCommand = positional[0] === "walk";
  const queryCommand = ["search", "screen", "references"].includes(positional[0]) ? positional[0] : undefined;
  const query = setupCommand || walkCommand ? undefined : positional[0];
  const root = process.cwd();
  const configFile = configPath ? resolve(configPath) : join(root, CONFIG_FILE);
  const cacheDirArg = valueOf("--cache-dir");
  const cacheDir = args.includes("--no-cache") ? null : cacheDirArg ? resolve(cacheDirArg) : join(root, CACHE_DIR);

  if (walkCommand) {
    process.exitCode = runWalks(positional.slice(1), root, configPath, cacheDir, indexOptions);
    return;
  }
  if (positional[0] === "mcp") {
    await runMcp(root, configPath, cacheDir, indexOptions, !args.includes("--no-watch"));
    return;
  }
  if (queryCommand) {
    const number = (flag: string) => {
      const v = valueOf(flag);
      if (v === undefined) return undefined;
      if (!/^\d+$/.test(v)) throw new Error(`${flag} needs a whole number`);
      return Number(v);
    };
    const page = { filter: valueOf("--filter"), limit: number("--limit"), offset: number("--offset") };
    process.exitCode = runQuery(queryCommand, positional.slice(1), page, args.includes("--json"), root, configPath, cacheDir, indexOptions);
    return;
  }

  console.log(`codezoom: indexing ${root}`);
  const cache = IndexCache.load(cacheDir);
  let index = indexProject(root, configPath, cache, indexOptions);
  const { own, timings, screens } = index;
  const hasConfig = loadConfig(root, configPath).config !== null;
  if (index.project.source === "asmdef") {
    console.log("  no .csproj files: assemblies from .asmdef files and Unity folder rules; open the project once in Unity or Rider for exact results");
  }
  if (index.project.kind === "dotnet") {
    const from = index.project.solutions?.length ? index.project.solutions.join(", ") : "every .csproj under the folder (no .sln)";
    console.log(`  .NET: ${index.projects.length} projects from ${from}; base library from ${index.dotnet?.baseLibrary}`);
  }
  for (const n of index.notes) console.log(`  ${n}`);
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
  if (!hasConfig) console.log(`  no ${CONFIG_FILE} yet: the setup page opens first`);
  if (own.newAssemblies.length) console.log(`  ${own.newAssemblies.length} new assemblies not in the config yet: review them in setup`);
  console.log(`  indexed in ${timings.total} ms (${Object.entries(timings).filter(([k]) => k !== "total").map(([k, v]) => `${k} ${v}`).join(", ")})`);
  if (report) {
    const top = [...index.graph.unresolved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
    console.log("  most common unresolved names:");
    for (const [n, c] of top) console.log(`    ${c}\t${n}`);
  }

  // the setup page: what it shows, and what Save does
  let ownFiles = new Set(index.own.files.map((f) => f.path));
  let lastWritten: string | null = null;
  const namespaceRoots = new Map<string, string>(); // file -> first namespace segment
  const setup = {
    describe: async (): Promise<SetupData> => {
      const all = index.projects.flatMap((p) => p.compile.filter((f) => f.endsWith(".cs") && !isSkipped(f)));
      await readNamespaceRoots(root, all, namespaceRoots);
      const shown = relative(root, configFile);
      return {
        project: index.project,
        configPath: shown.startsWith("..") ? configFile : shown,
        config: loadConfig(root, configPath).config,
        assemblies: index.projects.map((p) => {
          const files = p.compile.filter((f) => f.endsWith(".cs") && !isSkipped(f));
          const counts = new Map<string, number>();
          for (const f of files) counts.set(namespaceRoots.get(f) ?? "(global)", (counts.get(namespaceRoots.get(f) ?? "(global)") ?? 0) + 1);
          const hints = hintsFor(p, index.project.kind);
          const d = defaultVerdict(p.assembly, p.compile, hints);
          return { name: p.assembly, files, namespaces: [...counts].sort((a, b) => b[1] - a[1]), defaultOwn: d.own, defaultReason: d.reason, hints };
        }),
      };
    },
    save: async (config: Config) => {
      const text = `${JSON.stringify(sortedConfig(config), null, 2)}\n`;
      writeFileSync(configFile, text);
      lastWritten = text;
      index = indexProject(root, configPath, cache, indexOptions);
      ownFiles = new Set(index.own.files.map((f) => f.path));
      server.update(index.screens, [], "setup");
      void saved();
      const unit = index.project.kind === "dotnet" ? "projects" : "assemblies";
      console.log(`  saved ${configFile}: ${index.own.assemblies.length} own ${unit}, ${index.screens.meta.stats.types} types`);
      return { types: index.screens.meta.stats.types };
    },
  };

  const editor = findRider();
  const server = await startServer(screens, port, root, editor, setup);
  const base = `http://127.0.0.1:${server.port}`;
  let url = `${base}/`;
  if (setupCommand || !hasConfig) {
    // after Save the page goes on to the Type named on the command line
    url = `${base}/setup${query ? `?then=${encodeURIComponent(query)}` : ""}`;
  } else if (query) {
    const found = findFocus(screens.meta.nodes, query);
    if (found.length === 1) url = `${base}/n/${encodeURIComponent(found[0].id)}`;
    else {
      url = `${base}/?q=${encodeURIComponent(query)}`;
      console.log(found.length ? `  "${query}" matches ${found.length} nodes; pick one in the search box` : `  no node matches "${query}"`);
    }
  }
  console.log(`  open ${url}   (Ctrl+C to stop)`);
  if (open) openBrowser(url);
  const saved = () => cache.save().catch((e) => console.log(`  could not write the cache: ${e instanceof Error ? e.message : e}`));
  void saved();

  if (args.includes("--no-watch")) return;
  watchProject(root, (paths) => {
    const t0 = performance.now();
    try {
      // the config Save just wrote is already indexed
      if (lastWritten !== null && paths.includes(CONFIG_FILE) && readText(configFile) === lastWritten) {
        paths = paths.filter((p) => p !== CONFIG_FILE);
        if (!paths.length) return;
      }
      const next = indexProject(root, configPath, cache, indexOptions);
      index = next;
      const nextOwn = new Set(next.own.files.map((f) => f.path));
      const removed = [...ownFiles].filter((f) => !nextOwn.has(f));
      ownFiles = nextOwn;
      const project = paths.filter((p) => !p.endsWith(".cs")); // .csproj files, the config
      const changed = [...next.changed, ...removed, ...project];
      if (!changed.length) return; // touched, not changed
      server.update(next.screens, changed, "files");
      const st = next.screens.meta.stats;
      const list = `${changed.slice(0, 3).join(", ")}${changed.length > 3 ? ", …" : ""}`;
      console.log(`  index updated in ${Math.round(performance.now() - t0)} ms: ${changed.length} changed (${list}); ${st.types} types, ${st.edges} edges`);
      void saved();
    } catch (e) {
      // a .csproj caught mid-write, say: keep serving the last good index
      console.log(`  index update failed, keeping the last one: ${e instanceof Error ? e.message : e}`);
    }
  }, index.project.kind);
}

/** The default browser at the address; if there is none to start, the address printed above is enough. */
function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  const child = spawn(cmd, args as string[], { stdio: "ignore", detached: true });
  child.on("error", () => console.log("  could not start a browser: open the address above"));
  child.unref();
}

/** `codezoom walk`: 0 when every screen is as the walks expect, 1 when one differs, 2 when a walk cannot be read. */
function runWalks(files: string[], root: string, configPath: string | undefined, cacheDir: string | null, options: IndexOptions): number {
  if (!files.length) {
    console.error("codezoom walk: name one or more walk files");
    return 2;
  }
  const cache = IndexCache.load(cacheDir);
  const index = indexProject(root, configPath, cache, options);
  void cache.save().catch(() => undefined);
  const s = index.screens.meta.stats;
  console.log(`codezoom: ${s.types} types, ${s.edges} edges, ${s.references} References in ${root}`);
  const nodes = new Map(index.screens.meta.nodes.map((n) => [n.id, n]));
  let code = 0;
  for (const file of files) {
    let walk: Walk;
    try {
      walk = parseWalk(readFileSync(file, "utf8"));
    } catch (e) {
      console.error(`walk: ${file}\n  cannot read it: ${e instanceof Error ? e.message : e}`);
      code = 2;
      continue;
    }
    const { text, failed } = formatWalk(walk.name ? `${walk.name} (${file})` : file, runWalk(walk, index.screens), nodes);
    console.log(text);
    if (failed && code === 0) code = 1;
  }
  return code;
}

/** `codezoom mcp`: index once the client has said hello, then answer from the latest index until stdin closes. */
async function runMcp(root: string, configPath: string | undefined, cacheDir: string | null, options: IndexOptions, watch: boolean) {
  const log = (line: string): void => void process.stderr.write(`${line}\n`);
  const cache = IndexCache.load(cacheDir);
  let saving: Promise<void> = Promise.resolve();
  const build = (): Query => {
    const t0 = performance.now();
    const index = indexProject(root, configPath, cache, options);
    saving = cache.save().then(
      () => undefined,
      (e) => log(`codezoom mcp: could not write the cache: ${e instanceof Error ? e.message : e}`),
    );
    const s = index.screens.meta.stats;
    log(`codezoom mcp: ${s.types} types, ${s.edges} edges in ${root} (${Math.round(performance.now() - t0)} ms)`);
    return new Query(index.screens, indexNotes(index));
  };
  let current: Promise<Query> | null = null;
  const query = () =>
    (current ??= new Promise<Query>((resolve, reject) =>
      // let the answer that is on its way out leave first: indexing holds the thread
      setImmediate(() => {
        try {
          resolve(build());
        } catch (e) {
          const why = e instanceof Error ? e.message : String(e);
          log(`codezoom mcp: ${why}`);
          reject(new QueryError(why));
        }
      }),
    ));
  log(`codezoom mcp: serving ${root} on stdio`);
  if (watch) {
    watchProject(
      root,
      () => {
        if (!current) return;
        try {
          current = Promise.resolve(build());
        } catch (e) {
          log(`codezoom mcp: index update failed, keeping the last one: ${e instanceof Error ? e.message : e}`);
        }
      },
      projectKind(root),
    );
  }
  const version = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;
  await serveMcp(process.stdin, process.stdout, { version, query, onInitialized: () => void query().catch(() => undefined), log });
  await saving;
  process.exit(0);
}

/** `codezoom search|screen|references`: one answer, as text or JSON. 0 answered, 1 no answer, 2 usage. */
function runQuery(
  command: string,
  words: string[],
  page: { filter?: string; limit?: number; offset?: number },
  json: boolean,
  root: string,
  configPath: string | undefined,
  cacheDir: string | null,
  options: IndexOptions,
): number {
  const needs = command === "references" ? 2 : 1;
  if (words.length !== needs) {
    console.error(`codezoom ${command}: ${command === "references" ? "name the node that depends and the node it depends on" : command === "search" ? "give one query" : "name one node"}`);
    return 2;
  }
  const cache = IndexCache.load(cacheDir);
  const index = indexProject(root, configPath, cache, options);
  void cache.save().catch(() => undefined);
  const q = new Query(index.screens, indexNotes(index));
  try {
    if (command === "search") {
      const a = q.search(words[0], page.limit);
      console.log(json ? JSON.stringify(a, null, 2) : searchText(a));
    } else if (command === "screen") {
      const a = q.screen(words[0], page);
      console.log(json ? JSON.stringify(a, null, 2) : screenText(a));
    } else {
      const a = q.references(words[0], words[1], page);
      console.log(json ? JSON.stringify(a, null, 2) : referencesText(a));
    }
    return 0;
  } catch (e) {
    if (!(e instanceof QueryError)) throw e;
    if (json) console.log(JSON.stringify({ error: e.message, notes: q.notes }, null, 2));
    else console.error(`codezoom ${command}: ${e.message}`);
    return 1;
  }
}

/** The first namespace segment each file declares, read once per run (setup page only). */
async function readNamespaceRoots(root: string, files: string[], into: Map<string, string>) {
  const todo = files.filter((f) => !into.has(f));
  for (let i = 0; i < todo.length; i += 200) {
    await Promise.all(
      todo.slice(i, i + 200).map(async (f) => {
        const text = await readFile(join(root, f), "utf8").catch(() => "");
        into.set(f, /^\s*namespace\s+@?([A-Za-z_][A-Za-z0-9_]*)/m.exec(text)?.[1] ?? "(global)");
      }),
    );
  }
}

/** Lists sorted, empty folder lists left out: a config that diffs well. */
function sortedConfig(c: Config): Config {
  const sorted = (l?: string[]) => [...(l ?? [])].sort((a, b) => a.localeCompare(b));
  return {
    assemblies: sorted(c.assemblies),
    excluded: sorted(c.excluded),
    ...(c.excludeFolders?.length ? { excludeFolders: sorted(c.excludeFolders) } : {}),
    ...(c.includeFolders?.length ? { includeFolders: sorted(c.includeFolders) } : {}),
  };
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

main().catch((e) => {
  console.error(`codezoom: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
