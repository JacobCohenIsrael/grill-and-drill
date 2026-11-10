---
status: accepted
---

# Duplicates are members of the same exact shape, found in C# first

A Duplicate is a member whose body has the same shape as another own member's.
Two bodies have the same shape when their syntax trees match once every name
(locals, parameters, fields, called methods, types) and every literal is
ignored; keywords, operators and structure must match. Under ADR 0008 this is
a fixed rule: bodies need at least 50 syntax nodes, about six lines, and there
is no similarity score. Files marked as generated (an auto-generated header or
`[GeneratedCode]`) are left out of Duplicates but stay in the graph.
Duplicates show on the Focus first, because the closest Duplicate of a member
sits on that member's own Screen only 29–49% of the time in the projects
probed. This is the first Hint read from the source rather than the graph, so
the reader keeps a fingerprint for each member body and caches it with each
file. The C# reader does this now; TypeScript is deferred with the rest of
Node/TypeScript support.

## Considered Options

- **A similarity score**, as in dryer (Jaccard over sets of syntax subtrees,
  0.82 and up). The members it adds beyond exact matches (14–21% at 0.9,
  37–48% at 0.8) were mostly assignment and wiring lists, which set-based
  Jaccard scores alike whatever their length. A score is also a number the
  reader can't check by looking at the code.
- **A lower minimum of 25 nodes.** It marks 16.4% of the types in
  2d-space-survival, and about half of the sampled groups were worth a look.
  At 50 nodes it marks 4.5% and 3.3% of the types in the two Unity projects
  probed, and 16 of 19 sampled groups were worth a look.
- **Runs of statements inside members, or whole types.** A member is what the
  Focus box lists and what a reader can Jump to; a run of lines has no place
  on a Screen.
- **Marking only neighbours on the Screen.** Most Duplicates share only a
  third type's Screen (often sibling subclasses) or no Screen at all, so the
  marks would hide most of them.
- **Counting generated files.** In a large production project they hold 113
  of the 324 members that have a Duplicate at 50 nodes, none written by hand.
- **One Hint for a repeated Type switch.** Type switches are rare (1 and 20
  in the two projects) and coincided with a Duplicate once.

## Consequences

- Same-shape members that call different methods (parallel variants) are
  marked too; the reader judges whether the likeness is on purpose.
- The per-file cache stores a fingerprint for each member, so its schema
  version goes up and the first start after upgrading reads every file again.
- Golden walks check Duplicates only where a walk names them (`duplicate` on
  a neighbour, `duplicates` on a Screen).
- When TypeScript support resumes, its design decides whether its reader
  fingerprints members, and what a project shows when its reader doesn't.
