// The questions agents ask (ADR 0005), answered from the precomputed
// Screens: search, screen and references. Stateless: no Trail, so a Drill is
// just another screen call. Shared by `codezoom mcp` and the --json CLI.

import type { Index } from "./indexer.js";
import type { Screens } from "./graph/screens.js";
import { findFocus, matchesName, search as searchNodes } from "./shared/search.js";
import { isAssetKind, type FocusMember, type Neighbour, type NodeInfo, type Screen } from "./shared/types.js";
import { orderBySize, sizeRow, type BoxSize, type Row } from "./shared/weight.js";
import { CONFIG_FILE } from "./shared/ownRules.js";

export const ROW_LIMIT = 25;
export const SEARCH_LIMIT = 20;
export const REFERENCE_LIMIT = 100;

/** A question that has no answer as asked: no such node, two candidates, no such edge. */
export class QueryError extends Error {}

export interface NodeSummary {
  name: string;
  full: string;
  kind: NodeInfo["kind"];
  label: string;
}

export interface SearchAnswer {
  query: string;
  total: number;
  results: (NodeSummary & { dependents: number; dependencies: number })[];
  notes: string[];
}

export interface RowItem extends NodeSummary {
  edge: Neighbour["edge"];
  size: BoxSize;
  /** sqrt(referenceCount x memberCount). */
  weight: number;
  /** R: References behind the edge. */
  referenceCount: number;
  /** M: members of the using end those References sit in. */
  memberCount: number;
  /** The node is in both rows. */
  cycle: boolean;
  /** Namespace steps to the Focus (folder steps when an asset is involved); null for a foreign library. */
  namespaceDistance: number | null;
  /** Where the node is declared, path:line; null for a foreign library. */
  file: string | null;
}

export interface RowAnswer {
  /** Neighbours in the row. */
  total: number;
  /** Neighbours the filter keeps (the total without one). */
  matching: number;
  offset: number;
  shown: number;
  items: RowItem[];
}

export interface ScreenAnswer {
  focus: NodeSummary & {
    namespace: string;
    abstract: boolean;
    assembly: string | null;
    file: string | null;
    /** Every declaration of a partial type, path:line. */
    parts: string[];
    attributes: string[];
    operations: string[];
    /** Members neither public nor serialized, not listed. */
    private: number;
    /** A scene or prefab: its component types with counts, own types first. */
    components?: string[];
    /** A ScriptableObject asset: its fields that assign assets. */
    fields?: string[];
  };
  dependents: RowAnswer;
  dependencies: RowAnswer;
  notes: string[];
}

export interface ReferencesAnswer {
  from: NodeSummary;
  to: NodeSummary;
  edge: Neighbour["edge"];
  weight: number;
  referenceCount: number;
  memberCount: number;
  offset: number;
  shown: number;
  /** From a type: the member each sits in. From an asset: the GameObject (null for a ScriptableObject). */
  references: ({ at: string; member: string } | { at: string; gameObject: string | null })[];
  notes: string[];
}

export interface Page {
  filter?: string;
  limit?: number;
  offset?: number;
  /** false leaves Unity assets out, as the page's "Show assets" toggle does. */
  assets?: boolean;
}

/** What `search` can be narrowed to: a node kind, or "type" for any own type. */
export const SEARCH_KINDS = ["type", "class", "struct", "interface", "enum", "record", "delegate", "scene", "prefab", "asset", "library"] as const;

/** What every answer should say about how the index was made. */
export function indexNotes(index: Index): string[] {
  const notes: string[] = [...index.notes];
  if (!index.own.configPath) {
    notes.push(`No ${CONFIG_FILE}: own code follows the default rules. Run \`codezoom setup\` to choose it.`);
  } else if (index.own.newAssemblies.length) {
    const names = index.own.newAssemblies;
    notes.push(
      `${names.length} assemblies are not in ${CONFIG_FILE} yet and follow the default rules (${names.slice(0, 5).join(", ")}${names.length > 5 ? ", …" : ""}). Run \`codezoom setup\` to review them.`,
    );
  }
  return notes;
}

export class Query {
  private nodes: Map<string, NodeInfo>;

  constructor(
    private screens: Screens,
    readonly notes: string[] = [],
  ) {
    this.nodes = new Map(screens.meta.nodes.map((n) => [n.id, n]));
  }

