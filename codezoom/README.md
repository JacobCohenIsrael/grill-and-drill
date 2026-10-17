# codezoom

Walk the architecture of a Unity C# project one type at a time. codezoom
indexes your scripts and opens a page in your browser with a UML view
centred on one type, the **Focus**: the types that depend on it
(**Dependents**) above, the types it depends on (**Dependencies**) below.
Click a box to **Drill** into it, go **Back** along your **Trail**, or
**Jump** anywhere by name.

Overview, demo and design notes: <https://jacobcohenisrael.github.io/grill-and-drill/>

## Install and run

From the root of a Unity project (the folder with `Assets/`):

```bash
npx codezoom
```

or install it once and name a type to start from:

```bash
npm install -g codezoom
codezoom PlayerController
```

It indexes your own code, serves the page on `127.0.0.1` (port 4777, or the
next free one) and opens your browser. Nothing leaves your machine.

Requirements: Node.js 22.23 or newer (older versions crash inside
tree-sitter's native binding). v1 is made for macOS ("Open in
Rider" and the browser launch are macOS-first; elsewhere, open the printed
address yourself). Exact results come from the `.csproj` files Unity writes
when Rider or Visual Studio is its external editor; without them (a fresh
clone) codezoom reads `.asmdef` files and Unity's folder rules instead.

npm 11 may warn that the install scripts of `tree-sitter` and
`tree-sitter-c-sharp` were not run. Nothing is missing: those scripts only
compile from source when no prebuilt binary fits, and both packages ship
prebuilt binaries for macOS, Linux and Windows (x64 and arm64).

## The first run: what is your code

The first run in a project opens the **setup page**. It shows the Unity
version and every assembly, grouped by its top folder under `Assets/` or
`Packages/` (biggest first), each with its file count and the namespace
roots its files declare, so a vendor SDK stands out next to your own code.
Pre-ticks follow the default rules: assemblies with files under `Assets/`,
minus test assemblies; vendor folders (`Plugins`, `ThirdParty` at any
depth; `TextMesh Pro`, `Photon` and the like right under `Assets/`) stay
out. One click ticks or unticks a whole folder group; opening an assembly
shows its folders, so a vendor folder inside your own assembly can be left
out. **Save and index** writes `codezoom.config.json`:

```json
{
  "assemblies": ["MyGame.Core", "MyGame.Runtime", "MyGame.Editor"],
  "excluded": ["Assembly-CSharp-firstpass", "MyGame.Tests", "SomeVendorSDK"],
  "excludeFolders": ["Assets/SomeVendorSDK"],
  "includeFolders": ["Assets/Plugins/MyOwnPlugin"]
}
```

Commit it: it is how your team shares the choice. An assembly in neither
list is new; it follows the default rules and the top bar offers "N new
assemblies: review". For folders, the most specific rule wins. Reopen the
page any time with `codezoom setup` or the **Setup** link.

## Moving around

- **Drill**: click a box. The view dives into it until it is the new Focus.
- **Back**: click the previous Focus (marked ↩), press Backspace, or use the
  browser's Back button. Every Focus has its own address.
- **Jump**: type in the search box (`/`). It matches substrings and word
  starts: `CA`, `CampAp` and `plica` all find `CampaignApplication`.
- Boxes are sized by **Weight**, how heavily one end leans on the other (√ of
  References × the members they sit in): large, medium or small within the
  row, large first. Foreign libraries (UnityEngine, each package) are one
  box each; .NET is hidden.
- Edges are drawn the UML way: Inherits and Implements with a hollow
  triangle, Has and Uses with an open arrow, dashed for Implements and Uses.
- Hover a box for the **References** behind its edge (member and file:line).
  Each row has a filter.
- Click the Focus for its source (one tab per partial file); **Open in
  Rider** or a line number opens the file there. Esc closes it.

## Golden walks

A golden walk is a written-down sequence of moves through a project you
know, with the neighbours each screen must (and must not) show. Keep them
next to the project and replay them after changes:

```bash
codezoom walk walks/*.walk.json
```

