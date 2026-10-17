---
status: accepted
---

# Nodes are C# types and foreign libraries, not methods or assets

A node is a type in own code (class, struct, interface, enum or record), or a
whole foreign library such as `UnityEngine` or `DOTween`. Methods are not
nodes, and neither are scenes, prefabs or ScriptableObject assets in v1. We
chose types because the goal is learning architecture, and a method-level call
graph would multiply the node count and need precise call resolution. We
collapse foreign code into one node per library so every MonoBehaviour does
not drown its own Dependencies in `Transform`, `Vector3` and friends.

## Consequences

- Partial types merge into one node, a nested type is its own node, and a
  generic type is one node whatever its type arguments are.
- Wiring done only in Unity assets (Inspector-assigned UnityEvents, two types
  coupled through a shared ScriptableObject asset) is invisible until assets
  become nodes.
