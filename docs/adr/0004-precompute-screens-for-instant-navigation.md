---
status: accepted
---

# Spend index time to make Drill, Back and Jump instant

Smooth movement matters more than a fast first index, so codezoom does the
work up front. When it indexes, it computes every node's screen: both rows
already sorted, the References behind each edge, and the Focus box. While a
screen is showing, the page preloads the screens of every node in view, so a
Drill never waits for the server and a Back reuses a screen it already has.
The first index of a large project may take up to two minutes. In return, each
move starts drawing within 100 ms and the zoom runs at a steady 60 fps.

## Consequences

- The cache is much larger than a bare graph, and one changed file can mean
  recomputing the screens of every node it gained or lost an edge with.
