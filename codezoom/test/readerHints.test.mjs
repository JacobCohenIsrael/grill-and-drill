// Bypassed interfaces and Type switches (ADR 0011): References that test a
// type, the fields Unity serializes, and both rules on small made-up files.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "../dist/server/csharp/reader.js";
import { buildGraph } from "../dist/server/graph/build.js";
import { findReaderHints } from "../dist/server/graph/readerHints.js";
import { buildScreens } from "../dist/server/graph/screens.js";
import { parseWalk, runWalk } from "../dist/server/walk.js";

const unity = { key: "UnityEngine", name: "UnityEngine", hidden: false };
const foreign = [
  { full: "UnityEngine.MonoBehaviour", name: "MonoBehaviour", arity: 0, namespace: "UnityEngine", lib: unity, isInterface: false },
  { full: "UnityEngine.ScriptableObject", name: "ScriptableObject", arity: 0, namespace: "UnityEngine", lib: unity, isInterface: false },
];

/** Files as [path, text]: the graph and both Hints, named. */
function hints(...files) {
  const graph = buildGraph(
    files.map(([path, text]) => readFile(path, "A", text)),
    foreign,
  );
  const { bypasses, switches } = findReaderHints(graph);
  return {
    graph,
    bypasses: bypasses.map((b) => `${b.holder.name} > ${b.held.name} (${b.fields.map((f) => f.member).join(", ")}) via ${b.interfaces.map((i) => i.name).join(", ")}`).sort(),
    switches: switches.map((s) => `${s.type.name}.${s.member} on ${s.base.name}: ${[...new Set(s.tests.map((t) => t.target.name))].sort().join(", ")}`).sort(),
  };
}

const ENEMIES = `
using UnityEngine;
namespace G {
  public interface ITarget { }
  public interface IHurt { }
  public class Enemy : MonoBehaviour, ITarget { }
  public class Goblin : Enemy { }
  public class Bat : Enemy { }
  public class Ogre : Enemy { }
  public class Health : IHurt { }
  public struct Point : ITarget { }
}`;

test("tests: is, as, casts, patterns and switch cases are tests; new, typeof and generic arguments are not", () => {
  const facts = readFile(
    "T.cs",
    "A",
    `class T { void M(object x) {
      if (x is Goblin) {} if (x is Bat b) {} if (x is not Ogre) {} if (x is Rat { hp: 1 }) {} if (x is Cat or Dog) {}
      var a = x as Elf; var c = (Orc)x;
      switch (x) { case Imp _: break; case Gnome: break; }
      var y = x switch { Wolf w => 1, Bear => 2, _ => 0 };
      var n = new Newt(); var t = typeof(Toad); var l = (List<Lizard>)x;
    } }`,
  );
  const tests = new Set(facts.refs.filter((r) => r.test).map((r) => r.name.segs[0].name));
  const others = new Set(facts.refs.filter((r) => !r.test).map((r) => r.name.segs[0].name));
  for (const n of ["Goblin", "Bat", "Ogre", "Rat", "Cat", "Dog", "Elf", "Orc", "Imp", "Gnome", "Wolf", "Bear", "List"]) assert.ok(tests.has(n), n);
  for (const n of ["Newt", "Toad", "Lizard"]) assert.ok(others.has(n) && !tests.has(n), n);
});

test("Bypassed interface: a field or property keeping an own class that implements an own interface", () => {
  const { bypasses } = hints(
    ["E.cs", ENEMIES],
    [
      "K.cs",
      `using System.Collections.Generic;
      namespace G {
        public class Keeper {
          private Health health;                    // yes
          private static readonly List<Enemy> all;  // yes, as a generic argument
          public Goblin Leader => null;             // yes: a property
          private IHurt hurt;                       // no: the interface
          private Point point;                      // no: a struct
          void Hit(Bat bat) { var e = new Ogre(); } // no: a parameter, a creation
        }
        public class Target : ITarget { private Enemy other; } // no: it implements ITarget itself
      }`,
    ],
  );
  assert.deepEqual(bypasses, ["Keeper > Enemy (all) via ITarget", "Keeper > Goblin (Leader) via ITarget", "Keeper > Health (health) via IHurt"]);
});

test("Bypassed interface: fields Unity serializes are left out, by attribute or by its rule for public fields", () => {
  const { bypasses } = hints(
    ["E.cs", ENEMIES],
    [
      "M.cs",
      `using System; using UnityEngine;
      namespace G {
        public class Spawner : MonoBehaviour {
          [SerializeField] private Enemy prefab;     // no
          [SerializeReference] private Health hp;    // no
          public Goblin goblin;                      // no: public, in a MonoBehaviour
          public readonly Bat bat;                   // yes: readonly is never serialized
          [NonSerialized] public Ogre ogre;          // yes
          public static Enemy last;                  // yes: static
          public Health Exposed => hp;               // yes: a property
        }
        public class Wave : ScriptableObject { public Enemy first; } // no
        public class Plain { public Enemy first; }                   // yes: not a Unity object
        public class Deeper : Spawner { public Enemy boss; }         // no: a MonoBehaviour through its base
      }`,
    ],
  );
  assert.deepEqual(bypasses, [
    "Plain > Enemy (first) via ITarget",
    "Spawner > Bat (bat) via ITarget",
    "Spawner > Enemy (last) via ITarget",
    "Spawner > Health (Exposed) via IHurt",
    "Spawner > Ogre (ogre) via ITarget",
  ]);
});

