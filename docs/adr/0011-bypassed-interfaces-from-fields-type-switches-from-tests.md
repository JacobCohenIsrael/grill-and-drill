---
status: accepted
---

# Bypassed interfaces come from fields, Type switches from tests, in C# first

A Bypassed interface is a field or property, generic arguments and static
fields included, that keeps an own class although the class implements an
own interface the holder doesn't. Fields Unity serializes are left out:
`[SerializeField]`, `[SerializeReference]` and Unity's rule for public
instance fields of MonoBehaviour and ScriptableObject types; a property
exposing one still counts. A Type switch is a member whose References test
or cast against two or more own subtypes of one own base: `is`, type
patterns, `switch` type cases, `as` and casts, not `typeof`. Both are fixed
rules under ADR 0008, and generated files make neither. So the reader marks
one new kind of Reference, a test; it needs no "creates" kind, which ADR 0008
expected. They come to the C# reader first, with that kind named so the
TypeScript reader can add `instanceof` when it returns.

## Considered Options

- **Parameters, locals and `GetComponent<C>()` as well as fields.** In
  2d-space-survival that doubles the marks, from 69 holder-and-class pairs
  (47 types) to 139 (98 types), and 31 of the 70 it adds are Editor tools. A
  field is what a type keeps; most of the rest pass through.
- **`typeof` as a test.** It adds no Type switch in any project probed; it
  is mostly `new GameObject(name, typeof(C))` and attributes, and
  `GetType() == typeof(C)` never appears against an own type.
- **One design for both readers before either ships.** TypeScript is on
  hold; the C# rules don't depend on it.

## Consequences

- The marks sit on edges, at both ends: △ on the Has edge from the holder to
  the class, ◇ on the edges from the switching type to each tested subtype.
  The base of a Type switch is named in the hover and gets no mark.
- Interfaces count through base classes and interface inheritance, at any
  depth. Of two bases with as many tested subtypes, the more specific one is
  named.
- Unity's base classes are known by name (MonoBehaviour, ScriptableObject
  and their usual subclasses), since the DLLs' own inheritance isn't read.
