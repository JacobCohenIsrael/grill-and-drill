---
status: accepted
---

# Hints are fixed rules, and the first ones come from the graph alone

codezoom marks nodes where the code may break a design principle, as evidence
for the reader to judge, never as a score or a verdict. Each kind of Hint is a
fixed rule with its numbers written into the rule, the same for every project:
no thresholds relative to the project, no per-project settings and no ignore
list. The first Hints need nothing but the graph, so every language codezoom
reads gets them without reader work: the Cycle mark on the neighbours on the
shortest Cycles through the Focus, and the size of the Focus's Tangle. Hints
that need more from the reader, Bypassed interface and Type switch, wait until
References can tell creating or testing a type apart from other Uses, a change
designed once for both C# and TypeScript.

## Considered Options

- **Mark every neighbour in the Focus's Tangle.** In a large production
  project this marks a median of 43% of a Screen's neighbours (up to 236 on
  one Screen), so the mark stops pointing anywhere. Marking only the shortest
  Cycles gives a median of 2, and every neighbour in both rows keeps the ⟲ it
  has today.
- **Scores and project-relative thresholds** (the worst 5%, percentiles). They
  flag something even in clean code, and a node's number moves when unrelated
  code changes. "Worst first" is the order of the Hints list instead.
- **Namespace cycles, instability, abstractness and Stable Dependencies
  breaks.** They describe namespaces, which have no place on a type's Screen,
  and they flag most of a game: 71% to 88% of namespaces sit in a namespace
  Tangle in the two Unity projects probed. They wait for a namespace or
  assembly view.
- **Refused overrides and fat interfaces.** The first found 4 cases in a
  large production project; the second needs the member that a Reference
  uses, which References don't record.

## Consequences

- `cycle` on a neighbour now means "on a shortest Cycle through the Focus",
  which includes every neighbour that is in both rows.
- Golden walks check each kind of Hint only where a walk names it, so a new
  kind never breaks an older walk.
- An ignore list can come later, in the project's config, without changing
  any rule.
