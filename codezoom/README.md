# codezoom

Walk the architecture of a C# codebase (a Unity project or a .NET solution)
one type at a time. codezoom indexes your code and opens a page in your
browser with a UML view centred on one type, the **Focus**: the types that
depend on it (**Dependents**) above, the types it depends on
(**Dependencies**) below. Click a box to **Drill** into it, go **Back**
along your **Trail**, or **Jump** anywhere by name. Coding agents can ask
the same questions through MCP.

New in 1.1.0: agent access ([MCP and `--json`](#for-coding-agents)) and
[plain .NET C# projects](#plain-net).

Overview, demo and design notes: <https://jacobcohenisrael.github.io/grill-and-drill/>

## Install and run

From the root of a Unity project (the folder with `Assets/`) or a .NET
solution (the folder with the `.sln`):

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
address yourself). In a Unity project, exact results come from the
`.csproj` files Unity writes when Rider or Visual Studio is its external
editor; without them (a fresh clone) codezoom reads `.asmdef` files and
Unity's folder rules instead. In a .NET solution, exact packages come from
`dotnet restore` (see [Plain .NET](#plain-net)); no .NET SDK is needed to run
codezoom.

On a clean install npm 11 may print `npm warn install-scripts 2 packages have
install scripts not yet covered by allowScripts`, naming `tree-sitter` and
`tree-sitter-c-sharp`. That is expected and harmless: both ship prebuilt
binaries for macOS, Linux and Windows (x64 and arm64), and codezoom loads
those, so there is no need to allow the scripts.

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

In a .NET solution the same page lists projects instead, grouped by the
folder they sit in (`src/`, `tests/`). Every project in the `.sln` starts
ticked except test projects, and the config lists them under the same keys.

## Plain .NET

codezoom reads SDK-style projects the way the .NET SDK does:

- **Projects.** It reads every project in the `.sln` or `.slnx` files at the
  root, or every `.csproj` under the folder when there is no solution. A
  project they reference but don't list is read as someone else's code.
- **Own code.** Every project except test projects: those with
  `IsTestProject`, a reference to xUnit, NUnit, MSTest or
  `Microsoft.NET.Test.Sdk`, or the MSTest SDK.
- **Sources.** The SDK's default `**/*.cs` minus `bin/` and `obj/`, changed
  by the project's `<Compile Include>` and `<Compile Remove>` items. It also
  reads the nearest `Directory.Build.props`, `<ImplicitUsings>`, `<Using>`
  items, and top-level statements (as the `Program` class).
- **Foreign libraries.** Each NuGet package is one node. A type is matched
  to its package through the DLLs `dotnet restore` recorded in
  `obj/project.assets.json`. ASP.NET Core's shared framework is one node too.
  The .NET base library stays hidden.
- **Not restored.** Without a restore, a package is matched by its root
  namespace (`Newtonsoft.Json`, or `Microsoft.Extensions.Logging` for
  `Microsoft.Extensions.Logging.Abstractions`). Every Screen and every agent
  answer then says that `dotnet restore` would make it exact. A restore can
  move a type to the package it really comes from.

The base library's type names come from an installed SDK's targeting pack.
Without one they come from a list of .NET 8's types that ships with codezoom.

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

## For coding agents

An agent reads the same Screens through three MCP tools. Add them to a
project for Claude Code with:

```bash
claude mcp add codezoom --scope project -- npx -y codezoom mcp
```

That writes a `.mcp.json` you can commit, so the whole team gets them. Any
MCP client works the same way: it runs `codezoom mcp` in the project root
and talks over stdio.

| Tool | Answers |
|---|---|
| `search(query, limit?)` | Nodes that match, as Jump matches them: name, full name, kind, label, and the Dependents and Dependencies counts. |
| `screen(focus, filter?, limit?, offset?)` | The Focus box (label, public and serialized members, how many private ones) and both rows in the page's order. Each neighbour has its edge kind, Weight with R and M, size, cycle mark, namespace distance and declaring file. 25 per row by default; each row gives its total ("25 of 472"). |
| `references(from, to, limit?, offset?)` | The References behind one edge: file:line and the member they sit in, 100 at a time. |

The tools keep no Trail: to Drill, call `screen` on a neighbour. None of
them returns source, since the agent can open the file:line itself. They use
the page's config, cache and file watching. Without a `codezoom.config.json`,
every answer says that the default rules chose own code and suggests
`codezoom setup`.

The same questions work from a shell, as text, or with `--json` as the
tools' own JSON:

```bash
codezoom search WSp --json
codezoom screen Tower --limit 10 --json
codezoom references Tower TowerConfig --json
```

## Commands and options

| | |
|---|---|
| `codezoom [Type]` | Index and open the page at `Type` (or the start page). |
| `codezoom setup` | Open the setup page. |
| `codezoom walk FILE...` | Replay golden walks; no server. |
| `codezoom mcp` | Serve the agent tools over stdio; no browser. |
| `codezoom search QUERY` | Nodes that match, best first. |
| `codezoom screen NODE` | One Screen: the Focus box and both rows. |
| `codezoom references FROM TO` | The References behind one edge. |
| `--json` | Answer search, screen or references as JSON. |
| `--filter TEXT`, `--limit N`, `--offset N` | Filter and page the rows of a screen; search takes `--limit`, references `--limit` and `--offset`. |
| `--port N` | First port to try (default 4777). |
| `--config FILE` | Use a config kept outside the project. |
| `--cache-dir DIR`, `--no-cache` | Where the index cache lives, or none. |
| `--no-watch` | Don't watch files while open. |
| `--no-open` | Don't start a browser; print the address. |
| `--report` | Also list names that could not be resolved. |
| `--foreign-types FILE` | Read foreign type names from a list instead of Unity's DLLs or a restore (tests). |

**Cache and watching.** What each file gave is cached in `.codezoom/` at the
project root (it holds its own `.gitignore`), so a relaunch re-reads only
changed files. While open (the page or `codezoom mcp`), codezoom watches
`Assets/`, `Packages/` and the `.csproj` files, or in a .NET solution its
sources, project files and restores. After a change the page shows a notice
instead of reshuffling the screen you are on. The cache and the config you
save are the only files codezoom writes into a project.

## How it reads C#

- tree-sitter-c-sharp plus its own name resolution: namespaces, `using`
  directives (global and implicit ones too) and aliases, nested types, type
  parameters. Partial types merge; a generic type is one node; both sides of
  every `#if` are read (a file whose `#if` splits a declaration is read once
  per configuration).
- A field or property type is Has, and so is the type of a primary
  constructor parameter, since the class keeps it like a field.
- Foreign libraries come from the type tables of the DLLs your projects
  reference: Unity's (from an installed editor when the project's version
  isn't installed), or the restored NuGet packages'.
- Not seen: the type of a `var` local, extension-method calls, and wiring
  done only in scenes, prefabs or ScriptableObject assets.

## Developing

```bash
git clone https://github.com/JacobCohenIsrael/grill-and-drill.git
cd grill-and-drill/codezoom
npm install
npm run build
npm link        # puts codezoom on your PATH
npm test        # golden walks, MCP and unit tests; no Unity or .NET SDK needed
```

The tests index `examples/TinyTowers` (Unity) and `examples/TinyShop`
(.NET) with committed lists of the foreign types each one uses
(`test/fixtures`), so they pass with or without Unity or a .NET SDK. After
changing an example, refresh its list. For TinyTowers, read it from an
installed editor: `node scripts/extract-foreign-types.mjs ../examples/TinyTowers
test/fixtures/tinytowers-foreign-types.json`. For TinyShop, read it from a
restored copy: `dotnet restore`, then run the same script on that copy with
`test/fixtures/tinyshop-foreign-types.json`. The base library lists in
`data/` come from an SDK's targeting packs:
`node scripts/extract-base-library.mjs <dotnet root> net8.0`. Design terms are in
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
