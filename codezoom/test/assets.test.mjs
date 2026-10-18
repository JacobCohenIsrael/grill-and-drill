// Unity assets as nodes (ADR 0007), on the made-up text assets in
// examples/TinyTowers: a scene, prefabs (one nested, one variant), shared
// ScriptableObject assets and a UnityEvent call. No Unity needed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { indexProject } from "../dist/server/indexer.js";
import { IndexCache } from "../dist/server/cache.js";
import { fromForeignList } from "../dist/server/dotnet/foreignList.js";
import { Query } from "../dist/server/query.js";
import { readUnityYaml } from "../dist/server/unity/yaml.js";
import { readAssetFacts } from "../dist/server/unity/assetFacts.js";
import { dllScriptFileId, md4 } from "../dist/server/unity/md4.js";

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, "../../examples/TinyTowers");
const foreignTypes = fromForeignList(JSON.parse(readFileSync(join(here, "fixtures/tinytowers-foreign-types.json"), "utf8")));
const index = indexProject(project, undefined, undefined, { foreignTypes });
const { graph } = index;
const q = new Query(index.screens);

const id = (path) => `asset:Assets/TinyTowers/${path}`;
const edge = (from, to) => graph.out.get(from)?.get(to);
const out = (from) => [...(graph.out.get(from)?.values() ?? [])].map((e) => `${e.to} ${e.kind}`).sort();

test("assets: scenes, prefabs and ScriptableObject assets wired to own code become nodes", () => {
  const nodes = [...graph.assets.values()].map((a) => `${a.path.replace("Assets/TinyTowers/", "")} «${a.label}»`).sort();
  assert.deepEqual(nodes, [
    "Data/ArrowTower.asset «TowerConfig»",
    "Data/ArrowTowerElite.asset «TowerConfig»",
    "Data/Goblin.asset «EnemyConfig»",
    "Data/Wave1.asset «WaveConfig»",
    "Prefabs/Enemies/Goblin.prefab «prefab»",
    "Prefabs/Enemies/GoblinBoss.prefab «prefab»",
    "Prefabs/Towers/Arrow.prefab «prefab»",
    "Prefabs/Towers/ArrowTower.prefab «prefab»",
    "Prefabs/Towers/ArrowTowerElite.prefab «prefab»",
    "Prefabs/UI/Hud.prefab «prefab»",
    "Prefabs/UI/ShopPanel.prefab «prefab»",
    "Prefabs/Waves.prefab «prefab»",
    "Scenes/Level1.unity «scene»",
  ]);
  assert.equal(index.screens.meta.stats.assets, 13);
  // art only (no script): not a node, and the scene's edge to it goes too
  assert.equal(graph.assets.has(id("Prefabs/Decor/Tree.prefab")), false);
  assert.equal(edge(id("Scenes/Level1.unity"), id("Prefabs/Decor/Tree.prefab")), undefined);
  // a vendor prefab an own prefab nests rolls into the vendor's library
  assert.equal(edge(id("Prefabs/UI/Hud.prefab"), "lib:Assets/Plugins/FancyTween")?.kind, "contains");
});

test("assets: the five edge kinds, and only ever from an asset", () => {
  assert.equal(edge(id("Prefabs/Towers/ArrowTowerElite.prefab"), id("Prefabs/Towers/ArrowTower.prefab")).kind, "inherits");
  assert.equal(edge(id("Data/Goblin.asset"), "TinyTowers.Enemies.EnemyConfig").kind, "instance of");
  assert.equal(edge(id("Prefabs/Enemies/Goblin.prefab"), "TinyTowers.Enemies.Goblin").kind, "contains");
  assert.equal(edge(id("Prefabs/UI/Hud.prefab"), id("Prefabs/UI/ShopPanel.prefab")).kind, "contains");
  assert.equal(edge(id("Data/Wave1.asset"), id("Data/Goblin.asset")).kind, "assigns");
  // an override inside the variant's instance is credited to the variant
  assert.equal(edge(id("Prefabs/Towers/ArrowTowerElite.prefab"), id("Data/ArrowTowerElite.asset")).kind, "assigns");
  // the start button's UnityEvent runs WaveSpawner.Begin inside the nested Waves prefab
  assert.equal(edge(id("Scenes/Level1.unity"), "TinyTowers.Waves.WaveSpawner").kind, "calls");

  // code edges are what they were before assets: 136 edges, 272 References
  const fromTypes = [...graph.out].filter(([from]) => !from.startsWith("asset:")).flatMap(([, m]) => [...m.values()]);
  assert.equal(fromTypes.length, 136);
  assert.equal(fromTypes.reduce((n, e) => n + e.refs.length, 0), 272);
  assert.ok(fromTypes.every((e) => !e.to.startsWith("asset:")), "no edge from a type to an asset");
  assert.deepEqual([index.screens.meta.stats.types, index.screens.meta.stats.edges, index.screens.meta.stats.references], [47, 175, 312]);
});

