// A plain-JS copy of a tree-sitter tree, made in one TreeCursor pass.
// Every property of a native SyntaxNode is a call into the binding; reading
// a file through those calls cost three times the parse. The copy needs a
// few calls per node and then everything is ordinary JS.

import type Parser from "tree-sitter";

/** Named node types whose children the reader never looks at. */
const LEAVES = new Set([
  "identifier",
  "predefined_type",
  "implicit_type",
  "modifier",
  "comment",
  "string_literal",
  "verbatim_string_literal",
  "raw_string_literal",
  "character_literal",
  "integer_literal",
  "real_literal",
  "boolean_literal",
  "null_literal",
  "preproc_region",
  "preproc_endregion",
  "preproc_pragma",
  "preproc_define",
  "preproc_undef",
  "preproc_nullable",
  "preproc_line",
  "preproc_error",
  "preproc_warning",
]);

let nextId = 1;

export class LiteNode {
  readonly id = nextId++;
  readonly children: LiteNode[] = [];
  private fields: (string | null)[] = [];
  private named: LiteNode[] | null = null;

  constructor(
    readonly type: string,
    readonly isNamed: boolean,
    private readonly start: number,
    private readonly end: number,
    readonly parent: LiteNode | null,
    private readonly file: LiteFile,
  ) {}

  /** Source text; an unnamed token's type is its text. */
  get text(): string {
    return this.isNamed ? this.file.source.slice(this.start, this.end) : this.type;
  }

  get startPosition(): { row: number } {
    return { row: this.file.rowOf(this.start) };
  }

  get hasError(): boolean {
    return this.parent === null && this.file.hasError;
  }

  get childCount(): number {
    return this.children.length;
  }

  get namedChildren(): LiteNode[] {
    return (this.named ??= this.children.filter((c) => c.isNamed));
  }

  get namedChildCount(): number {
    return this.namedChildren.length;
  }

  child(i: number): LiteNode | null {
    return this.children[i] ?? null;
  }

  fieldNameForChild(i: number): string | null {
    return this.fields[i] ?? null;
  }

  childForFieldName(name: string): LiteNode | null {
    const i = this.fields.indexOf(name);
    return i < 0 ? null : this.children[i];
  }

  add(child: LiteNode, field: string | null) {
    this.children.push(child);
    this.fields.push(field);
  }
}

class LiteFile {
  private lineStarts: number[] | null = null;

  constructor(
    readonly source: string,
    readonly hasError: boolean,
  ) {}

  rowOf(index: number): number {
    if (!this.lineStarts) {
      const starts = [0];
      for (let i = this.source.indexOf("\n"); i >= 0; i = this.source.indexOf("\n", i + 1)) starts.push(i + 1);
      this.lineStarts = starts;
    }
    const starts = this.lineStarts;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}

/** Per language: type id -> name and named-ness, field id -> name. Filled as ids are first seen. */
interface Symbols {
  types: ({ name: string; named: boolean } | undefined)[];
  fields: (string | undefined)[];
}
const symbolsByLanguage = new WeakMap<object, Symbols>();

export function liteTree(tree: Parser.Tree, source: string, language: object): LiteNode {
  let symbols = symbolsByLanguage.get(language);
  if (!symbols) symbolsByLanguage.set(language, (symbols = { types: [], fields: [] }));
  const { types, fields } = symbols;

  const file = new LiteFile(source, tree.rootNode.hasError);
  const c = tree.walk();
  const root = new LiteNode(c.nodeType, true, c.startIndex, c.endIndex, null, file);
  const fieldName = (id: number) => (id === 0 ? null : (fields[id] ??= c.currentFieldName));

  const stack: LiteNode[] = [root];
  if (!c.gotoFirstChild()) return root;
  for (;;) {
    const parent = stack[stack.length - 1];
    const typeId = c.nodeTypeId;
    const info = (types[typeId] ??= { name: c.nodeType, named: c.nodeIsNamed });
    if (info.named) {
      const node = new LiteNode(info.name, true, c.startIndex, c.endIndex, parent, file);
      parent.add(node, fieldName(c.currentFieldId));
      if (!LEAVES.has(info.name) && c.gotoFirstChild()) {
        stack.push(node);
        continue;
      }
    } else {
      // tokens are leaves, but can still hold a field (`this` in `this.x`)
      parent.add(new LiteNode(info.name, false, 0, 0, parent, file), fieldName(c.currentFieldId));
    }
    while (!c.gotoNextSibling()) {
      if (!c.gotoParent()) return root;
      stack.pop();
      if (stack.length === 0) return root;
    }
  }
}
