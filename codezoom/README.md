# codezoom (first slice)

Indexes a Unity C# project and shows, in the browser, a UML diagram centred
on one type: the **Focus**, with its **Dependents** above and its
**Dependencies** below. Click a node to **Drill** to it, click the previous
Focus (marked ↩), press Backspace or use the browser's Back button to go
**Back**, and type in the search box to **Jump**. The search box and the
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
`--port N`, `--no-open`, `--report` (lists names it could not resolve).

Every launch re-indexes from scratch; nothing is written into the project.

## Own code

Own code is chosen by assembly, from the `.csproj` files Unity generates for
Rider. Without a config file the defaults are: every assembly with files
under `Assets/`, minus test assemblies and vendor folders (`Plugins`,
`ThirdParty`, `TextMesh Pro`, `Photon`, …). Editor and generated code are
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
  .NET base library is hidden.
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