test("assets: Weight counts occurrences (R) and GameObjects (M); an SO asset is one", () => {
  const w = edge(id("Data/Wave1.asset"), id("Data/Goblin.asset"));
  assert.deepEqual([w.refs.length, new Set(w.refs.map((r) => r.member)).size], [2, 1]);
  const s = q.screen("Wave1.asset").dependencies.items.find((n) => n.name === "Goblin.asset");
  assert.deepEqual([s.referenceCount, s.memberCount, s.weight], [2, 1, 1.4]);
  // References carry the GameObject path
  assert.deepEqual(
    q.references("Level1.unity", "WaveSpawner").references.map((r) => [r.at, r.gameObject]),
    [["Assets/TinyTowers/Scenes/Level1.unity:385", "Canvas/Start Button"]],
  );
  assert.deepEqual(q.references("Hud.prefab", "ShopPanel.prefab").references.map((r) => r.gameObject), ["Hud/ShopPanel"]);
  assert.deepEqual(q.references("Goblin.asset", "EnemyConfig").references.map((r) => r.gameObject), [null]);
});

test("assets: the Focus box lists components (own first) or a ScriptableObject's asset fields", () => {
  const goblin = q.screen("Goblin.prefab").focus;
  assert.deepEqual(goblin.components, ["Goblin ×1", "Health ×1", "PathFollower ×1", "CircleCollider2D ×1", "SpriteRenderer ×1"]);
  assert.equal(goblin.private, 0);
  assert.deepEqual(q.screen("Wave1.asset").focus.fields, ["groups[0].enemy = Goblin.asset", "groups[1].enemy = Goblin.asset"]);
  // Unity UI's scripts are not downloaded here: Unity 6's class identifier still names them
  assert.deepEqual(q.screen("Level1.unity").focus.components, [
    "BuildGrid ×1",
    "GameBootstrap ×1",
    "AudioListener ×1",
    "Button ×1",
    "Camera ×1",
    "Canvas ×1",
    "CanvasRenderer ×1",
    "CanvasScaler ×1",
    "GraphicRaycaster ×1",
    "Image ×1",
  ]);
});

test("assets: rows put code first, then assets by folder distance, then libraries", () => {
  const level = q.screen("Level1.unity").dependencies.items.map((n) => [n.name, n.namespaceDistance]);
  assert.deepEqual(level, [
    ["BuildGrid", 3],
    ["GameBootstrap", 3],
    ["WaveSpawner", 3],
    ["ArrowTower.asset", 2],
    ["Waves.prefab", 2],
    ["Hud.prefab", 3],
  ]);
  const hud = q.screen("Hud.prefab").dependencies.items.map((n) => n.name);
  assert.deepEqual(hud, ["HudPresenter", "ShopPanel.prefab", "FancyTween", "UnityEngine"]);
});

test("assets: search finds them by file name; kind filters; assets: false leaves them out", () => {
  assert.equal(q.search("Goblin").results[0].full, "TinyTowers.Enemies.Goblin", "the type first: its name is the query");
  assert.deepEqual(q.search("Goblin", 10, { kind: "prefab" }).results.map((r) => r.name), ["Goblin.prefab", "GoblinBoss.prefab"]);
  assert.deepEqual(q.search("Goblin", 10, { kind: "asset" }).results.map((r) => [r.name, r.label]), [["Goblin.asset", "EnemyConfig"]]);
  assert.ok(q.search("Goblin", 20, { assets: false }).results.every((r) => !["scene", "prefab", "asset"].includes(r.kind)));
  assert.ok(q.search("Level", 5, { kind: "type" }).results.every((r) => r.kind !== "scene"));

  const withAssets = q.screen("WaveSpawner");
  const without = q.screen("WaveSpawner", { assets: false });
  assert.deepEqual([withAssets.dependents.total, without.dependents.total], [4, 2]);
  assert.deepEqual(without.dependents.items.map((n) => n.name).sort(), ["GameBootstrap", "WaveDebugWindow"]);
  assert.throws(() => q.search("x", 5, { kind: "texture" }), /kind must be one of/);
});

test("assets: the outline is the GameObject tree with components, assigned assets and calls", () => {
  const o = index.assets.outline(id("Scenes/Level1.unity"));
  const line = (n) => `${n.name}${n.prefab ? ` [${n.prefab.name}]` : ""}: ${n.components.map((c) => (c.own ? "*" : "") + c.name).join(", ")}`;
  assert.deepEqual(o.roots.map(line), [
    "Main Camera: Camera, AudioListener",
    "Game: *GameBootstrap",
    "Grid: *BuildGrid",
    "Waves [Waves]: ",
    "Hud [Hud]: ",
    "Canvas: Canvas, CanvasScaler, GraphicRaycaster",
    "Tree [Tree]: ",
  ]);
  const canvas = o.roots.find((n) => n.name === "Canvas");
  const button = canvas.children[0];
  assert.equal(button.path, "Canvas/Start Button");
  assert.deepEqual(button.calls, [{ method: "Begin", type: "WaveSpawner", id: "TinyTowers.Waves.WaveSpawner" }]);
  const game = o.roots.find((n) => n.name === "Game");
  assert.deepEqual(game.fields, [{ field: "towers[0]", value: "ArrowTower.asset", id: id("Data/ArrowTower.asset") }]);
  assert.equal(o.roots.find((n) => n.name === "Tree").prefab.id, null, "art: no node to go to");
  const so = index.assets.outline(id("Data/Goblin.asset"));
  assert.deepEqual(so.roots[0].fields, [{ field: "prefab", value: "Goblin.prefab", id: id("Prefabs/Enemies/Goblin.prefab") }]);
});

