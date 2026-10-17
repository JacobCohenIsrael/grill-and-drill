---
status: accepted
---

# A foreign library is a package

In a Unity project a foreign library is one Unity package, and the
UnityEngine and UnityEditor modules fold into one node each. In a plain .NET
project it is one NuGet package. A type is matched to its package by reading
the type tables of the DLLs the project references: the restored NuGet DLLs
that `obj/project.assets.json` points to, or the Unity editor's DLLs. When
those are missing, codezoom falls back. A Unity project uses another
installed editor's DLLs. A .NET project uses the package's root namespace,
and the Screen says that a `dotnet restore` would make it exact. The .NET
base library stays hidden.

## Considered Options

- **One node per root namespace.** Needs no DLLs, but splits and merges
  libraries wrongly. Unity's types span many namespaces across dozens of
  module DLLs, and one package can ship several namespaces.
- **One node per assembly.** Too fine: UnityEngine alone is dozens of module
  DLLs, so every MonoBehaviour's Dependencies would fill with modules.
