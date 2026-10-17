// What the server sends the page. Types only: imported by both sides.

export type EdgeKind = "inherits" | "implements" | "has" | "uses";

export type NodeKind = "class" | "struct" | "interface" | "enum" | "record" | "record struct" | "delegate" | "library";

export interface NodeInfo {
  /** Own type: full CLR-style name (`A.B.Outer+Inner`1`). Foreign library: `lib:<key>`. */
  id: string;
  /** Name drawn on screen; same-name types carry the shortest unique namespace ending. */
  name: string;
  /** Full name, shown on hover and in search. */
  full: string;
  namespace: string;
  kind: NodeKind;
  /** Stereotype: nearest foreign base type, or the type kind. */
  label: string;
  abstract: boolean;
  dependents: number;
  dependencies: number;
}

/** One Reference behind an edge: [member, index into Meta.files, line]. */
export type RefWire = [string, number, number];

export interface Neighbour {
  id: string;
  edge: EdgeKind;
  /** Number of References behind the edge. */
  count: number;
  /** Namespace distance to the Focus; foreign libraries sort last. */
  distance: number;
  /** In both rows. */
  cycle: boolean;
  refs: RefWire[];
}

export type Visibility = "+" | "-" | "#" | "~";

export interface FocusMember {
  vis: Visibility;
  text: string;
  isStatic: boolean;
  isAbstract: boolean;
  serialized: boolean;
  event: boolean;
}

export interface FocusBox {
  id: string;
  attributes: FocusMember[];
  operations: FocusMember[];
  /** Members not shown: neither public nor serialized. */
  hidden: number;
  file: number;
  line: number;
  assembly: string;
}

export interface Screen {
  focus: FocusBox;
  dependents: Neighbour[];
  dependencies: Neighbour[];
}

export interface IndexStats {
  files: number;
  types: number;
  libraries: number;
  edges: number;
  references: number;
  unresolved: number;
  timings: Record<string, number>;
}

export interface Meta {
  project: string;
  nodes: NodeInfo[];
  files: string[];
  stats: IndexStats;
}
