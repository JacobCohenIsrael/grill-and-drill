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
  /** Own type: where it is declared (its first part), index into Meta.files. Absent for a library. */
  file?: number;
  line?: number;
}

/** One Reference behind an edge: [member, index into Meta.files, line]. */
export type RefWire = [string, number, number];

export interface Neighbour {
  id: string;
  edge: EdgeKind;
  /** Number of References behind the edge (R). */
  count: number;
  /** Distinct members of the using type the References sit in (M); the declaration itself counts as one. */
  members: number;
  /** sqrt(R x M): how heavily the using end relies on the other. */
  weight: number;
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
  /** Every declaration of the type (a partial type has several): index into Meta.files, line. */
  parts: { file: number; line: number }[];
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
  /** The editor "Open in …" launches, when one was found. */
  editor?: string | null;
  /** Goes up each time the index is rebuilt while the server runs. */
  version?: number;
  /** Assemblies the config has not reviewed yet; the top bar offers setup for them. */
  newAssemblies?: string[];
  /** Said on every Screen: how the index is less than exact (packages not restored). */
  notes?: string[];
  /** Unity project or plain .NET folder: the page says assemblies or projects. */
  kind?: import("./ownRules.js").ProjectKind;
}

/** One assembly as the setup page shows it. */
export interface SetupAssembly {
  name: string;
  /** Its C# files, project-relative. */
  files: string[];
  /** Namespace roots its files declare, most files first ("(global)" for none). */
  namespaces: [string, number][];
  /** What the default rules (round 3) say. */
  defaultOwn: boolean;
  defaultReason: string | null;
  /** What those rules need beyond name and files (a .NET test project, say). */
  hints?: import("./ownRules.js").VerdictHints;
}

/** What kind of folder this is and where its assemblies come from. */
export interface ProjectSummary {
  kind: import("./ownRules.js").ProjectKind;
  name: string;
  /** Unity: from ProjectSettings/ProjectVersion.txt. */
  unityVersion: string | null;
  /** Unity: the installed editor read for UnityEngine types, when it is not the project's own. */
  standIn: string | null;
  unityInstalled: boolean;
  /**
   * "csproj": Unity's .csproj files, exact. "asmdef": a fresh Unity clone, from .asmdef files and folder rules.
   * "sln": a .NET solution's projects. "folder": every .NET project under the folder (no solution).
   */
  source: "csproj" | "asmdef" | "sln" | "folder";
  /** .NET: the solution files read. */
  solutions?: string[];
}

export interface SetupData {
  project: ProjectSummary;
  /** Where Save writes, as shown to the user. */
  configPath: string;
  config: import("./ownRules.js").Config | null;
  assemblies: SetupAssembly[];
}
