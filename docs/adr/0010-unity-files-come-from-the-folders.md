---
status: accepted
---

# A Unity project's files come from its folders, not its .csproj files

Which source files make up each assembly of a Unity project comes from its
`.asmdef` and `.asmref` files and Unity's folder rules, even when Unity's
`.csproj` files are there. Unity rewrites those only when it opens the
project, so they go stale while code is written without it: in
2d-space-survival they were a month old, missed 347 files (a whole package
among them) and still listed 19 deleted ones, and codezoom showed 757 of its
1,074 types. Every listed file that still existed had the same assembly both
ways. An assembly's `.csproj` still lends what the folders can't say exactly,
its defines and DLL references, and an assembly with no `.csproj` yet borrows
the defines of the largest one. This changes what ADR 0003 says about
membership.

## Considered Options

- **Detect stale `.csproj` files and only then switch to the folders.** It
  drops Unity's real defines (145 in that project against the 8 codezoom
  guesses), which matter where an `#if` splits a declaration.
- **Keep the `.csproj` lists and add the files they miss.** A file whose
  assembly changed after Unity's last run (a new `.asmdef` above it) would
  stay in the old one.

## Consequences

- When the `.csproj` files miss some files, the startup report and the setup
  page say how many and suggest opening the project in Unity. Screens and
  agent answers don't.
- A `.csproj` whose files all lie outside `Assets/` and `Packages/` (a
  registry package's source in `Library/PackageCache`) is still read as it
  is, since no folder rule finds those files.
- A new script shows up on the next re-index without Unity running.
