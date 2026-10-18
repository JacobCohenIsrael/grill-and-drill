// `codezoom mcp` on examples/TinyTowers, through the official MCP client:
// the three tools answer with the facts the golden walks pin.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, "../../examples/TinyTowers");
const cli = join(here, "../bin/codezoom.js");
const foreignFile = join(here, "fixtures/tinytowers-foreign-types.json");
const version = JSON.parse(readFileSync(join(here, "../package.json"), "utf8")).version;

async function withServer(fn, { cwd = project, extra = [], foreign = foreignFile } = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, "mcp", "--no-cache", "--no-watch", ...(foreign ? ["--foreign-types", foreign] : []), ...extra],
    cwd,
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr.on("data", (d) => (stderr += d));
  const client = new Client({ name: "codezoom-test", version: "0" });
  const errors = [];
  client.onerror = (e) => errors.push(e);
  await client.connect(transport);
  const call = async (name, args) => {
    const r = await client.callTool({ name, arguments: args });
    return r.isError ? { error: r.content[0].text } : JSON.parse(r.content[0].text);
  };
  try {
    await fn({ client, call, stderr: () => stderr });
  } finally {
    await client.close();
  }
  assert.deepEqual(errors, [], "the client saw no protocol errors");
}

const names = (row) => row.items.map((n) => n.name);

test("mcp: three stateless tools, no source and no walk tool", async () => {
  await withServer(async ({ client }) => {
    assert.equal(client.getServerVersion().name, "codezoom");
    assert.equal(client.getServerVersion().version, version);
    assert.match(client.getInstructions(), /Dependents/);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["references", "screen", "search"]);
    for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  });
});

test("mcp search: Jump's matcher, with counts", async () => {
  await withServer(async ({ call }) => {
    const a = await call("search", { query: "WSp" });
    assert.equal(a.results[0].full, "TinyTowers.Waves.WaveSpawner");
    assert.deepEqual(Object.keys(a.results[0]).sort(), ["dependencies", "dependents", "full", "kind", "label", "name"]);
    assert.equal(a.results[0].label, "MonoBehaviour");
    const towers = await call("search", { query: "Tower", limit: 3 });
    assert.equal(towers.results.length, 3);
    assert.ok(towers.total > 3);
    assert.equal(towers.results[0].name, "Tower");
  });
});

test("mcp screen: Tower's rows as the golden walk pins them", async () => {
  await withServer(async ({ call }) => {
    const s = await call("screen", { focus: "TinyTowers.Towers.Tower" });
    assert.equal(s.focus.name, "Tower");
    assert.equal(s.focus.label, "MonoBehaviour");
    assert.equal(s.focus.file, "Assets/TinyTowers/Gameplay/Towers/Tower.cs:9");
    assert.ok(s.focus.attributes.includes("# config: TowerConfig {serialized}"));
    assert.ok(s.focus.operations.includes("+ Upgrade()"));
    assert.equal(s.focus.private, 6);

    assert.equal(s.dependents.total, 6);
    assert.deepEqual(names(s.dependents).sort(), ["ArrowTower", "BuildGrid", "CannonTower", "FrostTower", "TowerConfig", "TowerShop"]);
    assert.equal(s.dependencies.total, 8);
    // page order: large first, then by namespace distance and Weight; libraries last
    assert.deepEqual(names(s.dependencies), ["TowerConfig", "ITargetable", "FurthestAlong", "ITargetingStrategy", "EnemyRegistry", "GameClock", "Goblin", "UnityEngine"]);
    const dep = (name) => s.dependencies.items.find((n) => n.name === name);
    assert.deepEqual([dep("TowerConfig").edge, dep("TowerConfig").size, dep("TowerConfig").cycle], ["has", "large", true]);
    assert.deepEqual([dep("ITargetable").edge, dep("ITargetable").size, dep("ITargetable").cycle], ["has", "large", false]);
    assert.deepEqual([dep("ITargetable").weight, dep("ITargetable").referenceCount, dep("ITargetable").memberCount], [4, 4, 4]);
    assert.equal(dep("ITargetable").file, "Assets/TinyTowers/Core/ITargetable.cs:6");
    assert.equal(dep("ITargetable").namespaceDistance, 2); // TinyTowers.Towers -> TinyTowers -> TinyTowers.Core
    const unity = dep("UnityEngine");
    assert.deepEqual([unity.edge, unity.size, unity.kind, unity.namespaceDistance, unity.file], ["inherits", "small", "library", null, null]);
    assert.ok(s.dependents.items.find((n) => n.name === "ArrowTower").edge === "inherits");
    assert.equal(names(s.dependencies).includes("WaveSpawner"), false);
    for (const n of [...s.dependents.items, ...s.dependencies.items]) assert.equal("refs" in n || "references" in n, false, "no References on a Screen");
    assert.deepEqual(s.notes, []);
  });
});