```json
{
  "name": "Towers and their config",
  "start": "TinyTowers.Towers.Tower",
  "expect": {
    "dependents": ["BuildGrid", { "name": "TowerConfig", "cycle": true }],
    "dependencies": [
      { "name": "ITargetable", "edge": "has", "size": "large" },
      { "name": "UnityEngine", "size": "small" }
    ],
    "absent": { "dependencies": ["WaveSpawner"] }
  },
  "steps": [
    { "drill": "TowerConfig", "expect": { "focus": "TowerConfig" } },
    { "back": true, "expect": { "focus": "Tower" } },
    { "jump": "WSp", "expect": { "focus": "WaveSpawner" } }
  ]
}
```

- `start` names the first Focus the way the command line does (one node).
- A step is `drill` (a neighbour on the current screen), `back`, or `jump`
  (the first search result), each with an optional `expect` for the screen
  it lands on.
- Listed neighbours must be in that row; `absent` ones must not. Edge kind
  (`inherits`, `implements`, `has`, `uses`), `size` (`small`, `medium`,
  `large`) and `cycle` are checked only where given. Anything unlisted is
  allowed. Names match a node's full name, shown name or simple name.
- It prints a line per screen with what differs, and exits 0 when every
  screen is as expected, 1 when one differs, 2 when a walk can't be read.

## Commands and options

| | |
|---|---|
| `codezoom [Type]` | Index and open the page at `Type` (or the start page). |
| `codezoom setup` | Open the setup page. |
| `codezoom walk FILE...` | Replay golden walks; no server. |
| `--port N` | First port to try (default 4777). |
| `--config FILE` | Use a config kept outside the project. |
| `--cache-dir DIR`, `--no-cache` | Where the index cache lives, or none. |
| `--no-watch` | Don't watch files while open. |
| `--no-open` | Don't start a browser; print the address. |
| `--report` | Also list names that could not be resolved. |
| `--foreign-types FILE` | Read foreign type names from a list instead of Unity's DLLs (tests). |

**Cache and watching.** What each file gave is cached in `.codezoom/` at the
project root (it holds its own `.gitignore`), so a relaunch re-reads only
changed files. While open, codezoom watches `Assets/`, `Packages/` and the
`.csproj` files; after a change the page shows a notice instead of
reshuffling the screen you are on. The cache and the config you save are
the only files codezoom writes into a project.

## How it reads C#

- tree-sitter-c-sharp plus its own name resolution: namespaces, `using`
  directives and aliases, nested types, type parameters. Partial types
  merge; a generic type is one node; both sides of every `#if` are read
  (a file whose `#if` splits a declaration is read once per configuration).
- Foreign libraries come from the type tables of the DLLs your `.csproj`
  files reference. When the project's Unity version isn't installed, the
  same DLLs are read from an installed editor.
- Not seen: the type of a `var` local, extension-method calls, and wiring
  done only in scenes, prefabs or ScriptableObject assets.

## Developing

```bash
git clone https://github.com/JacobCohenIsrael/grill-and-drill.git
cd grill-and-drill/codezoom
npm install
npm run build
npm link        # puts codezoom on your PATH
npm test        # TinyTowers golden walks and unit tests, no Unity needed
```

The tests index `examples/TinyTowers` with a committed list of the
UnityEngine types it uses (`test/fixtures`), so they pass with or without
Unity. After changing the example, refresh the list from an installed
editor: `node scripts/extract-foreign-types.mjs ../examples/TinyTowers
test/fixtures/tinytowers-foreign-types.json`. Design terms are in
[GLOSSARY.md](https://github.com/JacobCohenIsrael/grill-and-drill/blob/main/GLOSSARY.md),
decisions in [docs/adr](https://github.com/JacobCohenIsrael/grill-and-drill/tree/main/docs/adr).

## License

MIT

## Credits

Inspired by [LIVE: Uncle Bob on Software Fundamentals in the Age of AI](https://www.youtube.com/watch?v=zcLPGC-tvgk&t=127s)
on Matt Pocock's channel. The idea grew from Robert C. Martin's
[uml-viewer](https://github.com/unclebob/uml-viewer), and codezoom was
designed with Matt Pocock's [grill-with-docs](https://github.com/mattpocock/skills)
skills.
