// TinyTowers (examples/TinyTowers) indexed with the committed foreign type
// list, so these pass the same with or without Unity installed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { indexProject } from "../dist/server/indexer.js";
import { fromForeignList } from "../dist/server/dotnet/foreignList.js";
import { parseWalk, runWalk } from "../dist/server/walk.js";

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, "../../examples/TinyTowers");
const walksDir = join(project, "walks");
const foreignFile = join(here, "fixtures/tinytowers-foreign-types.json");
const foreignTypes = fromForeignList(JSON.parse(readFileSync(foreignFile, "utf8")));
const index = indexProject(project, undefined, undefined, { foreignTypes });
const screens = index.screens;

/** Problems a walk finds, flattened. */
const problems = (walk) => runWalk(walk, screens).flatMap((r) => r.problems);
const tower = { start: "TinyTowers.Towers.Tower", steps: [] };

test("indexes TinyTowers to the known totals", () => {
  const s = screens.meta.stats;
  assert.equal(index.project.source, "asmdef"); // no .csproj files in the repo
  assert.deepEqual(
    index.own.assemblies.map((a) => a.assembly),
    ["Assembly-CSharp", "TinyTowers.Core", "TinyTowers.Editor", "TinyTowers.Gameplay", "TinyTowers.UI"],
  );
  assert.equal(s.types, 48);
  // 139 edges and 298 References between types; the rest start at its 13 assets (assets.test.mjs)
  assert.equal(s.assets, 13);
  assert.equal(s.edges, 178);
  assert.equal(s.references, 338);
  assert.equal(s.libraries, 3);
  assert.equal(s.unresolved, 0);
});

test("TinyTowers has four Tangles: two of types, two of assets", () => {
  const name = new Map(screens.meta.nodes.map((n) => [n.id, n.name]));
  assert.deepEqual(
    screens.meta.tangles.map((t) => t.map(({ id, inside }) => `${name.get(id)} ${inside}`)),
    [
      ["Enemy 5", "EnemyRegistry 3", "Bat 2", "EnemyConfig 2"],
      ["ArrowTower.asset 3", "ArrowTower.prefab 3", "ArrowTowerElite.asset 3", "ArrowTowerElite.prefab 3"],
      ["Tower 2", "TowerConfig 2"],
      ["Goblin.asset 2", "Goblin.prefab 2"],
    ],
  );
  const sizes = screens.meta.nodes.filter((n) => n.tangle).map((n) => n.tangle);
  assert.equal(sizes.length, 12);
});

test("stale .csproj files: the folders decide the files, the .csproj lends its defines (ADR 0010)", () => {
  const copy = mkdtempSync(join(tmpdir(), "codezoom-stale-csproj-"));
  cpSync(project, copy, { recursive: true, filter: (src) => !src.includes("/.codezoom") });
  const gameplay = index.projects.find((p) => p.assembly === "TinyTowers.Gameplay").compile;
  // what Unity wrote before WaveSpawner.cs and BakedPath.g.cs were added, and after Gone.cs was deleted
  const listed = gameplay.filter((f) => !/\/(WaveSpawner|BakedPath\.g)\.cs$/.test(f));
  const csproj = (name, files, defines) =>
    `<Project><PropertyGroup><AssemblyName>${name}</AssemblyName><DefineConstants>${defines}</DefineConstants></PropertyGroup>` +
    `<ItemGroup>${files.map((f) => `<Compile Include="${f.replace(/\//g, "\\")}" />`).join("")}</ItemGroup></Project>`;
  writeFileSync(join(copy, "TinyTowers.Gameplay.csproj"), csproj("TinyTowers.Gameplay", [...listed, "Assets/TinyTowers/Gameplay/Gone.cs"], "UNITY_EDITOR;TINYTOWERS_STALE"));
  // a registry package's source, which only a .csproj can point at
  writeFileSync(join(copy, "Unity.Fake.csproj"), csproj("Unity.Fake", ["Library/PackageCache/com.unity.fake/Runtime/Fake.cs"], "UNITY_EDITOR"));

  const stale = indexProject(copy, undefined, undefined, { foreignTypes });
  assert.equal(stale.project.source, "csproj");
  const all = index.projects.flatMap((p) => p.compile).filter((f) => f.endsWith(".cs")).length;
  assert.equal(stale.project.notInCsproj, all - listed.length);
  const s = stale.screens.meta.stats;
  assert.deepEqual([s.types, s.edges, s.references], [48, 178, 338], "every file is read, Gone.cs is not missed");
  const defines = (name) => stale.projects.find((p) => p.assembly === name).defines;
  assert.ok(defines("TinyTowers.Gameplay").includes("TINYTOWERS_STALE"));
  assert.deepEqual(defines("TinyTowers.Core"), defines("TinyTowers.Gameplay"), "an assembly with no .csproj borrows the largest one's defines");
  assert.ok(stale.projects.some((p) => p.assembly === "Unity.Fake"));
  assert.ok(!stale.projects.find((p) => p.assembly === "TinyTowers.Gameplay").compile.some((f) => f.endsWith("/Gone.cs")));
});

