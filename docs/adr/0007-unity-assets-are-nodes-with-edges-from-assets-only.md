---
status: accepted
---

# Unity assets are nodes, and their edges start only at assets

Scenes, prefabs and ScriptableObject assets in the user's own folders become
nodes when they are wired to own code. Each asset file is one node, and its
GameObjects show up only inside References. This closes the blind spot ADR
0002 left: wiring done in the Inspector, and types coupled through a shared
ScriptableObject asset. Asset edges always start at an asset (Inherits for a
prefab variant, then Instance of, Contains, Assigns and Calls). Wiring found
in assets never adds an edge between two types, so a type's code
Dependencies stay purely about code, and its asset users appear among its
Dependents.

## Considered Options

- **Add type-to-type edges found in assets, marked "via asset"** (for
  example, an interface field wired to a concrete component in the
  Inspector). More precise, but it mixes two sources of truth into one edge,
  and the same pair could be coupled in one prefab and not in another.
- **GameObjects as nodes.** Large prefabs hold hundreds of them, which would
  bury the architecture under scene hierarchy.

## Consequences

- References made by string (`Resources.Load`, Addressables keys) stay
  invisible, and so do materials, textures, audio, animations and animator
  controllers.