test("assets: cached per file; a warm run reads none of them", async () => {
  const dir = mkdtempSync(join(tmpdir(), "codezoom-assets-cache-"));
  const first = IndexCache.load(dir);
  indexProject(project, undefined, first, { foreignTypes });
  assert.ok(first.changed.some((p) => p.endsWith(".prefab")));
  await first.save();
  const second = IndexCache.load(dir);
  const again = indexProject(project, undefined, second, { foreignTypes });
  assert.deepEqual(second.changed, []);
  assert.equal(again.screens.meta.stats.edges, 175);
});

test("assets: a changed prefab is read again; an override to a new config shows up", () => {
  const copy = mkdtempSync(join(tmpdir(), "codezoom-assets-copy-"));
  cpSync(project, copy, { recursive: true, filter: (src) => !src.includes(".codezoom") });
  const cache = IndexCache.load(null);
  indexProject(copy, undefined, cache, { foreignTypes });
  const variant = join(copy, "Assets/TinyTowers/Prefabs/Towers/ArrowTowerElite.prefab");
  const goblinGuid = /guid: (\w+)/.exec(readFileSync(join(copy, "Assets/TinyTowers/Data/Goblin.asset.meta"), "utf8"))[1];
  writeFileSync(variant, readFileSync(variant, "utf8").replace(/(objectReference: \{fileID: 11400000, guid: )\w+/, `$1${goblinGuid}`));
  const after = indexProject(copy, undefined, cache, { foreignTypes });
  assert.deepEqual(cache.changed, ["Assets/TinyTowers/Prefabs/Towers/ArrowTowerElite.prefab"]);
  assert.equal(after.graph.out.get(id("Prefabs/Towers/ArrowTowerElite.prefab")).get(id("Data/Goblin.asset"))?.kind, "assigns");
});

test("Unity YAML: documents, sequences, stripped objects; data lines skipped", () => {
  const docs = readUnityYaml(
    [
      "%YAML 1.1",
      "%TAG !u! tag:unity3d.com,2011:",
      "--- !u!114 &11400000",
      "MonoBehaviour:",
      "  m_GameObject: {fileID: 0}",
      "  m_Script: {fileID: 11500000, guid: 0123456789abcdef0123456789abcdef, type: 3}",
      "  m_Name: Config",
      "  title: 'A long title that Unity wraps",
      "",
      "    onto the next line: like this'",
      "  waves:",
      "  - {fileID: 11400000, guid: fedcba9876543210fedcba9876543210, type: 2}",
      "  - {fileID: 0}",
      "  groups:",
      "  - enemy: {fileID: 11400000, guid: 00000000000000000000000000000001, type: 2}",
      "    count: 3",
      "  data: " + "ab".repeat(500),
      "  after: 1",
      "--- !u!1 &42 stripped",
      "GameObject:",
      "  m_CorrespondingSourceObject: {fileID: 7, guid: 11111111111111111111111111111111, type: 3}",
      "  m_PrefabInstance: {fileID: 9}",
      "",
    ].join("\n"),
  );
  assert.equal(docs.length, 2);
  const paths = docs[0].fields.map(([p, , line]) => `${line}:${p}`);
  assert.deepEqual(paths, ["5:m_GameObject", "6:m_Script", "7:m_Name", "8:title", "12:waves[0]", "13:waves[1]", "15:groups[0].enemy", "16:groups[0].count", "18:after"]);
  assert.deepEqual([docs[1].fileId, docs[1].stripped, docs[1].className], ["42", true, "GameObject"]);

  const facts = readAssetFacts("Assets/Config.asset", readFileSync(join(project, "Assets/TinyTowers/Data/Wave1.asset"), "utf8"));
  assert.equal(facts.root.name, "Wave1");
  assert.deepEqual(facts.assigns.map((a) => a.field), ["groups[0].enemy", "groups[1].enemy"]);
  // an .asset that is not a ScriptableObject (a mesh) gives nothing
  assert.equal(readAssetFacts("Assets/Mesh.asset", "--- !u!43 &4300000\nMesh:\n  m_Name: Rock\n").root, null);
});

test("MD4, and the fileID Unity gives a class in a DLL", () => {
  const hex = (s) => Buffer.from(md4(new TextEncoder().encode(s))).toString("hex");
  assert.equal(hex(""), "31d6cfe0d16ae931b73c59d7e0c089c0");
  assert.equal(hex("abc"), "a448017aaf21d8525fc10ae87aa6729d");
  // as Unity writes them for UnityEngine.UI shipped as a DLL
  assert.equal(dllScriptFileId("UnityEngine.UI", "Text"), "708705254");
  assert.equal(dllScriptFileId("UnityEngine.UI", "CanvasScaler"), "1980459831");
});
