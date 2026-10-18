// The rules the page and the indexer share: search, Weight sizes, own code,
// and reading one #if configuration.

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesName, search } from "../dist/server/shared/search.js";
import { sizeRow } from "../dist/server/shared/weight.js";
import { FolderRules, verdict } from "../dist/server/shared/ownRules.js";
import { configure } from "../dist/server/csharp/branches.js";

const node = (name, dependents = 0) => ({ id: name, name, full: `Game.${name}`, namespace: "Game", kind: "class", label: "class", abstract: false, dependents, dependencies: 0 });

test("search matches substrings and word starts", () => {
  const nodes = ["CampaignApplication", "CampaignSave", "CameraRig", "BossSpawner", "GameHudService", "GameHudServiceFactory"].map((n) => node(n));
  assert.equal(search(nodes, "CA")[0].name, "CampaignApplication");
  assert.deepEqual(search(nodes, "CampAp").map((n) => n.name), ["CampaignApplication"]);
  assert.equal(search(nodes, "BS")[0].name, "BossSpawner");
  assert.equal(search(nodes, "bs")[0].name, "BossSpawner");
  assert.equal(search(nodes, "GHS")[0].name, "GameHudService"); // whole name before a longer one
  assert.ok(matchesName(node("CampaignApplication"), "plica"));
  assert.ok(!matchesName(node("CampaignApplication"), "CampAx"));
});

test("box sizes follow the row's heaviest own-code Weight", () => {
  const n = (id, weight, edge = "uses") => ({ id, edge, count: 1, members: 1, weight, distance: 0, cycle: false, refs: [] });
  const row = [n("a", 10), n("b", 5), n("c", 2), n("d", 1.9), n("base", 1, "inherits"), n("lib:Unity", 40)];
  const isLib = (id) => id.startsWith("lib:");
  assert.deepEqual(sizeRow(row, "dependencies", isLib), ["large", "large", "medium", "small", "medium", "small"]);
  // an Inherits target is never small, but only in the Dependencies row
  assert.equal(sizeRow(row, "dependents", isLib)[4], "small");
  // nothing dominates when the heaviest Weight is 2 or less
  assert.deepEqual(sizeRow([n("a", 2), n("b", 1)], "dependencies", isLib), ["medium", "medium"]);
});

test("own code: defaults, configs with and without excluded, new assemblies", () => {
  const files = ["Assets/Game/A.cs"];
  assert.equal(verdict("Game", files, null).own, true);
  assert.equal(verdict("Game.Tests", files, null).own, false);
  assert.equal(verdict("Pkg", ["Packages/p/A.cs"], null).own, false);
  // a hand-written config without "excluded": unlisted means left out
  assert.deepEqual(verdict("Other", files, { assemblies: ["Game"] }), { own: false, reason: "not listed in config", isNew: false });
  // with "excluded": unlisted is new and follows the defaults
  const config = { assemblies: ["Game"], excluded: ["Vendor"] };
  assert.deepEqual(verdict("Other", files, config), { own: true, reason: null, isNew: true });
  assert.equal(verdict("Vendor", files, config).own, false);
});

test("folder rules: vendor folders out, the most specific override wins", () => {
  const defaults = new FolderRules({});
  assert.equal(defaults.isOwnFile("Assets/Game/A.cs"), true);
  assert.equal(defaults.isOwnFile("Assets/Plugins/X/A.cs"), false);
  assert.equal(defaults.isOwnFile("Assets/Photon/A.cs"), false);
  assert.equal(defaults.isOwnFile("Assets/Game/Photon/A.cs"), true); // a vendor's name deep inside own code
  const rules = new FolderRules({ excludeFolders: ["Assets/Game"], includeFolders: ["Assets/Game/Keep", "Assets/Plugins/Mine"] });
  assert.equal(rules.isOwnFile("Assets/Game/A.cs"), false);
  assert.equal(rules.isOwnFile("Assets/Game/Keep/A.cs"), true);
  assert.equal(rules.isOwnFile("Assets/Plugins/Mine/A.cs"), true);
});

test("one #if configuration keeps line numbers", () => {
  const text = ["#if X", "a", "#elif Y && !Z", "b", "#else", "c", "#endif", "d"].join("\r\n");
  assert.deepEqual(configure(text, new Set(["X"])).split("\n"), ["", "a\r", "", "", "", "", "", "d"]);
  assert.deepEqual(configure(text, new Set(["Y"])).split("\n"), ["", "", "", "b\r", "", "", "", "d"]);
  assert.deepEqual(configure(text, new Set(["Y", "Z"])).split("\n"), ["", "", "", "", "", "c\r", "", "d"]);
});

test("Show animations: on by default, off when the system asks for reduced motion, the reader's choice wins", async () => {
  const { animationsOn, storedFlag } = await import("../dist/server/shared/prefs.js");
  assert.equal(animationsOn(null, false), true);
  assert.equal(animationsOn(null, true), false, "prefers-reduced-motion: reduce starts it off");
  assert.equal(animationsOn("1", true), true, "turned on by the reader despite the system");
  assert.equal(animationsOn("0", false), false, "turned off by the reader");
  assert.equal(storedFlag(null, true), true, "Show assets starts on");
  assert.equal(storedFlag("0", true), false);
  assert.equal(storedFlag("garbage", false), false);
});