test("mcp screen: rows are paged and filtered, totals always given", async () => {
  await withServer(async ({ call }) => {
    const all = await call("screen", { focus: "Tower" });
    const page = await call("screen", { focus: "Tower", limit: 2, offset: 2 });
    assert.deepEqual([page.dependencies.total, page.dependencies.matching, page.dependencies.offset, page.dependencies.shown], [8, 8, 2, 2]);
    assert.deepEqual(names(page.dependencies), names(all.dependencies).slice(2, 4));
    // sizes come from the whole row, before the filter, as on the page
    const filtered = await call("screen", { focus: "Tower", filter: "ITarg" });
    assert.deepEqual(names(filtered.dependencies), ["ITargetable", "ITargetingStrategy"]);
    assert.deepEqual([filtered.dependencies.matching, filtered.dependencies.total], [2, 8]);
    assert.equal(filtered.dependencies.items[1].size, "medium");

    const unity = await call("screen", { focus: "UnityEngine" });
    assert.equal(unity.focus.kind, "library");
    // 28 types, and two prefabs whose UIDocument is UnityEngine's
    assert.deepEqual([unity.dependents.total, unity.dependents.shown], [30, 25], "25 per row by default");
    const rest = await call("screen", { focus: "UnityEngine", offset: 25 });
    assert.equal(rest.dependents.shown, 5);
    assert.equal(unity.dependencies.total, 0);
  });
});

test("mcp references: file:line and member behind one edge", async () => {
  await withServer(async ({ call }) => {
    const r = await call("references", { from: "Tower", to: "TowerConfig" });
    assert.equal(r.edge, "has");
    assert.equal(r.referenceCount, 3);
    assert.deepEqual(r.references, [
      { at: "Assets/TinyTowers/Gameplay/Towers/Tower.cs:11", member: "config" },
      { at: "Assets/TinyTowers/Gameplay/Towers/Tower.cs:16", member: "Config" },
      { at: "Assets/TinyTowers/Gameplay/Towers/Tower.cs:20", member: "Place()" },
    ]);
    const one = await call("references", { from: "Tower", to: "TowerConfig", limit: 1, offset: 1 });
    assert.deepEqual([one.shown, one.references[0].member], [1, "Config"]);
    const lib = await call("references", { from: "Tower", to: "UnityEngine" });
    assert.equal(lib.references.length, lib.referenceCount);

    const backwards = await call("references", { from: "Tower", to: "ArrowTower" });
    assert.match(backwards.error, /ArrowTower depends on Tower/);
    assert.match((await call("references", { from: "Tower", to: "Wallet" })).error, /no edge/);
  });
});

test("mcp: names that miss, or match several, are tool errors", async () => {
  await withServer(async ({ call }) => {
    assert.match((await call("screen", { focus: "NoSuchType" })).error, /no node matches/);
    assert.match((await call("screen", {})).error, /"focus" is required/);
    assert.match((await call("screen", { focus: "Tower", limit: -1 })).error, /whole number/);
  });
});

test("mcp: without a config every answer says the default rules apply", async () => {
  await withServer(
    async ({ call }) => {
      for (const a of [await call("search", { query: "Tower" }), await call("screen", { focus: "Tower" }), await call("references", { from: "Tower", to: "TowerConfig" })]) {
        assert.equal(a.notes.length, 1);
        assert.match(a.notes[0], /default rules.*codezoom setup/);
      }
    },
    { extra: ["--config", join(tmpdir(), "codezoom-no-such-config.json")] },
  );
});