  /** Jump's matcher: best first. */
  search(query: string, limit = SEARCH_LIMIT, options: { kind?: string; assets?: boolean } = {}): SearchAnswer {
    if (!query.trim()) throw new QueryError("search needs a query: part of a name, or word starts like CA for CampaignApplication");
    const { kind, assets = true } = options;
    if (kind !== undefined && !(SEARCH_KINDS as readonly string[]).includes(kind)) throw new QueryError(`kind must be one of ${SEARCH_KINDS.join(", ")}`);
    const keep = (n: NodeInfo) =>
      (assets || !isAssetKind(n.kind)) && (!kind || (kind === "type" ? n.kind !== "library" && !isAssetKind(n.kind) : n.kind === kind || (kind === "record" && n.kind === "record struct")));
    const all = searchNodes(this.screens.meta.nodes.filter(keep), query, Infinity);
    return {
      query,
      total: all.length,
      results: all.slice(0, clamp(limit, SEARCH_LIMIT)).map((n) => ({ ...summary(n), dependents: n.dependents, dependencies: n.dependencies })),
      notes: this.notes,
    };
  }

  /** The Screen of one Focus: the Focus box and both rows in page order, each row paged. */
  screen(focus: string, page: Page = {}): ScreenAnswer {
    const node = this.find(focus);
    const screen = this.screenOf(node.id);
    const box = screen.focus;
    const lib = node.kind === "library";
    const asset = isAssetKind(node.kind);
    const contents = (box.asset?.items ?? []).map((i) => i.text);
    return {
      focus: {
        ...summary(node),
        namespace: node.namespace,
        abstract: node.abstract,
        assembly: lib || asset ? null : box.assembly,
        file: lib ? null : this.at(box.file, box.line),
        parts: box.parts.length > 1 ? box.parts.map((p) => this.at(p.file, p.line)) : [],
        attributes: box.attributes.map(memberLine),
        operations: box.operations.map(memberLine),
        private: box.hidden,
        ...(asset ? (node.kind === "asset" ? { fields: contents } : { components: contents }) : {}),
      },
      dependents: this.row(screen, "dependents", page),
      dependencies: this.row(screen, "dependencies", page),
      notes: this.notes,
    };
  }

  /** The References behind the edge from one node to another, file:line and member. */
  references(from: string, to: string, page: Omit<Page, "filter"> = {}): ReferencesAnswer {
    const a = this.find(from);
    const b = this.find(to);
    const edge = this.screenOf(a.id).dependencies.find((n) => n.id === b.id);
    if (!edge) {
      const back = this.screenOf(b.id).dependencies.some((n) => n.id === a.id);
      throw new QueryError(
        back ? `${a.name} does not depend on ${b.name}, but ${b.name} depends on ${a.name}: ask for references from ${b.full} to ${a.full}` : `${a.name} and ${b.name} have no edge between them`,
      );
    }
    const offset = Math.max(0, Math.floor(page.offset ?? 0));
    const refs = edge.refs.slice(offset, offset + clamp(page.limit, REFERENCE_LIMIT));
    const fromAsset = isAssetKind(a.kind);
    return {
      from: summary(a),
      to: summary(b),
      edge: edge.edge,
      weight: edge.weight,
      referenceCount: edge.count,
      memberCount: edge.members,
      offset,
      shown: refs.length,
      references: refs.map(([member, file, line]) => (fromAsset ? { at: this.at(file, line), gameObject: member || null } : { at: this.at(file, line), member })),
      notes: this.notes,
    };
  }

  /** The one node a name refers to, as the command line reads it. */
  private find(name: string): NodeInfo {
    if (!name?.trim()) throw new QueryError("name a node: a type's name or full name, or a foreign library");
    const found = findFocus(this.screens.meta.nodes, name.trim());
    if (found.length === 1) return found[0];
    if (!found.length) throw new QueryError(`no node matches "${name}"; search for it first`);
    const shown = found.slice(0, 10).map((n) => n.full);
    throw new QueryError(`"${name}" matches ${found.length} nodes: ${shown.join(", ")}${found.length > 10 ? ", …" : ""}. Name one by its full name.`);
  }

  private screenOf(id: string): Screen {
    return JSON.parse(this.screens.json.get(id)!);
  }

  private at(file: number, line: number): string {
    return `${this.screens.meta.files[file]}:${line}`;
  }

