# Research: an entry-point-centred UML navigator

Working name: **drill** (repo: `grill-and-drill`). Written 2026-10-16 as the
seed for a `grill-with-docs` session. Nothing here is decided yet; the
"Open questions" section is the agenda.

The grill session writes its decisions as `GLOSSARY.md` at the repo root
(terms only) and `docs/adr/NNNN-slug.md` (hard-to-reverse decisions). This
file is input only; it is not where those decisions go.

## The idea

Index a project once. Give the tool an **entry point** (a module, class or
function). It draws a UML-style diagram of what is connected around that
entry point. Every element on the diagram is one of two moves:

- **Drill** — that element becomes the new entry point and the diagram
  re-centres on it.
- **Back** — return one level to the previous view.

The point is to walk an unfamiliar codebase and come away knowing its
architecture.

## What the four reference repos are

All four are Uncle Bob's, built to work together. The three Python tools
write snapshots under `.metrics/`, and uml-viewer reads them to colour
the diagram.

| Repo | What it does | Stack | Output |
|---|---|---|---|
| [uml-viewer](https://github.com/unclebob/uml-viewer) | Live, clickable UML of a project's namespace tree. Drill down to source; agent-driven "what-if" architecture proposals | Clojure + Quil (JVM), ~8.7k LOC src | EDN IR, on-screen diagram |
| [crapper](https://github.com/unclebob/crapper) | CRAP score per function (`CC² × (1−cov)³ + CC`) | Python ≥3.11, tree-sitter | `.metrics/crap.edn` |
| [dryer](https://github.com/unclebob/dryer) | Structural duplicate detection (Jaccard over normalised AST fingerprints) | Python ≥3.11, tree-sitter | `.metrics/dry.edn` |
| [mutator](https://github.com/unclebob/mutator) | Mutation testing, differential by function hash, parallel workers | Python ≥3.11, tree-sitter; imports crapper | `.metrics/mutate/<ns>.edn` |

Languages across the Python tools: Clojure, Java, Go, TypeScript/JS, Rust,
Python. uml-viewer's own scanners cover Clojure, TypeScript, Rust and Python.

## uml-viewer in depth

### Pipeline

```
source tree
   │  LanguageGraph scanner (one per language; protocol `scan root opts`)
   ▼
raw facts  {:classes [{:id :name :ns :stereotype :lang :file :foreign}]
            :edges   [{:from :to :kind}]}
   │  + policy file (prefix, order, levels, foreign, edge-kinds, omit, proposals)
   ▼
IR (EDN, generated, never hand-edited)
   │  + overlay of .metrics/ snapshots, joined by namespace and function name
   ▼
view-at(doc, path)  → one screen: children of `path` as boxes,
   │                   edges collapsed to that level
   ▼
layout (Sugiyama ranks) → route (orthogonal, D3 curveBasis) → draw (Quil)
```

Key separation: **agents edit the policy, never the IR.** The IR is
regenerated from source + policy.

### Data model

- A **class** is one module: one Clojure namespace, one TS/Python file,
  one Rust source file. There are no function-level nodes; functions are
  `:ops` listed inside a class card.
- **Edge kinds:** `:dependency`, `:implements`, `:inheritance`,
  `:association`, `:aggregation`, `:composition`. Scanners only emit
  `:dependency`, `:implements` and (Python) `:inheritance`; the policy can
  re-label a pair as `:association`.
- **Foreign** classes (external libraries) are drawn as ovals outside the
  components, but only if listed in policy `:foreign`; unlisted externals
  are dropped.
- Cross-language links: a TS `invoke("read_text")` is joined to the Rust
  `#[tauri::command] fn read_text` as a dependency.

### Navigation model — containment drill

- State is a **path**: a vector of namespace segments, e.g.
  `[:engine]`. The first screen is path `[]` (top-level components).
- `view-at doc path` shows the **children** of that path as boxes.
  Dependencies are collapsed to that level (many leaf edges → one arrow).
- Dependencies that leave the current subtree are not drawn as arrows.
  They become **ports**: triangles on the box edge (incoming on top,
  outgoing on the bottom) with a hover list of `from -> to` pairs.
- Double-click a component → drill one level down. Esc / ← → up one level.
- Double-click a leaf module → **class card** (functions with CRAP and
  mutation numbers). Click a function → **source window** at that line,
  via a per-language `LanguageSource` extractor (`locate`, `extract`,
  `title`).
- **Declutter** cycles: one arrow per component pair → arrows replaced by
  ports → hide members → hide nested classes → none.
- View state (depth, pan, zoom, current proposal) persists to
  `.uml-viewer/session.edn`.

### Architecture judgement

- **Levels.** Policy `:levels` groups top-level segments by architectural
  level (inner first). A `:dependency` from an inner level to an outer one
  is **violating** (Clean Architecture's Dependency Rule) and drawn red.
  Inner level 0 is drawn at the bottom, so good arrows point down.
- **Colour.** Each box maps CRAP (μ+σ) and mutation score onto 1–10, averages
  them, and paints a red-to-green fill. Missing data counts as red.
  Parents pool their children by function count.
- **Proposals.** Named regroupings of real namespaces that are not in the
  code ("what if these five modules were one component?"). Shown with a
  "PROPOSAL — not instantiated in code" banner; levels and violations are
  re-evaluated against the proposal.

### Agent coupling

The viewer runs beside an agent (Grok in a tmux session). They talk through
two queue files in `.uml-viewer/` (`to-viewer.edn`, `to-agent.edn`); tmux
keystrokes are only the doorbell. Right-click actions (refresh CRAP,
refresh mutation, omit) and inspector clicks (switch context to a proposal)
become mail to the agent. The agent writes `:display` to show a new IR.

## crapper, dryer, mutator — the shared shape

These three tools are deliberately alike, and an indexer could copy the
pattern:

- **Discovery** (`discover.py`): extension → language map, a fixed skip
  list (`.git`, `node_modules`, `target`, `dist`, `.venv`, …), and test-file
  detection per language. Tests are excluded from analysis.
- **Per-language readers** behind one function
  (`functions_in_source(source, path, root) -> [Function]`), built on shared
  tree-sitter helpers (`parse`, `descendants`, `child_of_type`).
- **One unit of analysis: the function or method**, with
  `name, namespace, start_line, end_line, path, language`, plus byte span.
- **CLI conventions:** no args = whole project; positional paths or path
  fragments; `--changed` = git additions and edits; `./tool` bootstraps its
  own `.venv` on first run.
- **Snapshots** are EDN under `.metrics/`, replaced on each run and meant
  to be committed.
- **Shared identity.** Every tool names a function the same way, so
  snapshots join without a lookup table. mutator imports crapper directly
  to guarantee it.

| Language | namespace | name |
|---|---|---|
| Clojure | the `ns` | `defn` / `defn-` name |
| Java | `package.Class` or `package.Outer.Inner` | method |
| Go | import path, or `import/path.Receiver` | function / method |
| TypeScript | dotted module path, or `module.Class` | function / method |
| Rust | `crate::module`, or `crate::module::Type` | function / method |
| Python | dotted module path, or `module.Class` | function / method |

Renaming or moving a function makes a new identity; nothing tracks it
across runs.

- **Dogfooding.** crapper and dryer each ship a `uml` script and an
  `examples/<name>.policy.edn` so they can be viewed in uml-viewer.

## How the new tool differs from uml-viewer

This is the most important finding. uml-viewer and the idea above both say
"drill", but they mean different things.

| | uml-viewer | drill (this idea) |
|---|---|---|
| Starting point | Always the project root | Any node the user names |
| What a screen shows | Children of the current namespace | The neighbourhood of the focus node: what it uses and what uses it |
| "Drill" | Descend into a package (zoom **in**) | Re-centre on a neighbour (move **across**) |
| "Back" | Parent namespace (zoom **out**) | Previous focus (history) — *to be decided* |
| Edges leaving the screen | Collapsed into ports | Become the next drill targets |
| Smallest node | Module | Module, class, or function — *to be decided* |
| Question it answers | "How is this system layered?" | "What is this thing connected to, and where do I go next?" |

uml-viewer is a map you zoom into. drill is closer to a browser: each node
is a page, its edges are links, and Back is history. The two can coexist —
a focus view could also offer "zoom out to the containing module".

### Closest prior art

- **Sourcetrail** (open-source, archived 2021): indexed C, C++, Java and
  Python; showed the active symbol in the centre with incoming and outgoing
  references; clicking a neighbour re-focused; had back/forward history and
  a linked code view. Nearly the same interaction as this idea. Worth
  studying for what worked and why it stalled.
- **LSP call hierarchy** (`prepareCallHierarchy`, `incomingCalls`,
  `outgoingCalls`, LSP 3.16+) and **type hierarchy** (3.17): the same
  "one node, its in- and out-neighbours" query, as a protocol. Language
  servers already resolve calls precisely.
- **SCIP indexes** (Sourcegraph; `scip-typescript`, `scip-python`,
  `scip-java`, `rust-analyzer scip`): a precomputed file of definitions
  and references for a whole project. A ready-made "index" step.

## What could be reused

- **From the Python tools:** discovery rules, tree-sitter helpers, the
  per-language reader seam, the `(namespace, name)` identity, CLI
  conventions. If nodes use the same identity, `.metrics/` snapshots can
  colour drill's nodes by CRAP, mutation score and duplication with no
  extra work.
- **From uml-viewer:** the IR shape (classes, edges, edge kinds), foreign
  libraries as ovals, ports for edges that leave the screen, levels and
  violating-edge colouring, the policy-vs-generated-data split, the
  class card → source jump, session persistence, and (later) the
  agent mailbox.
- **Not reusable as-is:** uml-viewer's view builder (`view-at`) assumes
  containment. A focus view is a different query over the same graph.

## Hard problems

1. **Resolving references.** Module-level imports are easy with
   tree-sitter (uml-viewer does this). Function-level calls are not: you
   need name resolution across files, and dynamic dispatch, callbacks,
   dependency injection and reflection hide edges. Options: hand-rolled
   per-language resolution (like uml-viewer's scanners), SCIP indexers,
   a language server's call hierarchy, or a mix.
2. **Hub explosion.** Re-centring on `logger` or `utils` can show hundreds
   of neighbours. Needs grouping (by module or package), limits, an omit
   list, or collapsing foreign and utility nodes.
3. **What "back one level" means.** History pop, containment parent, or
   both as separate moves.
4. **Direction and radius.** Show callers, callees, or both? One hop, or
   N hops with fading?
5. **Index freshness.** Full re-index vs incremental (`--changed`, or
   mutator-style per-function hashes).
6. **Layout stability.** Re-centring should not reshuffle everything; the
   user loses their place.

## Open questions for the grill session

1. Which languages first? (Which codebase will you actually use this on?)
2. What is a node: module/file, class, function — or several levels with
   zoom between them?
3. Which edges matter: imports, calls, inheritance/implements, type
   references, data flow?
4. Is "back" history, containment, or both? Do you also want forward and a
   breadcrumb trail?
5. How is an entry point given: CLI argument, fuzzy symbol search, clicking
   in the diagram, from the editor?
6. What does one screen show: callers above / callees below (matching
   uml-viewer's "good arrows point down"), and how many hops?
7. Where does it render: browser (web app), terminal (TUI), desktop window,
   Mermaid/PlantUML text, or an MCP server an agent queries?
8. Build on uml-viewer (fork, or emit its IR) or stand alone and only share
   conventions?
9. Should metrics (CRAP, mutation, duplication) colour nodes from day one?
10. Should levels / dependency-rule violations be part of v1?
11. Is an agent in the loop (like uml-viewer's companion), and which one?
12. Where does the index live (SQLite, JSON/EDN, in memory) and how is it
    kept fresh?
13. What does "done" look like for v1 — the smallest version you would use
    on a real project this week?

## Overloaded words

These words already mean something else, in code or in uml-viewer. Settle
them first.

- **Entry point.** In code it usually means `main` or a request handler.
  Here it means "whatever node the view is centred on", which can be any
  function or module. Consider **Focus** instead.
- **Drill.** In uml-viewer it means "descend into a package". Here it means
  "re-centre on a neighbour". These are different moves.
- **Level.** "Going back one level" means a step in navigation. In
  uml-viewer, **Level** is an architectural rank used for
  dependency-rule colouring. Using one word for both will confuse people.
- **Component / layer.** In uml-viewer these are the same thing: a
  namespace grouping.
- **Class.** In uml-viewer's IR, "class" means one module or file, not a
  language-level class.

## Vocabulary as currently used

Candidate terms to pin down during the grill session:

- **Index** — the stored graph of nodes and edges for one project.
- **Node** — a thing that can be focused (module, class, function — TBD).
- **Edge** — a typed relationship between two nodes.
- **Entry point / Focus** — the node the current view is centred on.
- **Neighbourhood** — the nodes shown around the focus.
- **Drill** — make a neighbour the new focus.
- **Back** — return to the previous view.
- **Trail** — the history of foci in this session.
- **Port** — a marker for edges that lead off-screen (uml-viewer term).
- **Foreign** — a node outside the project (library).
- **Level** — an architectural rank used to flag dependency-rule
  violations (uml-viewer term).