test("TinyTowers has three groups of Duplicates; the generated look-alike and the one under 50 nodes are in none", () => {
  const name = new Map(screens.meta.nodes.map((n) => [n.id, n.name]));
  assert.deepEqual(
    screens.meta.duplicates.map((g) => [g.nodes, ...g.members.map((m) => `${name.get(m.id)}.${m.member}`)]),
    [
      [67, "CannonTower.StaggerNear()", "FrostTower.ChillNear()"],
      [60, "WaveSpawner.DelayFrom()", "WaveSpawner.EnemiesFrom()"],
      [56, "TowerShop.PriceLabel()", "TowerShopPanel.LabelFor()"],
    ],
  );
  // BakedPath.g.cs repeats Path.LengthFrom, but it is generated: in the graph, without shapes
  const baked = index.graph.types.get("TinyTowers.Enemies.BakedPath");
  assert.ok(baked);
  assert.ok(baked.members.every((m) => !m.shapes));
  assert.equal(index.graph.types.get("TinyTowers.Enemies.Path").members.find((m) => m.name === "LengthFrom").shapes[0].nodes, 53);
  // Wallet.Restore and Lives.Restore have the same shape at 45 nodes: too small to keep
  assert.ok(index.graph.types.get("TinyTowers.Economy.Wallet").members.every((m) => !m.shapes));
});

test("a Cycle's hover evidence goes hop by hop, each with its first Reference", () => {
  const bat = screens.meta.nodes.find((n) => n.name === "Bat");
  const screen = JSON.parse(screens.json.get(bat.id));
  const [enemy] = screen.dependencies;
  const name = new Map(screens.meta.nodes.map((n) => [n.id, n.name]));
  assert.deepEqual(
    enemy.hints[0].hops.map((h) => `${name.get(h.from)} ${h.edge} ${name.get(h.to)}: ${h.ref[0]} ${screens.meta.files[h.ref[1]].split("/").pop()}:${h.ref[2]}`),
    ["Bat inherits Enemy: base type Bat.cs:4", "Enemy uses EnemyRegistry: Spawn() Enemy.cs:27", "EnemyRegistry uses Bat: InRange() EnemyRegistry.cs:22"],
  );
  // a neighbour on no shortest Cycle carries no hints at all
  const enemyScreen = JSON.parse(screens.json.get(enemy.id));
  assert.equal(enemyScreen.dependents.find((n) => n.id === bat.id).hints, undefined);
});

for (const file of readdirSync(walksDir).filter((f) => f.endsWith(".json"))) {
  test(`golden walk ${file}`, () => {
    const walk = parseWalk(readFileSync(join(walksDir, file), "utf8"));
    const results = runWalk(walk, screens);
    assert.equal(results.length, walk.steps.length + 1);
    for (const r of results) assert.deepEqual(r.problems, [], r.move);
  });
}

test("a walk reports a missing neighbour", () => {
  const p = problems({ ...tower, expect: { dependencies: [{ name: "Wallet" }] } });
  assert.deepEqual(p, ["Dependencies: missing Wallet"]);
});

test("a walk checks edge kind, size and cycle only where it states them", () => {
  assert.deepEqual(problems({ ...tower, expect: { dependents: ["TowerConfig"] } }), []);
  const p = problems({
    ...tower,
    expect: { dependencies: [{ name: "TowerConfig", edge: "uses", size: "small", cycle: false }] },
  });
  assert.deepEqual(p, [
    "Dependencies: TowerConfig is has, expected uses",
    "Dependencies: TowerConfig is large (Weight 3), expected small",
    "Dependencies: TowerConfig is on a shortest Cycle, expected not to be",
  ]);
});

test("a walk checks the Focus's Tangle size only where it states it", () => {
  assert.deepEqual(problems({ ...tower, expect: { tangle: 2 } }), []);
  assert.deepEqual(problems({ ...tower, expect: { tangle: 4 } }), ["Tower is in a Tangle of 2, expected a Tangle of 4"]);
  assert.deepEqual(problems({ start: "WaveSpawner", steps: [], expect: { tangle: 2 } }), ["WaveSpawner is in no Tangle, expected a Tangle of 2"]);
  assert.deepEqual(problems({ ...tower, expect: { tangle: 0 } }), ["Tower is in a Tangle of 2, expected none"]);
});

