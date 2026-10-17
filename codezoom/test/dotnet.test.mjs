// Plain .NET (ADR 0006): examples/TinyShop with the committed type list (as
// if restored), and unrestored with the list codezoom ships; then small
// made-up folders for the rules. No .NET SDK is used: dotnetRoots is empty.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { indexProject } from "../dist/server/indexer.js";
import { fromForeignList } from "../dist/server/dotnet/foreignList.js";
import { loadDotnetProjects } from "../dist/server/dotnet/load.js";
import { Query, indexNotes } from "../dist/server/query.js";
import { verdict } from "../dist/server/shared/ownRules.js";
import { parseWalk, runWalk } from "../dist/server/walk.js";

const here = dirname(fileURLToPath(import.meta.url));
const shop = join(here, "../../examples/TinyShop");
const walksDir = join(shop, "walks");
const foreignTypes = fromForeignList(JSON.parse(readFileSync(join(here, "fixtures/tinyshop-foreign-types.json"), "utf8")));
const noSdk = { dotnetRoots: [] };
const exact = indexProject(shop, undefined, undefined, { foreignTypes });
const unrestored = indexProject(shop, undefined, undefined, noSdk);

const edgesOf = (index, from) => [...(index.graph.out.get(from)?.values() ?? [])].map((e) => `${e.to} ${e.kind}`).sort();
const walks = readdirSync(walksDir).filter((f) => f.endsWith(".walk.json"));

