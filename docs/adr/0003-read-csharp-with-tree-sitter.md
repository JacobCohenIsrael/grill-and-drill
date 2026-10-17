---
status: accepted
---

# Read C# with tree-sitter and our own name resolution, not Roslyn

codezoom parses C# with tree-sitter and resolves type names itself from
namespaces, `using` directives, aliases and nested types. It takes assembly
membership from the `.csproj` files when they exist, and falls back to
`.asmdef` files and Unity's folder rules when they don't. Roslyn would be
exact, but it needs a C# helper inside the npm package, a matching Unity
install for the UnityEngine reference DLLs, and the generated `.csproj`
files, which are gitignored. When we checked, the test project's Unity version
was not installed. tree-sitter ships prebuilt for every platform and works on
a fresh clone.

## Considered Options

- **Roslyn helper run on the .NET SDK that Unity bundles.** Compiler-exact.
  Kept as a possible optional "precise mode" behind the same reader seam.
- **Read Unity's compiled DLLs and PDBs in `Library/ScriptAssemblies`.**
  Exact, but only as fresh as Unity's last compile, and Node has no mature
  .NET metadata reader.

## Consequences

- References that never name the type in source are missed: the type of a
  `var` local, and calls to extension methods.
- Both sides of every `#if` are read, so edges are the union across build
  configurations.
