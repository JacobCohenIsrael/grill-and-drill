// What the server sends the page. Types only: imported by both sides.

/** From a type: inherits, implements, has, uses. From an asset (ADR 0007): inherits, instance of, contains, assigns, calls. */
export type EdgeKind = "inherits" | "implements" | "has" | "uses" | "instance of" | "contains" | "assigns" | "calls";

export type TypeKind = "class" | "struct" | "interface" | "enum" | "record" | "record struct" | "delegate";
/** A Unity asset node: a scene, a prefab, or a ScriptableObject asset. */
export type AssetNodeKind = "scene" | "prefab" | "asset";
export type NodeKind = TypeKind | AssetNodeKind | "library";

export const ASSET_KINDS: readonly NodeKind[] = ["scene", "prefab", "asset"];
export const isAssetKind = (k: NodeKind): k is AssetNodeKind => k === "scene" || k === "prefab" || k === "asset";

export interface NodeInfo {
  /** Own type: full CLR-style name (`A.B.Outer+Inner`1`). Foreign library: `lib:<key>`. Asset: `asset:<path>`. */
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
  /** Namespace distance to the Focus (folder distance for an asset); assets sort after types, libraries last. */
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
  /** An asset's box: component types with counts (scene, prefab) or its asset-assigning fields (ScriptableObject). */
  asset?: { items: { text: string; own: boolean }[] };
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
  /** Unity assets that became nodes. */
  assets?: number;
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

/** One GameObject in an asset's outline (ADR 0007): what the side panel shows instead of YAML. */
export interface OutlineObject {
  name: string;
  /** The GameObject path References use (`Canvas/Header/BuyButton`). */
  path: string;
  /** Component types; `id` is the node to go to, when there is one. */
  components: { name: string; own: boolean; id: string | null }[];
  /** Serialized fields that assign an asset. */
  fields: { field: string; value: string; id: string | null }[];
  /** UnityEvent calls: the method, and the type it runs on. */
  calls: { method: string; type: string; id: string | null }[];
  /** A nested prefab instance (or a variant's base) rooted here. */
  prefab: { name: string; id: string | null; variant: boolean } | null;
  children: OutlineObject[];
}

export interface AssetOutline {
  id: string;
  kind: AssetNodeKind;
  roots: OutlineObject[];
}