test("Bypassed interface: interfaces through a base class and through interface inheritance; none from a generated file", () => {
  const { bypasses } = hints(
    [
      "I.cs",
      `namespace G {
        public interface IA { } public interface IB : IA { }
        public class Base : IB { } public class Leaf : Base { }
        public class Holder { Leaf leaf; }
        public class HalfHolder : IA { Leaf leaf; }
      }`,
    ],
    ["Gen.g.cs", `// <auto-generated/>\nnamespace G { public class Made { Leaf leaf; } }`],
  );
  assert.deepEqual(bypasses, ["HalfHolder > Leaf (leaf) via IB", "Holder > Leaf (leaf) via IA, IB"]);
});

test("Type switch: two or more own subtypes of one own base in one member", () => {
  const { switches } = hints(
    ["E.cs", ENEMIES],
    [
      "S.cs",
      `namespace G {
        public class Rules {
          float SlowFor(ITarget t) { switch (t) { case Bat _: return 0; case Ogre _: return 1; default: return 2; } }
          int Bounty(Enemy e) => e switch { Goblin g => 1, Bat => 2, _ => 0 };
          void Older(Enemy e) { var g = e as Goblin; if (g == null) { var o = (Ogre)e; } }
          bool One(Enemy e) => e is Bat;                       // no: one subtype
          bool Unrelated(object o) => o is Health || o is Bat; // no: no shared own base
          bool Above(Enemy e) => e is Enemy || e is Goblin;    // yes, on ITarget: Enemy is no subtype of itself, but of ITarget
          void Kinds() { var a = typeof(Bat); var b = typeof(Ogre); } // no: typeof is not a test
        }
        public class Split { bool A(Enemy e) => e is Bat; bool B(Enemy e) => e is Ogre; } // no: two members
      }`,
    ],
  );
  // Enemy, not ITarget: of two bases with as many tested subtypes, the more specific
  assert.deepEqual(switches, [
    "Rules.Above() on ITarget: Enemy, Goblin",
    "Rules.Bounty() on Enemy: Bat, Goblin",
    "Rules.Older() on Enemy: Goblin, Ogre",
    "Rules.SlowFor() on Enemy: Bat, Ogre",
  ]);
});

test("Screens: both Hints on their edge, either way; the Focus counts its own and tags its members", () => {
  const files = [
    ["E.cs", ENEMIES],
    ["K.cs", `namespace G { public class Keeper { public Health health; public float SlowFor(ITarget t) => t is Bat ? 0 : t is Ogre ? 1 : 2; } }`],
  ].map(([path, text]) => readFile(path, "A", text));
  const screens = buildScreens(buildGraph(files, foreign), "p", {});
  const screen = (id) => JSON.parse(screens.json.get(id));
  const keeper = screen("G.Keeper");
  assert.equal(keeper.focus.bypassedInterfaces.length, 1);
  assert.deepEqual(keeper.focus.bypassedInterfaces[0].interfaces, ["G.IHurt"]);
  assert.equal(keeper.focus.typeSwitches.length, 1);
  assert.equal(keeper.focus.typeSwitches[0].base, "G.Enemy");
  const member = (name) => [...keeper.focus.attributes, ...keeper.focus.operations].find((m) => m.text.startsWith(name));
  assert.deepEqual(member("health").bypassed, [0]);
  assert.deepEqual(member("SlowFor").typeSwitches, [0]);
  const kinds = (row, id) => (row.find((n) => n.id === id).hints ?? []).map((h) => h.kind);
  assert.deepEqual(kinds(keeper.dependencies, "G.Health"), ["bypassed-interface"]);
  assert.deepEqual(kinds(keeper.dependencies, "G.Bat"), ["type-switch"]);
  assert.deepEqual(kinds(keeper.dependencies, "G.ITarget"), []);
  // the other end of each edge
  assert.deepEqual(kinds(screen("G.Health").dependents, "G.Keeper"), ["bypassed-interface"]);
  assert.deepEqual(kinds(screen("G.Ogre").dependents, "G.Keeper"), ["type-switch"]);
  assert.equal(screen("G.Health").focus.bypassedInterfaces, undefined, "the held class counts none of its own");
  assert.equal(screens.meta.bypassedInterfaces.length, 1);
  assert.equal(screens.meta.typeSwitches.length, 1);

  // walks check both only where they state them
  const walk = (expect) => runWalk(parseWalk(JSON.stringify({ start: "G.Keeper", steps: [], expect })), screens).flatMap((r) => r.problems);
  assert.deepEqual(walk({ bypassedInterfaces: 1, typeSwitches: 1, dependencies: [{ name: "Health", bypassedInterface: true, typeSwitch: false }, { name: "Bat", typeSwitch: true }] }), []);
  assert.deepEqual(walk({ bypassedInterfaces: 0, dependencies: [{ name: "ITarget", bypassedInterface: true }] }), [
    "Keeper has 1 Bypassed interface, expected 0",
    "Dependencies: ITarget's edge is not a Bypassed interface, expected one",
  ]);
  const parse = (expect) => () => parseWalk(JSON.stringify({ start: "A", steps: [], expect }));
  assert.throws(parse({ typeSwitches: -1 }), /typeSwitches must be a count/);
  assert.throws(parse({ dependents: [{ name: "B", bypassedInterface: "yes" }] }), /bypassedInterface must be true or false/);
});
