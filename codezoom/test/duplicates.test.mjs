// Duplicates (ADR 0009): member bodies with the same shape once names and
// literals are ignored, 50 syntax nodes or more, generated files left out.
// Shapes from the reader, groups and Screens on small made-up files, and the
// cache that keeps shapes between runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import v8 from "node:v8";
import { readFile } from "../dist/server/csharp/reader.js";
import { MIN_SHAPE_NODES } from "../dist/server/csharp/shape.js";
import { buildGraph } from "../dist/server/graph/build.js";
import { findDuplicates } from "../dist/server/graph/duplicates.js";
import { buildScreens } from "../dist/server/graph/screens.js";
import { IndexCache } from "../dist/server/cache.js";
import { indexProject } from "../dist/server/indexer.js";
import { fromForeignList } from "../dist/server/dotnet/foreignList.js";

const here = dirname(fileURLToPath(import.meta.url));

/** The members of a one-file read, by name: their shapes. */
function shapes(text, path = "A.cs") {
  const facts = readFile(path, "A", text);
  const out = {};
  for (const t of facts.types) for (const m of t.members) out[`${t.name}.${m.name}`] = m.shapes;
  return { facts, out };
}
const hashOf = (s, key) => s.out[key]?.[0]?.hash;

/** A body of about 60 nodes: a loop, a call, a lambda, literals. */
const SUM = (names) => `
    {
        var ${names.total} = 0;
        for (var ${names.i} = 0; ${names.i} < ${names.items}.Length; ${names.i}++)
        {
            if (${names.items}[${names.i}] == null) continue;
            ${names.total} += ${names.items}[${names.i}].Count(${names.x} => ${names.x} > ${names.limit}) * ${names.factor};
        }
        Log("${names.message}", ${names.total});
        return ${names.total};
    }`;
const plain = { total: "total", i: "i", items: "items", x: "x", limit: 0, factor: 2, message: "summed" };

test("shapes: renamed names and changed literals still match", () => {
  const renamed = { total: "sum", i: "k", items: "rows", x: "row", limit: 10, factor: 3, message: "other words" };
  const s = shapes(`class A { int Sum(int[][] items) ${SUM(plain)} } class B { int Count(Row[] rows) ${SUM(renamed)} }`);
  assert.ok(s.out["A.Sum"][0].nodes >= MIN_SHAPE_NODES);
  assert.equal(hashOf(s, "A.Sum"), hashOf(s, "B.Count"));
  assert.equal(s.out["A.Sum"][0].nodes, s.out["B.Count"][0].nodes);
});

test("shapes: a changed operator, keyword or structure does not match", () => {
  const base = `class A { int Sum(int[][] items) ${SUM(plain)} }`;
  const changed = [
    base.replace("total += ", "total -= "), // operator
    base.replace("continue;", "break;"), // keyword
    base.replace("var total = 0;", "int total = 0;"), // var is a keyword, so is int
    base.replace("x > 0", "x >= 0"), // inside the lambda: it folds into its member
    base.replace("return total;", "return (total);"), // structure
  ];
  const hash = hashOf(shapes(base), "A.Sum");
  for (const text of changed) assert.notEqual(hashOf(shapes(text), "A.Sum"), hash, text);
});

test("shapes: 49 syntax nodes don't count, 50 do", () => {
  // the block, then eight statements of six nodes each: 49; a parenthesis makes 50
  const under = "x = a + b; ".repeat(8);
  const at = "x = a + b; ".repeat(7) + "x = (a + b);";
  const s = shapes(`class A { int x; void Under(int a, int b) { ${under} } void At(int a, int b) { ${at} } }
    class B { int x; void Under(int a, int b) { ${under} } void At(int a, int b) { ${at} } }`);
  assert.equal(s.out["A.Under"], undefined);
  assert.equal(s.out["A.At"][0].nodes, 50);
  const groups = findDuplicates(buildGraph([s.facts], []).types.values());
  assert.deepEqual(
    groups.map((g) => g.map((b) => `${b.type}.${b.member}`)),
    [["A.At()", "B.At()"]],
  );
});

test("shapes: lambdas and local functions fold into their member; accessors and => bodies are units", () => {
  const s = shapes(`class A {
    int Total { get ${SUM(plain)} set { } }
    int Expr => new[] { 1, 2, 3 }.Select(x => x * 2).Where(x => x > 2).Select(x => x + 1).Where(x => x < 9).Sum(x => x * x) + Helper(1, 2, 3);
    void Outer() { int Inner(int[][] items) ${SUM(plain)} Inner(null); }
  }`);
  assert.deepEqual(
    s.out["A.Total"].map((x) => x.accessor),
    ["get"],
    "the getter is a unit, the empty setter is too small",
  );
  assert.equal(s.out["A.Expr"].length, 1);
  assert.equal(s.out["A.Expr"][0].accessor, undefined);
  assert.equal(s.out["A.Outer"].length, 1, "the local function is part of Outer, not a unit of its own");
  assert.ok(s.out["A.Outer"][0].nodes > s.out["A.Total"][0].nodes);
});

