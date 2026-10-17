// TinyTowers (examples/TinyTowers) indexed with the committed foreign type
// list, so these pass the same with or without Unity installed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
  assert.equal(s.types, 47);
  assert.equal(s.edges, 136);
  assert.equal(s.references, 272);
  assert.equal(s.libraries, 3);
  assert.equal(s.unresolved, 0);
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
    "Dependencies: TowerConfig is a cycle, expected not a cycle",
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
