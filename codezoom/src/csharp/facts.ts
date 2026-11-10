// What the C# reader takes out of one file, before any name is resolved.

export interface NameSeg {
  name: string;
  arity: number;
}

/** A type or namespace name as written: `Foo`, `A.B.Foo<int>`, `global::X`. */
export interface NameSyntax {
  global: boolean;
  segs: NameSeg[];
}

/** One `namespace` block (or the file itself), with its using directives. */
export interface Scope {
  ns: string;
  parent: Scope | null;
  usings: string[];
  aliases: Map<string, NameSyntax>;
  staticUsings: NameSyntax[];
}

export type TypeKind = "class" | "struct" | "interface" | "enum" | "record" | "record struct" | "delegate";

export type Access = "public" | "private" | "protected" | "internal" | "protected internal" | "private protected";

export type MemberKind =
  | "field"
  | "const"
  | "property"
  | "event"
  | "enum-value"
  | "method"
  | "ctor"
  | "dtor"
  | "operator"
  | "indexer";

/**
 * One member body's shape (ADR 0009): its syntax tree with every name and
 * literal left out, hashed, and how many syntax nodes it has. Kept only for
 * bodies of MIN_SHAPE_NODES or more.
 */
export interface Shape {
  hash: string;
  nodes: number;
  /** Where the body's member (or accessor) is declared. */
  line: number;
  /** A property's, indexer's or event's accessor: get, set, init, add, remove. */
  accessor?: string;
}

export interface MemberDecl {
  kind: MemberKind;
  name: string;
  /** Field/property/event type, or method return type, as written. */
  type: string | null;
  /** Parameter types as written, for methods, constructors and indexers. */
  params: string[] | null;
  access: Access;
  isStatic: boolean;
  isAbstract: boolean;
  serialized: boolean;
  line: number;
  /** A readonly field, which Unity never serializes. */
  readonly?: boolean;
  /** A field marked [NonSerialized]. */
  nonSerialized?: boolean;
  /**
   * Its bodies of MIN_SHAPE_NODES syntax nodes or more: one for a method, or
   * one per accessor. Absent when there are none, and in a generated file.
   */
  shapes?: Shape[];
}

/** One declaration of a type. A partial type has several. */
export interface TypeDecl {
  /** Full CLR-style name: `A.B.Outer+Inner`1`. Partial parts share it. */
  key: string;
  name: string;
  arity: number;
  namespace: string;
  outer: TypeDecl | null;
  kind: TypeKind;
  modifiers: string[];
  typeParams: string[];
  /** Type parameters visible inside, including the outer types'. */
  scopeTypeParams: string[];
  members: MemberDecl[];
  /** Primary constructor parameters of a class or struct: in scope in the whole body, like members. */
  captured?: string[];
  scope: Scope;
  file: string;
  line: number;
}

/** Where a Reference sits, which decides its edge kind. */
export type RefRole = "base" | "has" | "uses";

export interface RawRef {
  name: NameSyntax;
  /**
   * True when the name sits where an expression could also be: it counts
   * only if no local, parameter or member of that name hides it.
   */
  expr: boolean;
  attribute: boolean;
  role: RefRole;
  from: TypeDecl;
  member: string;
  line: number;
  scope: Scope;
  methodTypeParams: string[] | null;
  locals: Set<string> | null;
  /** Tests or casts a value against the type: `is`, `as`, a cast, a pattern, a `switch` case (ADR 0011). */
  test?: boolean;
}

export interface FileFacts {
  path: string;
  assembly: string;
  types: TypeDecl[];
  refs: RawRef[];
  globalUsings: string[];
  parseErrors: boolean;
  /** An auto-generated header or [GeneratedCode]: in the graph, but left out of Duplicates (ADR 0009). */
  generated?: boolean;
}