test("shapes: top-level statements are one body, as if written in Main's block", () => {
  const statements = SUM(plain).trim().slice(1, -1).replace("return total;", "System.Console.WriteLine(total);");
  const top = readFile("Program.cs", "App", `var items = new int[0][];\n${statements}`);
  const main = top.types.find((t) => t.name === "Program").members.find((m) => m.name === "Main");
  assert.equal(main.shapes.length, 1);
  const old = readFile("Old.cs", "App", `static class Old { static void Main() { var items = new int[0][];\n${statements} } }`);
  assert.equal(old.types[0].members[0].shapes[0].hash, main.shapes[0].hash);
});

test("generated files: an auto-generated header or [GeneratedCode] leaves the whole file out", () => {
  const body = `class A { int Sum(int[][] items) ${SUM(plain)} } class B { int Sum(int[][] items) ${SUM(plain)} }`;
  const header = shapes(`// <auto-generated>\n//   by a tool\n// </auto-generated>\n${body}`);
  assert.equal(header.facts.generated, true);
  assert.deepEqual(Object.values(header.out), [undefined, undefined]);
  assert.equal(header.facts.types.length, 2, "its types stay in the graph");

  const attribute = shapes(`using System.CodeDom.Compiler;\n${body}\n[GeneratedCode("exporter", "1.0")] partial class C { }`);
  assert.equal(attribute.facts.generated, true);
  assert.equal(attribute.out["A.Sum"], undefined, "another type in the file is left out too");
  const qualified = shapes(`${body}\n[global::System.CodeDom.Compiler.GeneratedCodeAttribute("x", "1")] class C { }`);
  assert.equal(qualified.facts.generated, true);

  // a marker after the first line of code is not a header
  const late = shapes(`${body}\n// <auto-generated/>\n`);
  assert.equal(late.facts.generated, undefined);
  assert.equal(late.out["A.Sum"].length, 1);
});

test("generated files: only the comments before the first line of code are the header", () => {
  const body = `class A { int Sum(int[][] items) ${SUM(plain)} } class B { int Sum(int[][] items) ${SUM(plain)} }`;
  // a doc comment that says "do not edit" is not a header (a real case in 2d-space-survival)
  const doc = shapes(`using System;\n/// <summary>Authored by a tool; do not edit ranges by hand.</summary>\n${body}`);
  assert.equal(doc.facts.generated, undefined);
  assert.equal(doc.out["A.Sum"].length, 1);
  // directives, blank lines, block comments and a byte-order mark may come first
  for (const head of [
    "﻿// <auto-generated/>\n",
    "#pragma warning disable\n\n// <auto-generated>\n// </auto-generated>\n",
    "/*\n * This file was generated by a tool.\n */\n",
    "// Copyright 2026\n//\n// Changes to this file may cause incorrect behavior.\n",
  ]) {
    assert.equal(shapes(`${head}${body}`).facts.generated, true, JSON.stringify(head));
  }
  assert.equal(shapes(`// Copyright 2026\nusing System; // do not edit\n${body}`).facts.generated, undefined);
});

/** Three types: B uses A and repeats A.M; C repeats A.N and A.M, with no edge to A. */
function threeTypes() {
  const big = (op) => SUM(plain).replace("total += ", `total ${op}= `);
  const files = [
    readFile("A.cs", "P", `namespace P { public class A { public int M(int[][] items) ${big("+")} int N(int[][] items) ${big("-")} } }`),
    readFile("B.cs", "P", `namespace P { public class B { A a; int M(int[][] items) ${big("+")} } }`),
    readFile("C.cs", "P", `namespace P { public class C { int N(int[][] items) ${big("-")} int M2(int[][] items) ${big("+")} } }`),
  ];
  return buildScreens(buildGraph(files, []), "p", {});
}