test("mcp: a folder that is no project answers with a clear error", async () => {
  await withServer(
    async ({ call }) => {
      const a = await call("search", { query: "Tower" });
      assert.match(a.error, /No C# found/);
    },
    { cwd: mkdtempSync(join(tmpdir(), "codezoom-empty-")) },
  );
});

test("mcp: stdout carries protocol messages only", async () => {
  const child = spawn(process.execPath, [cli, "mcp", "--no-cache", "--no-watch", "--foreign-types", foreignFile], { cwd: project });
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  const send = (m) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...m })}\n`);
  send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "0" } } });
  send({ method: "notifications/initialized" });
  send({ id: 2, method: "tools/call", params: { name: "screen", arguments: { focus: "Tower", limit: 1 } } });
  send({ id: 3, method: "no/such/method" });
  child.stdin.end();
  await new Promise((resolve) => child.on("close", resolve));
  const messages = out.trim().split("\n").map((l) => JSON.parse(l));
  // answers come as they are ready: the screen waits for the index
  assert.deepEqual(messages.map((m) => [m.jsonrpc, m.id]).sort((a, b) => a[1] - b[1]), [["2.0", 1], ["2.0", 2], ["2.0", 3]]);
  assert.equal(messages.find((m) => m.id === 1).result.protocolVersion, "2025-06-18");
  assert.equal(JSON.parse(messages.find((m) => m.id === 2).result.content[0].text).dependencies.shown, 1);
  assert.equal(messages.find((m) => m.id === 3).error.code, -32601);
  assert.match(err, /codezoom mcp: \d+ types/, "logs go to stderr");
});

test("--json answers exactly as the tools do", async () => {
  const { execFileSync } = await import("node:child_process");
  const cliJson = (...args) => {
    try {
      return { code: 0, out: JSON.parse(execFileSync(process.execPath, [cli, ...args, "--json", "--no-cache", "--foreign-types", foreignFile], { cwd: project, encoding: "utf8", stdio: "pipe" })) };
    } catch (e) {
      return { code: e.status, out: JSON.parse(e.stdout) };
    }
  };
  await withServer(async ({ call }) => {
    assert.deepEqual(cliJson("screen", "Tower", "--limit", "3", "--filter", "o").out, await call("screen", { focus: "Tower", limit: 3, filter: "o" }));
    assert.deepEqual(cliJson("search", "WSp").out, await call("search", { query: "WSp" }));
    assert.deepEqual(cliJson("references", "Tower", "TowerConfig").out, await call("references", { from: "Tower", to: "TowerConfig" }));
  });
  const miss = cliJson("screen", "NoSuchType");
  assert.equal(miss.code, 1);
  assert.match(miss.out.error, /no node matches/);
});

test("mcp on a .NET solution: unrestored answers say `dotnet restore` would make them exact", async () => {
  const shop = join(here, "../../examples/TinyShop");
  await withServer(
    async ({ call }) => {
      const s = await call("screen", { focus: "OrderService" });
      assert.match(s.notes.join(" "), /Not restored: .*`dotnet restore`/);
      assert.ok(s.dependencies.items.some((n) => n.name === "Microsoft.Extensions.Logging.Abstractions" && n.kind === "library" && n.edge === "has"));
      assert.match((await call("search", { query: "Json" })).notes.join(" "), /dotnet restore/);
    },
    { cwd: shop, foreign: null },
  );
  await withServer(
    async ({ call }) => {
      const s = await call("screen", { focus: "OrderService" });
      assert.deepEqual(s.notes, []);
      assert.deepEqual(s.dependents.items.map((n) => n.name), ["Program"]);
    },
    { cwd: shop, foreign: join(here, "fixtures/tinyshop-foreign-types.json") },
  );
});

test("mcp: assets have a kind, search filters by it, and assets: false leaves them out", async () => {
  await withServer(async ({ client, call }) => {
    const { tools } = await client.listTools();
    const search = tools.find((t) => t.name === "search");
    assert.ok(search.inputSchema.properties.kind.enum.includes("prefab"));
    assert.equal(search.inputSchema.properties.assets.type, "boolean");
    const prefabs = await call("search", { query: "Goblin", kind: "prefab" });
    assert.deepEqual(prefabs.results.map((r) => [r.name, r.kind]), [["Goblin.prefab", "prefab"], ["GoblinBoss.prefab", "prefab"]]);
    const level = await call("screen", { focus: "Level1.unity" });
    assert.equal(level.focus.kind, "scene");
    assert.ok(level.focus.components.includes("GameBootstrap ×1"));
    const spawner = await call("screen", { focus: "WaveSpawner", assets: false });
    assert.ok(spawner.dependents.items.every((n) => !["scene", "prefab", "asset"].includes(n.kind)));
    const refs = await call("references", { from: "Level1.unity", to: "WaveSpawner" });
    assert.deepEqual(refs.references, [{ at: "Assets/TinyTowers/Scenes/Level1.unity:385", gameObject: "Canvas/Start Button" }]);
    assert.match((await call("screen", { focus: "Level1.unity", assets: "no" })).error, /true or false/);
  });
});