  /** One row as the page orders it (sizes from the whole row, before the filter), then filtered and paged. */
  private row(screen: Screen, row: Row, page: Page): RowAnswer {
    // without assets the row is sized as if they were never there
    const items = page.assets === false ? screen[row].filter((n) => !isAssetKind(this.nodes.get(n.id)!.kind)) : screen[row];
    const sizes = sizeRow(items, row, (id) => this.nodes.get(id)?.kind === "library");
    const ordered = orderBySize(
      items.map((n, i) => ({ n, size: sizes[i] })),
      null,
    );
    const kept = page.filter?.trim() ? ordered.filter(({ n }) => matchesName(this.nodes.get(n.id)!, page.filter!)) : ordered;
    const offset = Math.max(0, Math.floor(page.offset ?? 0));
    const shown = kept.slice(offset, offset + clamp(page.limit, ROW_LIMIT));
    return {
      total: items.length,
      matching: kept.length,
      offset,
      shown: shown.length,
      items: shown.map(({ n, size }) => {
        const node = this.nodes.get(n.id)!;
        const lib = node.kind === "library";
        return {
          ...summary(node),
          edge: n.edge,
          size,
          weight: n.weight,
          referenceCount: n.count,
          memberCount: n.members,
          cycle: n.cycle,
          namespaceDistance: lib ? null : n.distance,
          file: lib || node.file === undefined ? null : this.at(node.file, node.line ?? 0),
        };
      }),
    };
  }
}

function summary(n: NodeInfo): NodeSummary {
  return { name: n.name, full: n.full, kind: n.kind, label: n.label };
}

/** A member as the Focus box shows it, with UML's markers spelled out. */
function memberLine(m: FocusMember): string {
  const tags = [m.isStatic && "{static}", m.isAbstract && "{abstract}", m.serialized && "{serialized}"].filter(Boolean);
  return `${m.vis} ${m.event ? "«event» " : ""}${m.text}${tags.length ? " " + tags.join(" ") : ""}`;
}

function clamp(limit: number | undefined, fallback: number): number {
  if (limit === undefined || limit === null || !Number.isFinite(limit)) return fallback;
  return Math.max(0, Math.floor(limit));
}

// ---- the same answers as text, for `codezoom search|screen|references` without --json

export function searchText(a: SearchAnswer): string {
  const lines = [`${a.total} ${a.total === 1 ? "node matches" : "nodes match"} "${a.query}"${a.total > a.results.length ? `, best ${a.results.length}` : ""}`];
  const w = Math.max(0, ...a.results.map((r) => r.name.length));
  for (const r of a.results) lines.push(`  ${r.name.padEnd(w)}  «${r.label}»  ${r.full}  (${r.dependents} dependents, ${r.dependencies} dependencies)`);
  return withNotes(lines, a.notes);
}

export function screenText(a: ScreenAnswer): string {
  const f = a.focus;
  const lines = [`${f.name} «${f.label}»${f.abstract ? " abstract" : ""} ${f.kind}  ${f.full}${f.assembly ? `  (${f.assembly})` : ""}`];
  if (f.file) lines.push(`  ${f.file}${f.parts.length ? ` (+${f.parts.length - 1} more parts)` : ""}`);
  for (const m of [...f.attributes, ...f.operations, ...(f.components ?? []), ...(f.fields ?? [])]) lines.push(`  ${m}`);
  if (f.private) lines.push(`  +${f.private} private`);
  for (const [title, row] of [["Dependents", a.dependents], ["Dependencies", a.dependencies]] as const) {
    const range = row.shown ? `${row.offset + 1}-${row.offset + row.shown} of ${row.matching}` : row.matching ? `none of ${row.matching}` : "none";
    lines.push(`${title}: ${range}${row.matching !== row.total ? ` matching (${row.total} in all)` : ""}`);
    const w = Math.max(0, ...row.items.map((n) => n.name.length));
    for (const n of row.items) {
      const weight = `W ${n.weight} (R ${n.referenceCount}, M ${n.memberCount})`;
      lines.push(`  ${n.size.padEnd(6)}  ${n.name.padEnd(w)}  ${n.edge.padEnd(11)}  ${weight.padEnd(20)}${n.cycle ? "  cycle" : ""}${n.file ? `  ${n.file}` : ""}`);
    }
  }
  return withNotes(lines, a.notes);
}

export function referencesText(a: ReferencesAnswer): string {
  const lines = [`${a.from.name} ${a.edge} ${a.to.name}: Weight ${a.weight} (R ${a.referenceCount}, M ${a.memberCount})`];
  if (a.shown < a.referenceCount) lines[0] += `, showing ${a.shown ? `${a.offset + 1}-${a.offset + a.shown}` : "none"}`;
  const w = Math.max(0, ...a.references.map((r) => r.at.length));
  for (const r of a.references) lines.push(`  ${r.at.padEnd(w)}  ${"member" in r ? r.member : (r.gameObject ?? "")}`);
  return withNotes(lines, a.notes);
}

function withNotes(lines: string[], notes: string[]): string {
  return [...lines, ...notes.map((n) => `note: ${n}`)].map((l) => l.trimEnd()).join("\n");
}
