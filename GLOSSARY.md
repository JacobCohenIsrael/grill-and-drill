# codezoom

A tool that indexes a project and draws the code around one chosen node, so a
reader can walk an unfamiliar codebase one step at a time and learn its
architecture.

## The graph

**Node**:
Anything that can be the Focus: a type in own code, or a foreign library.
_Avoid_: Element, symbol, class, box

**Own code**:
The code the user has marked as theirs, chosen by assembly.
_Avoid_: Project code, first-party code, source

**Foreign library**:
A body of code outside own code that own code uses, shown as one node.
_Avoid_: Dependency, package, external, third-party

**Reference**:
One place in the source where one type mentions another.
_Avoid_: Usage, mention, occurrence

**Edge**:
A directed link from one node to another that stands for one or more
References and carries a single edge kind, the strongest among them.
_Avoid_: Link, relation, arrow

**Weight**:
How heavily the using end of an edge relies on the other end, from how many
References it makes and how many of its own members those References sit in.
_Avoid_: Count, strength, usage, frequency

## Edge kinds

Strongest first.

**Inherits**:
The edge kind from a type to its base class.
_Avoid_: Extends, inheritance, generalization

**Implements**:
The edge kind from a type to an interface it implements.
_Avoid_: Realizes, realization

**Has**:
The edge kind from a type to the type of one of its fields or properties,
except events.
_Avoid_: Association, aggregation, composition, owns

**Uses**:
The edge kind for any other Reference from one type to another.
_Avoid_: Dependency, calls, association

## Navigation

**Focus**:
The node the current screen is centred on.
_Avoid_: Entry point, root, centre

**Drill**:
The move that makes a node on the screen the new Focus.
_Avoid_: Re-centre, navigate

**Back**:
The move that returns to the previous Focus on the Trail.
_Avoid_: Up, level

**Jump**:
The move that makes a node found by search the new Focus, without going
through the screen.
_Avoid_: Go to, open, search

**Trail**:
The ordered list of Foci visited in one session, oldest first.
_Avoid_: History, path, stack, breadcrumbs

**Golden walk**:
A written-down sequence of moves through a project the reader knows, with
the neighbours each screen must (and must not) show, used to check that the
diagram is right.
_Avoid_: Test, tour, script, scenario

## Around the Focus

**Dependents**:
The nodes that depend on the Focus.
_Avoid_: Callers, users, upstream, incoming

**Dependencies**:
The nodes the Focus depends on.
_Avoid_: Callees, uses, downstream, outgoing

**Namespace distance**:
The number of namespace steps between a node and the Focus: up to the
namespace both share, then down to the node's own.
_Avoid_: Closeness, proximity
