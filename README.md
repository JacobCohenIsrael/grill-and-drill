# grill-and-drill

Home of **codezoom**, a tool for walking an unfamiliar Unity C# codebase one
type at a time. Pick a type and codezoom draws a UML diagram of what it uses
and what uses it. Click any neighbour to make it the centre, and step Back
along your trail.

**[Watch the 55-second demo and read the overview →](https://jacobcohenisrael.github.io/grill-and-drill/)**

## Try it

```bash
cd codezoom
npm install
npm run build
npm link

cd ../examples/TinyTowers
codezoom Tower
```

The first run in a project opens a setup page where you choose which
assemblies are your code. See [codezoom/README.md](codezoom/README.md) for
options.

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

Every v1 feature is built. The remaining v1 step is a sign-off by hand on a
real project. codezoom isn't published to npm yet.
