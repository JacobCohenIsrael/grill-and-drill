# codezoom (first slice)

Indexes a Unity C# project and shows, in the browser, a UML diagram centred
on one type: the **Focus**, with its **Dependents** above and its
**Dependencies** below. Click a node to **Drill** to it (the view dives into
the box until it is the new Focus), click the previous Focus (marked ↩),
press Backspace or use the browser's Back button to go **Back** (the same
dive in reverse), and type in the search box to **Jump** (a cut). The top
bar shows how long the last move took to start drawing, and the zoom's
frame rate. Boxes are sized by Weight (√ of References × members they sit
in): large, medium or small against the heaviest own-code box in the row,
large first; hovering a box shows its Weight. The thresholds are constants
in `src/shared/weight.ts`, the drawn sizes and edge widths in
`web/src/layout.ts`. Click the Focus box for its source (read-only, one tab per
partial file); hovering a neighbour marks its References in that file, and
**Open in Rider** (or a line number) opens the file there. Esc closes it. The search box and the
filter on each row match substrings or word starts: `CA`, `CampAp` and
`plica` all find `CampaignApplication`. Terms are defined in
[../GLOSSARY.md](../GLOSSARY.md); decisions are in [../docs/adr](../docs/adr).

## Install from this repo

```bash
cd codezoom
npm install
npm run build
npm link
```

## Run

From a Unity project root (the folder with the generated `.csproj` files):

```bash
codezoom HullBehaviour
```

It indexes own code, starts a server on `127.0.0.1:4777` (or the next free
port) and opens the default browser at that Focus. With no name, or a name
that matches several nodes, it opens the search page instead. Options:
`--port N`, `--no-open`, `--config FILE` (use a config kept outside the
project), `--report` (lists names it could not resolve).

What each file gave is cached in `.codezoom/` at the project root (it
holds its own `.gitignore`, so git ignores it without touching yours), so a
relaunch re-reads only changed files: a large project serves in 0.8 s warm
against 2.8 s cold. While codezoom is open it watches `Assets/`,
`Packages/` and the `.csproj` files; on a change it re-indexes and the page
shows a notice instead of reshuffling the screen you are on. Options:
`--cache-dir DIR`, `--no-cache`, `--no-watch`. That cache is the only thing
codezoom writes into the project.

## Own code

Own code is chosen by assembly, from the `.csproj` files Unity generates for
Rider. Without a config file the defaults are: every assembly with files
under `Assets/`, minus test assemblies and vendor folders (`Plugins`,
`ThirdParty` at any depth; `TextMesh Pro`, `Photon`, … right under
`Assets/`). Third-party code in other folders needs the config. Editor and generated code are
included. `Library`, `Temp`, `obj`, `.git` and `.claude/worktrees` are never
read. To change it, write `codezoom.config.json` at the project root by hand:

```json
{
  "assemblies": ["MyGame.Core", "MyGame.Runtime", "MyGame.Editor"],
  "excludeFolders": ["Assets/MyGame/Generated/Legacy"],
  "includeFolders": ["Assets/Plugins/MyOwnPlugin"]
}
```

## How it reads C#

- tree-sitter-c-sharp (native binding) plus our own name resolution:
  namespaces, `using` directives, `using X =` aliases, nested types, type
  parameters. Partial types merge; a generic type is one node; both sides
  of every `#if` are read.
- Foreign libraries are found by reading the type tables of the DLLs the
  `.csproj` files reference (`src/dotnet/metadata.ts`). Each Unity package
  is one node; UnityEngine and UnityEditor modules are one node each; the
  .NET base library is hidden. When the project's Unity version is not
  installed, the same DLLs are read from an installed editor.
- When reading both sides of an `#if` at once does not parse (an `#if`
  splits a declaration), the file is read in two configurations instead:
  the assembly's own defines, and those with the file's symbols flipped.
- Names in code bodies (`Foo.Bar()`, `x is Foo`) count only when no local,
  parameter or member of that name hides them. The type of a `var` local
  and extension-method calls are missed (ADR 0003).

## Layout

- `src/` server side: `unity/` (csproj, own code, packages), `dotnet/`
  (DLL type tables), `csharp/` (reader, resolver), `graph/` (edges, screens),
  `server.ts`, `cli.ts`. `src/shared/` is used by both sides.
- `web/` the page: Svelte 5, drawn in SVG. Screens are computed at index
  time and preloaded for every neighbour (ADR 0004).
- `npm run check` type-checks both sides.