/** A throwaway folder of files: { "path": "text" }. */
function folder(files) {
  const root = mkdtempSync(join(tmpdir(), "codezoom-dotnet-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
const sdkProject = (body = "", sdk = "Microsoft.NET.Sdk") => `<Project Sdk="${sdk}">\n${body}\n</Project>\n`;

test("TinyShop: a .NET solution; own code is every project but the tests", () => {
  assert.equal(exact.project.kind, "dotnet");
  assert.equal(exact.project.source, "sln");
  assert.deepEqual(exact.project.solutions, ["TinyShop.sln"]);
  assert.deepEqual(exact.projects.map((p) => p.assembly), ["TinyShop.App", "TinyShop.Core", "TinyShop.Storage", "TinyShop.Tests"]);
  assert.deepEqual(exact.own.assemblies.map((p) => p.assembly), ["TinyShop.App", "TinyShop.Core", "TinyShop.Storage"]);
  const s = exact.screens.meta.stats;
  assert.deepEqual([s.types, s.edges, s.references, s.libraries], [22, 71, 125, 3]);
  assert.deepEqual(exact.notes, [], "the committed list is exact: no restore note");

  // without the config, the default rules come to the same choice
  const defaults = indexProject(shop, join(tmpdir(), "codezoom-no-such-config.json"), undefined, { foreignTypes });
  assert.deepEqual(defaults.own.assemblies.map((p) => p.assembly), ["TinyShop.App", "TinyShop.Core", "TinyShop.Storage"]);
  assert.deepEqual(defaults.own.skipped, [{ assembly: "TinyShop.Tests", reason: "test project" }]);
});

test("TinyShop: SDK globs, <Compile Remove>, Directory.Build.props, top-level statements", () => {
  const core = exact.projects.find((p) => p.assembly === "TinyShop.Core");
  assert.equal(core.compile.length, 16);
  assert.ok(core.compile.every((f) => f.startsWith("src/TinyShop.Core/") && !f.includes("/Legacy/")));
  assert.equal(core.dotnet.targetFramework, "net8.0", "from Directory.Build.props");
  assert.ok(core.dotnet.globalUsings.includes("System.Linq"), "ImplicitUsings from Directory.Build.props");
  assert.ok(core.defines.includes("NET8_0_OR_GREATER"));
  assert.deepEqual(exact.projects.find((p) => p.assembly === "TinyShop.Storage").projectReferences, ["TinyShop.Core"]);
  const program = exact.graph.types.get("Program");
  assert.equal(program.parts[0].file, "src/TinyShop.App/Program.cs");
  assert.ok(edgesOf(exact, "Program").includes("TinyShop.Orders.OrderService uses"));
  assert.equal(exact.graph.types.has("TinyShop.Legacy.OldPricing"), false);
  assert.equal(exact.graph.types.has("TinyShop.Tests.PricingTests"), false);
});

test("TinyShop: primary constructor parameters are Has; a package is one node", () => {
  assert.deepEqual(edgesOf(exact, "TinyShop.Orders.OrderService").filter((e) => e.endsWith(" has")), [
    "TinyShop.Catalog.IProductCatalog has",
    "TinyShop.Orders.IOrderRepository has",
    "TinyShop.Pricing.IPricingRule has",
    "lib:Microsoft.Extensions.Logging.Abstractions has",
  ]);
  assert.ok(edgesOf(exact, "TinyShop.Storage.OrderJsonConverter").includes("lib:Newtonsoft.Json inherits"));
  assert.equal(exact.screens.meta.nodes.find((n) => n.id === "TinyShop.Storage.OrderJsonConverter").label, "JsonConverter");
  assert.equal(exact.screens.meta.nodes.find((n) => n.id === "TinyShop.Orders.UnknownProductException").label, "Exception");
  // the base library is hidden
  assert.ok(exact.screens.meta.nodes.every((n) => n.kind !== "library" || !/^(System|\.NET)/.test(n.name)));
});

for (const file of walks) {
  test(`TinyShop walk ${file} passes, restored or not`, () => {
    const walk = parseWalk(readFileSync(join(walksDir, file), "utf8"));
    for (const index of [exact, unrestored]) assert.deepEqual(runWalk(walk, index.screens).flatMap((r) => r.problems), []);
  });
}

test("TinyShop unrestored: packages by root namespace, and every answer says so", () => {
  assert.deepEqual(unrestored.dotnet, { unrestored: ["TinyShop.App", "TinyShop.Core", "TinyShop.Storage"], baseLibrary: "codezoom's list" });
  assert.equal(unrestored.notes.length, 1);
  assert.match(unrestored.notes[0], /^Not restored: TinyShop.App, TinyShop.Core, TinyShop.Storage\. .*`dotnet restore`/);
  assert.deepEqual(unrestored.screens.meta.notes, unrestored.notes, "the page shows it on every Screen");
  const q = new Query(unrestored.screens, indexNotes(unrestored));
  for (const a of [q.search("Order"), q.screen("OrderService"), q.references("OrderJsonConverter", "Newtonsoft.Json")]) assert.deepEqual(a.notes, unrestored.notes);

  // the same graph as restored, but for what only a restore can know: ServiceCollection lives in a transitive package
  const edges = (index) => [...index.graph.out].flatMap(([from, m]) => [...m.values()].map((e) => `${from} -> ${e.to} ${e.kind} ${e.refs.length}`)).sort();
  const restoredOnly = edges(exact).filter((e) => !edges(unrestored).includes(e));
  const fallbackOnly = edges(unrestored).filter((e) => !edges(exact).includes(e));
  assert.deepEqual(restoredOnly, ["Program -> lib:Microsoft.Extensions.DependencyInjection.Abstractions uses 1"]);
  assert.deepEqual(fallbackOnly, ["Program -> lib:Microsoft.Extensions.DependencyInjection uses 1"]);
  // Core sees only its own package: the Abstractions package, under the namespace it extends
  assert.ok(edgesOf(unrestored, "TinyShop.Orders.OrderService").includes("lib:Microsoft.Extensions.Logging.Abstractions has"));
});

test("test projects: IsTestProject, a test framework package, the MSTest SDK", () => {
  const root = folder({
    "A/A.csproj": sdkProject("<PropertyGroup><IsTestProject>true</IsTestProject></PropertyGroup>"),
    "B/B.csproj": sdkProject('<ItemGroup><PackageReference Include="NUnit" Version="4.2.2" /></ItemGroup>'),
    "C/C.csproj": sdkProject("", "MSTest.Sdk/3.6.1"),
    "D/D.csproj": sdkProject('<ItemGroup><PackageReference Include="Newtonsoft.Json" Version="13.0.3" /></ItemGroup>'),
    "E/E.csproj": sdkProject('<PropertyGroup><IsTestProject>false</IsTestProject></PropertyGroup><ItemGroup><PackageReference Include="xunit" Version="2.9.2" /></ItemGroup>'),
  });
  const { projects, solutions } = loadDotnetProjects(root);
  assert.deepEqual(solutions, []);
  assert.deepEqual(Object.fromEntries(projects.map((p) => [p.assembly, p.dotnet.isTest])), { A: true, B: true, C: true, D: false, E: false });
});

test("a project the solution leaves out but references is someone else's code", () => {
  const root = folder({
    "App.sln": 'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "App", "App\\App.csproj", "{11111111-1111-1111-1111-111111111111}"\nEndProject\n',
    "App/App.csproj": sdkProject('<ItemGroup><ProjectReference Include="..\\Lib\\Lib.csproj" /></ItemGroup>'),
    "App/Shop.cs": "namespace App;\npublic class Shop { private Lib.Store store = new(); }\n",
    "Lib/Lib.csproj": sdkProject(),
    "Lib/Store.cs": "namespace Lib;\npublic class Store { }\n",
  });
  const index = indexProject(root, undefined, undefined, noSdk);
  assert.deepEqual(index.own.assemblies.map((p) => p.assembly), ["App"]);
  assert.deepEqual(index.own.skipped, [{ assembly: "Lib", reason: "outside the solution" }]);
  assert.deepEqual(edgesOf(index, "App.Shop"), ["lib:Lib has"]);
});

test("setup: a project outside the solution is listed unticked, and ticking it makes it own code", async () => {
  const root = folder({
    "App.sln": 'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "App", "App\\App.csproj", "{11111111-1111-1111-1111-111111111111}"\nEndProject\n',
    "App/App.csproj": sdkProject('<ItemGroup><ProjectReference Include="..\\Lib\\Lib.csproj" /></ItemGroup>'),
    "App/Shop.cs": "namespace App;\npublic class Shop { private Lib.Store store = new(); }\n",
    "Lib/Lib.csproj": sdkProject(),
    "Lib/Store.cs": "namespace Lib;\npublic class Store { }\n",
  });
  const hints = { kind: "dotnet", outsideSolution: true };
  assert.deepEqual(verdict("Lib", ["Lib/Store.cs"], null, hints), { own: false, reason: "outside the solution", isNew: false });
  assert.equal(verdict("Lib", ["Lib/Store.cs"], { assemblies: ["App", "Lib"], excluded: [] }, hints).own, true);

  const server = spawn(process.execPath, [join(here, "../bin/codezoom.js"), "--no-open", "--no-watch", "--no-cache", "--port", "4870"], { cwd: root });
  try {
    const base = await new Promise((resolve, reject) => {
      let out = "";
      server.stdout.on("data", (d) => {
        out += d;
        const m = /open (http:\/\/[^/\s]+)/.exec(out);
        if (m) resolve(m[1]);
      });
      server.on("exit", () => reject(new Error(`server exited: ${out}`)));
    });
    const get = async (path) => (await fetch(base + path)).json();
    const nodeIds = async () => (await get("/api/meta")).nodes.map((n) => n.id).sort();

    const setup = await get("/api/setup");
    assert.deepEqual(setup.project.solutions, ["App.sln"]);
    const lib = setup.assemblies.find((a) => a.name === "Lib");
    assert.deepEqual([lib.defaultOwn, lib.defaultReason, lib.hints.outsideSolution], [false, "outside the solution", true]);
    assert.deepEqual(await nodeIds(), ["App.Shop", "lib:Lib"], "a foreign library until ticked");

    const saved = await fetch(base + "/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Codezoom": "1" },
      body: JSON.stringify({ assemblies: ["App", "Lib"], excluded: [] }),
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(await nodeIds(), ["App.Shop", "Lib.Store"], "own code once ticked");
    const screen = (await (await fetch(base + "/api/screens", { method: "POST", body: JSON.stringify(["App.Shop"]) })).json())["App.Shop"];
    assert.deepEqual(screen.dependencies.map((n) => [n.id, n.edge]), [["Lib.Store", "has"]]);
    assert.deepEqual(JSON.parse(readFileSync(join(root, "codezoom.config.json"), "utf8")).assemblies, ["App", "Lib"]);
    assert.deepEqual(indexProject(root, undefined, undefined, noSdk).own.assemblies.map((p) => p.assembly), ["App", "Lib"]);
  } finally {
    server.kill();
  }
});

test("Compile items: default globs off, an Include outside the project, bin/ and obj/ never", () => {
  const root = folder({
    "Directory.Build.props": "<Project><PropertyGroup><EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup></Project>",
    "Game/Game.csproj": sdkProject('<ItemGroup><Compile Include="Rules\\**\\*.cs" /><Compile Include="..\\Shared\\*.cs" /><Compile Remove="Rules\\Old*.cs" /></ItemGroup>'),
    "Game/Rules/Board.cs": "class Board {}",
    "Game/Rules/OldBoard.cs": "class OldBoard {}",
    "Game/Other.cs": "class Other {}",
    "Game/obj/Generated.cs": "class Generated {}",
    "Shared/Dice.cs": "class Dice {}",
  });
  const [game] = loadDotnetProjects(root).projects;
  assert.deepEqual(game.compile, ["Game/Rules/Board.cs", "Shared/Dice.cs"]);
});

test("ASP.NET Core is one node; the base library stays hidden", () => {
  const root = folder({
    "Web/Web.csproj": sdkProject("<PropertyGroup><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings></PropertyGroup>", "Microsoft.NET.Sdk.Web"),
    "Web/OrdersController.cs":
      "using Microsoft.AspNetCore.Mvc;\nnamespace Web;\n[ApiController]\npublic class OrdersController(ILogger<OrdersController> log) : ControllerBase\n{\n    private readonly List<int> ids = new();\n    public IActionResult Get() => Ok(ids);\n}\n",
  });
  const index = indexProject(root, undefined, undefined, noSdk);
  assert.deepEqual(edgesOf(index, "Web.OrdersController"), ["lib:Microsoft.AspNetCore.App inherits"]);
  assert.equal(index.screens.meta.nodes.find((n) => n.id === "lib:Microsoft.AspNetCore.App").name, "ASP.NET Core");
  assert.equal(index.screens.meta.nodes.find((n) => n.id === "Web.OrdersController").label, "ControllerBase");
  assert.deepEqual(index.notes, [], "nothing to restore");
});

test("fallback: PascalCase names only, one package per name, and only the packages a project sees", () => {
  const root = folder({
    "One/One.csproj": sdkProject('<ItemGroup><PackageReference Include="Alpha.Kit" Version="1.0.0" /><PackageReference Include="Beta.Kit" Version="1.0.0" /></ItemGroup>'),
    "One/Uses.cs":
      "using Alpha.Kit;\nusing Beta.Kit;\nnamespace One;\npublic class Uses\n{\n    private Widget both;\n    private Alpha.Kit.Gadget qualified;\n    private IAlphaLog log;\n    public void Run() => log.Write();\n}\n",
    "Two/Two.csproj": sdkProject('<ItemGroup><PackageReference Include="Gamma.Kit" Version="1.0.0" /></ItemGroup>'),
    "Two/Other.cs": "using Alpha.Kit;\nnamespace Two;\npublic class Other { private Gadget g; }\n",
  });
  const index = indexProject(root, undefined, undefined, noSdk);
  // Widget could be either package: left out; Alpha.Kit.Gadget and IAlphaLog are Alpha's (IAlphaLog is
  // ambiguous too, so only the qualified name counts); `log.Write` is a variable, not a type
  assert.deepEqual(edgesOf(index, "One.Uses"), ["lib:Alpha.Kit has"]);
  assert.equal(index.graph.out.get("One.Uses").get("lib:Alpha.Kit").refs.length, 1);
  // Two does not reference Alpha.Kit: its `using Alpha.Kit` finds nothing
  assert.deepEqual(edgesOf(index, "Two.Other"), []);
});