test("a walk checks Duplicates only where it states them", () => {
  const cannon = { start: "CannonTower", steps: [] };
  assert.deepEqual(problems({ ...cannon, expect: { dependencies: ["Tower"] } }), []);
  assert.deepEqual(problems({ ...cannon, expect: { duplicates: 1 } }), []);
  assert.deepEqual(problems({ ...cannon, expect: { duplicates: 0 } }), ["CannonTower has 1 Duplicate, expected 0"]);
  assert.deepEqual(problems({ ...tower, expect: { duplicates: 2 } }), ["Tower has 0 Duplicates, expected 2"]);
  const shop = { start: "TowerShop", steps: [] };
  assert.deepEqual(problems({ ...shop, expect: { dependents: [{ name: "TowerShopPanel", duplicate: false }, { name: "GameBootstrap", duplicate: true }] } }), [
    "Dependents: TowerShopPanel holds Duplicate of a Focus member, expected none",
    "Dependents: GameBootstrap holds no Duplicate of a Focus member, expected one",
  ]);
});

test("a walk reports a neighbour that should be absent", () => {
  assert.deepEqual(problems({ ...tower, expect: { absent: { dependents: ["BuildGrid"] } } }), ["Dependents: BuildGrid should not be there"]);
});

test("moves that cannot be made are reported, and the walk goes on", () => {
  const results = runWalk({ ...tower, steps: [{ drill: "WaveSpawner" }, { back: true }, { drill: "ArrowTower", expect: { focus: "ArrowTower" } }] }, screens);
  assert.deepEqual(
    results.map((r) => r.problems),
    [[], ['"WaveSpawner" is not on the screen of Tower'], ["nothing to go back to"], []],
  );
});

test("drilling to the previous Focus goes Back, as on the page", () => {
  const results = runWalk({ ...tower, steps: [{ drill: "ArrowTower" }, { drill: "Tower" }, { back: true }] }, screens);
  assert.equal(results[2].focus, "TinyTowers.Towers.Tower");
  assert.deepEqual(results[3].problems, ["nothing to go back to"]);
});

test("Jump goes to the first search result", () => {
  const [, jump] = runWalk({ ...tower, steps: [{ jump: "WSp" }] }, screens);
  assert.equal(jump.focus, "TinyTowers.Waves.WaveSpawner");
});

test("parseWalk rejects typos instead of passing them", () => {
  assert.throws(() => parseWalk(JSON.stringify({ start: "Tower", steps: [], expect: { dependecies: [] } })), /unknown key "dependecies"/);
  assert.throws(() => parseWalk(JSON.stringify({ start: "Tower", steps: [{ drill: "A", back: true }] })), /exactly one of/);
  assert.throws(() => parseWalk(JSON.stringify({ start: "Tower", steps: [], expect: { dependents: [{ name: "A", size: "huge" }] } })), /size must be one of/);
  assert.throws(() => parseWalk(JSON.stringify({ start: "Tower", steps: [], expect: { tangle: 1 } })), /tangle must be 0 or a Tangle size/);
  assert.throws(() => parseWalk(JSON.stringify({ start: "Tower", steps: [], expect: { tangle: "2" } })), /tangle must be 0 or a Tangle size/);
  assert.throws(() => parseWalk(JSON.stringify({ start: "Tower", steps: [], expect: { duplicates: -1 } })), /duplicates must be a count/);
  assert.throws(() => parseWalk(JSON.stringify({ start: "Tower", steps: [], expect: { dependents: [{ name: "A", duplicate: "yes" }] } })), /duplicate must be true or false/);
  assert.throws(() => parseWalk(JSON.stringify({ start: "Tower", steps: [], expect: { duplicate: 1 } })), /unknown key "duplicate"/);
});

test("codezoom walk exits 0, 1 or 2", () => {
  const cli = join(here, "../bin/codezoom.js");
  const run = (...files) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [cli, "walk", ...files, "--no-cache", "--foreign-types", foreignFile], { cwd: project, encoding: "utf8", stdio: "pipe" }) };
    } catch (e) {
      return { code: e.status, out: `${e.stdout}${e.stderr}` };
    }
  };
  const tmp = mkdtempSync(join(tmpdir(), "codezoom-walk-"));
  const failing = join(tmp, "failing.walk.json");
  writeFileSync(failing, JSON.stringify({ start: "Tower", steps: [], expect: { dependencies: ["Wallet"] } }));
  const broken = join(tmp, "broken.walk.json");
  writeFileSync(broken, "{ not json");

  const pass = run(join(walksDir, "tower.walk.json"));
  assert.equal(pass.code, 0, pass.out);
  assert.match(pass.out, /all 5 screens as expected/);
  const fail = run(failing);
  assert.equal(fail.code, 1);
  assert.match(fail.out, /Dependencies: missing Wallet/);
  const unreadable = run(broken);
  assert.equal(unreadable.code, 2);
  assert.match(unreadable.out, /cannot read it: not JSON/);
});
