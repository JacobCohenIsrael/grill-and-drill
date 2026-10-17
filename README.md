# grill-and-drill

Home of **codezoom**, a tool for walking an unfamiliar Unity C# codebase one
type at a time. Pick a type and codezoom draws a UML diagram of what it uses
and what uses it. Click any neighbour to make it the centre, and step Back
along your trail.

**[Watch the 55-second demo and read the overview →](https://jacobcohenisrael.github.io/grill-and-drill/)**

## Try it

From the root of a Unity project (needs Node.js 22.23 or newer):

```bash
npx codezoom
```

The first run opens a setup page where you choose which assemblies are your
code. To try it on the demo project in this repo:

```bash
cd examples/TinyTowers
npx codezoom Tower
```

See [codezoom/README.md](codezoom/README.md) for options and for building
from source.

## What's here

| Path | What it is |
|---|---|
| [codezoom/](codezoom/) | The tool: a Node/TypeScript indexer with a Svelte page in the browser |
| [examples/TinyTowers/](examples/TinyTowers/) | A small made-up Unity project for demos |
| [GLOSSARY.md](GLOSSARY.md) | The project's terms: Focus, Drill, Back, Jump, Weight, … |
| [docs/adr/](docs/adr/) | Decisions that would be hard to undo, and why |
| [docs/research.md](docs/research.md) | The starting research on Uncle Bob's uml-viewer, crapper, dryer and mutator |
| [docs/](docs/) | The overview page, served with GitHub Pages |

## Status

codezoom 1.0.0 is [on npm](https://www.npmjs.com/package/codezoom). The last
v1 step is a sign-off by hand: golden walks through a large real project.

## Credits

**Inspiration.** codezoom started from
[LIVE: Uncle Bob on Software Fundamentals in the Age of AI](https://www.youtube.com/watch?v=zcLPGC-tvgk&t=127s),
a livestream on Matt Pocock's channel.

**Robert C. Martin (Uncle Bob).** His
[uml-viewer](https://github.com/unclebob/uml-viewer) is the idea codezoom grew
from: a UML diagram you click through down to the source.
[crapper](https://github.com/unclebob/crapper),
[dryer](https://github.com/unclebob/dryer) and
[mutator](https://github.com/unclebob/mutator) shaped how it reads code.
codezoom shares no code with them; [docs/research.md](docs/research.md) and the
[overview page](https://jacobcohenisrael.github.io/grill-and-drill/#lineage)
explain what it borrowed.

**Matt Pocock.** codezoom was designed with his
[grill-with-docs](https://github.com/mattpocock/skills) skills, which produced
[GLOSSARY.md](GLOSSARY.md) and the decision records in [docs/adr/](docs/adr/).
The copies in `.claude/skills/` are MIT-licensed; their license is kept beside
them.