test("Screens: the Focus lists its Duplicates; a neighbour is marked only when it holds one of the Focus's", () => {
  const screens = threeTypes();
  // the bigger group first: same size here, so the one with more members
  assert.deepEqual(
    screens.meta.duplicates.map((g) => g.members.map((m) => `${m.id}.${m.member} ${screens.meta.files[m.file]}:${m.line}`)),
    [
      ["P.A.M() A.cs:1", "P.B.M() B.cs:1", "P.C.M2() C.cs:11"],
      ["P.A.N() A.cs:11", "P.C.N() C.cs:1"],
    ],
  );
  const a = JSON.parse(screens.json.get("P.A"));
  assert.deepEqual(
    a.focus.duplicates.map((d) => `${d.member} group ${d.group}: ${d.duplicates.map((o) => `${o.id}.${o.member}`).join(", ")}`),
    ["M() group 1: P.B.M(), P.C.M2()", "N() group 2: P.C.N()"],
  );
  // M is public and listed, with its tag; N is private and only counted
  assert.deepEqual(a.focus.operations.map((m) => [m.text, m.duplicates]), [["M(int[][]): int", [0]]]);
  assert.deepEqual(a.dependents.map((n) => [n.id, n.hints]), [
    ["P.B", [{ kind: "duplicate", of: "M()", nodes: a.focus.duplicates[0].nodes, member: "M()", file: screens.meta.files.indexOf("B.cs"), line: 1 }]],
  ]);
  const b = JSON.parse(screens.json.get("P.B"));
  assert.deepEqual(b.dependencies[0].hints.map((h) => `${h.of} = ${h.member}`), ["M() = M()"]);
  const c = JSON.parse(screens.json.get("P.C"));
  assert.equal(c.focus.duplicates.length, 2);
  assert.deepEqual([...c.dependents, ...c.dependencies], [], "C meets A and B on no Screen");
});

const project = join(here, "../../examples/TinyTowers");
const foreignTypes = fromForeignList(JSON.parse(readFileSync(join(here, "fixtures/tinytowers-foreign-types.json"), "utf8")));
const groupNames = (index) => {
  const name = new Map(index.screens.meta.nodes.map((n) => [n.id, n.name]));
  return index.screens.meta.duplicates.map((g) => `${g.nodes}: ${g.members.map((m) => `${name.get(m.id)}.${m.member}`).join(", ")}`);
};
const TINYTOWERS_GROUPS = [
  "67: CannonTower.StaggerNear(), FrostTower.ChillNear()",
  "60: WaveSpawner.DelayFrom(), WaveSpawner.EnemiesFrom()",
  "56: TowerShop.PriceLabel(), TowerShopPanel.LabelFor()",
];

test("cache: shapes are kept with each file, so a warm start finds the same Duplicates reading no source", async () => {
  const dir = mkdtempSync(join(tmpdir(), "codezoom-dup-cache-"));
  const first = IndexCache.load(dir);
  const cold = indexProject(project, undefined, first, { foreignTypes });
  assert.deepEqual(groupNames(cold), TINYTOWERS_GROUPS);
  await first.save();
  const second = IndexCache.load(dir);
  const warm = indexProject(project, undefined, second, { foreignTypes });
  assert.deepEqual(second.changed, []);
  assert.deepEqual(groupNames(warm), TINYTOWERS_GROUPS);
});

test("cache: a cache from before shapes (schema 3) is read again, not trusted", async () => {
  const dir = mkdtempSync(join(tmpdir(), "codezoom-dup-schema-"));
  const cache = IndexCache.load(dir);
  indexProject(project, undefined, cache, { foreignTypes });
  await cache.save();
  // what 1.3.0 left: the same entries, without shapes
  const file = join(dir, "index-cache.bin");
  const stored = v8.deserialize(readFileSync(file));
  for (const e of stored.files.values()) for (const t of e.facts?.types ?? []) for (const m of t.members) delete m.shapes;
  const rewrite = (schema) => writeFileSync(file, v8.serialize({ ...stored, schema }));

  rewrite(3);
  const old = IndexCache.load(dir);
  const upgraded = indexProject(project, undefined, old, { foreignTypes });
  assert.ok(old.changed.filter((p) => p.endsWith(".cs")).length >= 40, "every source file is read again");
  assert.deepEqual(groupNames(upgraded), TINYTOWERS_GROUPS);

  // 1.4.0's cache (schema 4) is read again too: it may hold a doc comment's false "generated" mark
  rewrite(4);
  const from140 = IndexCache.load(dir);
  indexProject(project, undefined, from140, { foreignTypes });
  assert.ok(from140.changed.filter((p) => p.endsWith(".cs")).length >= 40);

  // the same entries under the current schema would be trusted: that is why the schema went up
  rewrite(stored.schema);
  const trusted = IndexCache.load(dir);
  const stale = indexProject(project, undefined, trusted, { foreignTypes });
  assert.deepEqual(trusted.changed.filter((p) => p.endsWith(".cs")), []);
  assert.deepEqual(groupNames(stale), []);
});
