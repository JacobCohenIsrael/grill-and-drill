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
  /** The size of its Tangle (ADR 0008); absent when it is in none. */
  tangle?: number;
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
  /** On a shortest Cycle through the Focus (ADR 0008): every node in both rows, and more when there is none. */
  cycle: boolean;
  refs: RefWire[];
  /** The evidence behind each Hint on this neighbour; absent when it has none. */
  hints?: NeighbourHint[];
}

/** One step of a Cycle: the edge from one node to the next, with its first Reference. */
export interface CycleHop {
  from: string;
  to: string;
  edge: EdgeKind;
  ref: RefWire;
}

/**
 * A Hint on a neighbour. A Cycle (ADR 0008): one shortest Cycle through the Focus and this neighbour, Focus first
 * and last. A Duplicate (ADR 0009): one of this neighbour's members has the same shape as a Focus member, `of`.
 * A Bypassed interface or a Type switch (ADR 0011) on the edge between the Focus and this neighbour, either way.
 */
export type NeighbourHint =
  | { kind: "cycle"; hops: CycleHop[] }
  | ({ kind: "duplicate"; of: string; nodes: number } & Omit<DuplicateMember, "id">)
  | ({ kind: "bypassed-interface" } & BypassedInterface)
  | ({ kind: "type-switch" } & TypeSwitch);

/** Where a member makes a Reference: As References name members, index into Meta.files, line. */
export interface MemberAt {
  member: string;
  file: number;
  line: number;
}

/** A type holding an own class in fields or properties although that class implements an own interface (ADR 0011). */
export interface BypassedInterface {
  /** The type with the fields. */
  holder: string;
  /** The own class they hold. */
  held: string;
  /** Its fields and properties of that class, Unity-serialized fields left out. */
  fields: MemberAt[];
  /** Own interfaces the held class implements and the holder doesn't: node ids. */
  interfaces: string[];
  /** sqrt(R x M) of the edge from holder to held. */
  weight: number;
}

/** A member testing or casting against two or more own subtypes of one own base (ADR 0011). */
export interface TypeSwitch {
  /** The type whose member it is. */
  type: string;
  /** As References name members: `SlowFor()`. */
  member: string;
  /** The own class or interface the tested types share: a node id. */
  base: string;
  /** Each test of a subtype, in source order: the subtype's node id, index into Meta.files, line. */
  tests: { id: string; file: number; line: number }[];
}

/** A Tangle (ADR 0008): its nodes, the ones with the most edges inside it first, each with that edge count. */
export type Tangle = { id: string; inside: number }[];

/** One member body in a Duplicate group (ADR 0009). */
export interface DuplicateMember {
  /** Its type's node. */
  id: string;
  /** As References name members: `Place()`, `Total`, `Total.get` for one accessor, `Main()` for top-level statements. */
  member: string;
  /** Index into Meta.files. */
  file: number;
  line: number;
}

/** Own members whose bodies have the same shape (ADR 0009), each body `nodes` syntax nodes. */
export interface DuplicateGroup {
  nodes: number;
  members: DuplicateMember[];
}

/** A member of the Focus that is a Duplicate, and the other members in its group. */
export interface FocusDuplicate {
  member: string;
  file: number;
  line: number;
  /** Its group's number in Meta.duplicates, counting from 1. */
  group: number;
  nodes: number;
  duplicates: DuplicateMember[];
}

export type Visibility = "+" | "-" | "#" | "~";

export interface FocusMember {
  vis: Visibility;
  text: string;
  isStatic: boolean;
  isAbstract: boolean;
  serialized: boolean;
  event: boolean;
  /** Its bodies that are Duplicates: indexes into FocusBox.duplicates. */
  duplicates?: number[];
  /** A field or property behind Bypassed interfaces: indexes into FocusBox.bypassedInterfaces. */
  bypassed?: number[];
  /** A member that is a Type switch: indexes into FocusBox.typeSwitches. */
  typeSwitches?: number[];
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
  /** Its members that are Duplicates (ADR 0009), hidden ones too; absent when it has none. */
  duplicates?: FocusDuplicate[];
  /** Own classes it holds although they implement an own interface (ADR 0011); absent when none. */
  bypassedInterfaces?: BypassedInterface[];
  /** Its members that are Type switches (ADR 0011); absent when none. */
  typeSwitches?: TypeSwitch[];
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
  /** Every Tangle, biggest first. */
  tangles: Tangle[];
  /** Every group of Duplicates (ADR 0009): the biggest body first, then the most members. */
  duplicates: DuplicateGroup[];
  /** Every Bypassed interface (ADR 0011), heaviest Weight first. */
  bypassedInterfaces: BypassedInterface[];
  /** Every Type switch (ADR 0011), the most tested subtypes first. */
  typeSwitches: TypeSwitch[];
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
   * Unity: files always come from .asmdef files and folder rules (ADR 0010). "csproj": Unity's .csproj
   * files lend each assembly its defines and DLL references. "asmdef": none (a fresh clone).
   * "sln": a .NET solution's projects. "folder": every .NET project under the folder (no solution).
   */
  source: "csproj" | "asmdef" | "sln" | "folder";
  /** Unity: source files in no .csproj, because Unity hasn't rewritten them since they were added. */
  notInCsproj?: number;
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
