// Reads one C# file with tree-sitter into declarations and unresolved
// References. Both sides of every #if are read (ADR 0003).

import Parser from "tree-sitter";
import { conditionSymbols, configure, hasIf } from "./branches.js";
import { LiteNode, liteTree } from "./lite.js";
// deep import: the package's extensionless "main" warns under ESM
import CSharp from "tree-sitter-c-sharp/bindings/node/index.js";
import type {
  Access,
  FileFacts,
  MemberDecl,
  MemberKind,
  NameSeg,
  NameSyntax,
  RawRef,
  RefRole,
  Scope,
  TypeDecl,
  TypeKind,
} from "./facts.js";

type Node = LiteNode;

const parser = new Parser();
parser.setLanguage(CSharp as unknown as Parser.Language);

interface Ctx {
  scope: Scope;
  type: TypeDecl | null;
  member: string;
  methodTypeParams: string[] | null;
  locals: Set<string> | null;
}

const TYPE_DECLARATIONS: Record<string, TypeKind> = {
  class_declaration: "class",
  struct_declaration: "struct",
  interface_declaration: "interface",
  enum_declaration: "enum",
  record_declaration: "record",
  delegate_declaration: "delegate",
};

/** `parent.field` pairs whose child is a type, inside code bodies. */
const TYPE_FIELDS = new Set([
  "cast_expression.type",
  "as_expression.right",
  "is_expression.right",
  "typeof_expression.type",
  "default_expression.type",
  "sizeof_expression.type",
  "object_creation_expression.type",
  "array_creation_expression.type",
  "stackalloc_expression.type",
  "declaration_expression.type",
  "declaration_pattern.type",
  "recursive_pattern.type",
  "type_pattern.type",
  "variable_declaration.type",
  "foreach_statement.type",
  "catch_declaration.type",
  "parameter.type",
  "parameter_list.type",
  "bracketed_parameter_list.type",
  "local_function_statement.type",
  "lambda_expression.type",
  "from_clause.type",
  "join_clause.type",
  "refvalue_expression.type",
  "ref_type.type",
  "explicit_interface_specifier.",
]);

/** `parent.field` pairs whose identifier child declares a local name. */
const LOCAL_NAME_FIELDS = new Set([
  "variable_declarator.name",
  "declaration_pattern.name",
  "declaration_expression.name",
  "var_pattern.name",
  "recursive_pattern.name",
  "catch_declaration.name",
  "foreach_statement.left",
  "parameter.name",
  "parameter_list.name",
  "bracketed_parameter_list.name",
  "local_function_statement.name",
  "from_clause.name",
  "tuple_pattern.name",
  "parenthesized_variable_designation.name",
  "list_pattern.name",
  "lambda_expression.parameters",
]);

/** `parent.field` pairs whose identifier child is a member or label name, never a type. */
const SKIP_FIELDS = new Set([
  "member_access_expression.name",
  "member_binding_expression.name",
  "argument.name",
  "attribute_argument.name",
  "tuple_element.name",
  "preproc_if.condition",
  "preproc_elif.condition",
  "preproc_if_in_attribute_list.condition",
]);

const SKIP_NODES = new Set([
  "comment",
  "string_literal",
  "verbatim_string_literal",
  "raw_string_literal",
  "character_literal",
  "integer_literal",
  "real_literal",
  "boolean_literal",
  "null_literal",
  "predefined_type",
  "implicit_type",
  "this",
  "base",
  "discard",
  "preproc_region",
  "preproc_endregion",
  "preproc_pragma",
  "preproc_define",
  "preproc_undef",
  "preproc_nullable",
  "preproc_line",
  "preproc_error",
  "preproc_warning",
  "modifier",
  "attribute_target_specifier",
]);

const NOT_TYPE_NAMES = new Set(["var", "nameof", "value", "dynamic", "_", "global"]);

/**
 * Reads both sides of every #if. When that does not parse (an #if splits a
 * declaration), reads the file in two consistent configurations instead: the
 * assembly's own symbols, and those with every symbol the file tests flipped.
 * Each reading keeps line numbers, so References point at the real source.
 */
export function readFile(path: string, assembly: string, text: string, defines: Set<string> = new Set()): FileFacts {
  const both = readText(path, assembly, text);
  if (!both.parseErrors || !hasIf(text)) return both;
  const flipped = new Set(defines);
  for (const s of conditionSymbols(text)) {
    if (flipped.has(s)) flipped.delete(s);
    else flipped.add(s);
  }
  // the assembly's own configuration must parse: the flipped one alone can be
  // nearly empty (a file wrapped in `#if !X`)
  const own = readText(path, assembly, configure(text, defines));
  if (own.parseErrors) return both;
  const other = readText(path, assembly, configure(text, flipped));
  return other.parseErrors ? own : mergeSides(own, other);
}

/** One file read twice: types once (members joined), References from both. */
function mergeSides(a: FileFacts, b: FileFacts): FileFacts {
  const byKey = new Map(a.types.map((t) => [t.key, t]));
  const types = [...a.types];
  for (const t of b.types) {
    const same = byKey.get(t.key);
    if (!same) {
      types.push(t);
      byKey.set(t.key, t);
      continue;
    }
    const seen = new Set(same.members.map((m) => `${m.kind}\u0000${m.name}\u0000${m.line}`));
    for (const m of t.members) if (!seen.has(`${m.kind}\u0000${m.name}\u0000${m.line}`)) same.members.push(m);
  }
  return { ...a, types, refs: [...a.refs, ...b.refs], globalUsings: [...new Set([...a.globalUsings, ...b.globalUsings])] };
}

function readText(path: string, assembly: string, text: string): FileFacts {
  const tree = parser.parse(text, null, { bufferSize: Math.max(32 * 1024, text.length * 2 + 16) });
  const root = liteTree(tree, text, CSharp as object);
  const facts: FileFacts = {
    path,
    assembly,
    types: [],
    refs: [],
    globalUsings: [],
    parseErrors: root.hasError,
  };
  const reader = new Reader(facts);
  const scope: Scope = { ns: "", parent: null, usings: [], aliases: new Map(), staticUsings: [] };
  reader.container(root, { scope, type: null, member: "", methodTypeParams: null, locals: null });
  return facts;
}

class Reader {
  facts: FileFacts;

  constructor(facts: FileFacts) {
    this.facts = facts;
  }

  // ---- containers: compilation unit, namespace bodies, type bodies -------

  container(node: Node, ctx: Ctx): Ctx {
    for (const child of node.namedChildren) ctx = this.containerChild(child, ctx);
    return ctx;
  }

  /** Returns the context for the following siblings (a file-scoped namespace changes it). */
  containerChild(child: Node, ctx: Ctx): Ctx {
    const t = child.type;
    if (t === "using_directive") {
      this.usingDirective(child, ctx.scope);
    } else if (t === "namespace_declaration") {
      const scope = this.namespaceScope(child, ctx.scope);
      const body = child.childForFieldName("body");
      if (body) this.container(body, { ...ctx, scope });
    } else if (t === "file_scoped_namespace_declaration") {
      const scope = this.namespaceScope(child, ctx.scope);
      const inner = { ...ctx, scope };
      for (const c of child.namedChildren) if (c.type !== "comment" && child.childForFieldName("name")?.id !== c.id) this.containerChild(c, inner);
      return inner;
    } else if (t in TYPE_DECLARATIONS) {
      this.typeDeclaration(child, ctx);
    } else if (t === "preproc_if" || t === "preproc_elif" || t === "preproc_else" || t === "declaration_list" || t === "ERROR") {
      let inner = ctx;
      for (let i = 0; i < child.childCount; i++) {
        const c = child.child(i);
        if (!c || !c.isNamed || child.fieldNameForChild(i) === "condition") continue;
        inner = this.containerChild(c, inner);
      }
      return t === "ERROR" ? inner : ctx;
    } else if (ctx.type && ctx.type.kind !== "enum") {
      this.memberDeclaration(child, ctx);
    }
    return ctx;
  }

  namespaceScope(node: Node, parent: Scope): Scope {
    const nameNode = node.childForFieldName("name");
    const name = nameNode ? nameText(nameNode) : "";
    const ns = parent.ns ? `${parent.ns}.${name}` : name;
    return { ns, parent, usings: [], aliases: new Map(), staticUsings: [] };
  }

  usingDirective(node: Node, scope: Scope) {
    let isStatic = false;
    let isGlobal = false;
    let target: Node | null = null;
    const alias = node.childForFieldName("name");
    for (const c of node.children) {
      if (c.type === "static") isStatic = true;
      else if (c.type === "global") isGlobal = true;
      else if (c.isNamed && c.id !== alias?.id && c.type !== "comment") target = c;
    }
    if (!target) return;
    const name = nameSyntax(target);
    if (!name) return;
    if (alias) scope.aliases.set(alias.text, name);
    else if (isStatic) scope.staticUsings.push(name);
    else {
      const dotted = name.segs.map((s) => s.name).join(".");
      if (isGlobal) this.facts.globalUsings.push(dotted);
      else scope.usings.push(dotted);
    }
  }

  // ---- type declarations ------------------------------------------------

  typeDeclaration(node: Node, ctx: Ctx) {
    let kind = TYPE_DECLARATIONS[node.type];
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const name = nameNode.text;
    const modifiers: string[] = [];
    const typeParams: string[] = [];
    for (const c of node.children) {
      if (c.type === "modifier") modifiers.push(c.text);
      else if (c.type === "struct" && kind === "record") kind = "record struct";
      else if (c.type === "type_parameter_list") {
        for (const tp of c.namedChildren) {
          const n = tp.childForFieldName("name");
          if (n) typeParams.push(n.text);
        }
      }
    }
    const outer = ctx.type;
    const namespace = ctx.scope.ns;
    const arity = typeParams.length;
    const local = arity ? `${name}\`${arity}` : name;
    const key = outer ? `${outer.key}+${local}` : namespace ? `${namespace}.${local}` : local;
    const decl: TypeDecl = {
      key,
      name,
      arity,
      namespace,
      outer,
      kind,
      modifiers,
      typeParams,
      scopeTypeParams: [...(outer?.scopeTypeParams ?? []), ...typeParams],
      members: [],
      scope: ctx.scope,
      file: this.facts.path,
      line: node.startPosition.row + 1,
    };
    this.facts.types.push(decl);
    const typeCtx: Ctx = { scope: ctx.scope, type: decl, member: name, methodTypeParams: null, locals: null };

    for (const c of node.namedChildren) {
      switch (c.type) {
        case "attribute_list":
          this.attributes(c, typeCtx, true);
          break;
        case "base_list":
          if (kind !== "enum") this.baseList(c, typeCtx);
          break;
        case "type_parameter_constraints_clause":
          this.constraints(c, typeCtx);
          break;
        case "parameter_list": {
          if (kind === "delegate") break; // read below with the return type
          // record positional parameters are properties; other primary constructors are not
          const isRecord = kind === "record" || kind === "record struct";
          const types = this.parameters(c, { ...typeCtx, member: isRecord ? name : `${name}()`, locals: new Set() }, isRecord ? "has" : "uses");
          if (isRecord) {
            for (const p of c.namedChildren) {
              if (p.type !== "parameter") continue;
              const pn = p.childForFieldName("name");
              const pt = p.childForFieldName("type");
              if (pn) decl.members.push(member("property", pn.text, pt ? compact(pt.text) : null, null, "public", [], false, p));
            }
          } else {
            decl.members.push(member("ctor", name, null, types, "public", [], false, c));
          }
          break;
        }
        case "declaration_list":
          this.container(c, typeCtx);
          break;
        case "enum_member_declaration_list":
          this.enumMembers(c, typeCtx);
          break;
      }
    }
    if (kind === "delegate") {
      const returns = node.childForFieldName("type");
      if (returns) this.type(returns, { ...typeCtx, member: "signature" }, "uses");
      const params = node.childForFieldName("parameters");
      const types = params ? this.parameters(params, { ...typeCtx, member: "signature", locals: new Set() }, "uses") : [];
      decl.members.push(member("method", "Invoke", returns ? compact(returns.text) : null, types, "public", [], false, node));
    }
  }

  baseList(node: Node, ctx: Ctx) {
    const c2 = { ...ctx, member: "base type" };
    for (const c of node.namedChildren) {
      if (c.type === "argument_list") this.expr(c, c2);
      else if (c.type === "primary_constructor_base_type") {
        const t = c.childForFieldName("type");
        if (t) this.type(t, c2, "base");
        for (const a of c.namedChildren) if (a.type === "argument_list") this.expr(a, c2);
      } else if (c.type !== "comment") this.type(c, c2, "base");
    }
  }

  constraints(node: Node, ctx: Ctx) {
    const c2 = { ...ctx, member: "constraint" };
    for (const c of node.namedChildren) {
      if (c.type !== "type_parameter_constraint") continue;
      const t = c.childForFieldName("type");
      if (t) this.type(t, c2, "uses");
    }
  }

  enumMembers(node: Node, ctx: Ctx) {
    for (const c of node.namedChildren) {
      if (c.type === "enum_member_declaration") {
        const n = c.childForFieldName("name");
        if (!n) continue;
        ctx.type!.members.push(member("enum-value", n.text, null, null, "public", [], false, c));
        const value = c.childForFieldName("value");
        if (value) this.expr(value, { ...ctx, member: n.text, locals: new Set() });
      } else if (c.type.startsWith("preproc_")) {
        this.enumMembers(c, ctx);
      }
    }
  }

  // ---- members ----------------------------------------------------------

  memberDeclaration(node: Node, ctx: Ctx) {
    const decl = ctx.type!;
    const mods: string[] = [];
    const attrs: Node[] = [];
    let explicitInterface: Node | null = null;
    for (const c of node.children) {
      if (c.type === "modifier") mods.push(c.text);
      else if (c.type === "attribute_list") attrs.push(c);
      else if (c.type === "explicit_interface_specifier") explicitInterface = c;
    }
    const access = accessOf(mods, decl.kind, explicitInterface !== null);
    const serialized = attrs.some((a) => hasSerializeAttribute(a));
    const t = node.type;

    const run = (label: string, fn: (c: Ctx) => void) => {
      const c: Ctx = { ...ctx, member: label, locals: new Set() };
      for (const a of attrs) this.attributes(a, c);
      if (explicitInterface) for (const n of explicitInterface.namedChildren) this.type(n, c, "uses");
      fn(c);
    };

    switch (t) {
      case "field_declaration":
      case "event_field_declaration": {
        const vd = node.namedChildren.find((c) => c.type === "variable_declaration");
        if (!vd) return;
        const typeNode = vd.childForFieldName("type");
        const declarators = vd.namedChildren.filter((c) => c.type === "variable_declarator");
        const names = declarators.map((d) => d.childForFieldName("name")?.text ?? "?");
        const isEvent = t === "event_field_declaration";
        const kind: MemberKind = isEvent ? "event" : mods.includes("const") ? "const" : "field";
        run(names[0] ?? "?", (c) => {
          if (typeNode) this.type(typeNode, c, isEvent ? "uses" : "has");
          for (const d of declarators) {
            for (const v of d.namedChildren) if (v.id !== d.childForFieldName("name")?.id) this.expr(v, c);
          }
        });
        for (let i = 0; i < declarators.length; i++) {
          decl.members.push(member(kind, names[i], typeNode ? compact(typeNode.text) : null, null, access, mods, serialized, declarators[i]));
        }
        return;
      }
      case "property_declaration":
      case "indexer_declaration":
      case "event_declaration": {
        const typeNode = node.childForFieldName("type");
        const name = t === "indexer_declaration" ? "this" : (node.childForFieldName("name")?.text ?? "?");
        let params: string[] | null = null;
        run(t === "indexer_declaration" ? "this[]" : name, (c) => {
          if (typeNode) this.type(typeNode, c, t === "event_declaration" ? "uses" : "has");
          for (let i = 0; i < node.childCount; i++) {
            const ch = node.child(i)!;
            const f = node.fieldNameForChild(i);
            if (!ch.isNamed || f === "type" || f === "name" || ch.type === "modifier" || ch.type === "attribute_list" || ch.type === "explicit_interface_specifier") continue;
            if (ch.type === "bracketed_parameter_list") params = this.parameters(ch, c, "uses");
            else if (ch.type === "accessor_list") {
              for (const acc of ch.namedChildren) {
                for (const a of acc.namedChildren) if (a.type === "attribute_list") this.attributes(a, c);
                const body = acc.childForFieldName("body");
                if (body) this.expr(body, { ...c, locals: new Set(["value"]) });
              }
            } else this.expr(ch, c);
          }
        });
        const kind: MemberKind = t === "indexer_declaration" ? "indexer" : t === "event_declaration" ? "event" : "property";
        decl.members.push(member(kind, name, typeNode ? compact(typeNode.text) : null, params, access, mods, serialized, node));
        return;
      }
      case "method_declaration":
      case "constructor_declaration":
      case "destructor_declaration":
      case "operator_declaration":
      case "conversion_operator_declaration": {
        const nameNode = node.childForFieldName("name");
        const typeParams: string[] = [];
        const tpl = node.childForFieldName("type_parameters");
        if (tpl) for (const tp of tpl.namedChildren) tp.childForFieldName("name") && typeParams.push(tp.childForFieldName("name")!.text);
        const returns = node.childForFieldName(t === "method_declaration" ? "returns" : "type");
        let name: string;
        let kind: MemberKind;
        if (t === "method_declaration") {
          name = nameNode?.text ?? "?";
          kind = "method";
        } else if (t === "constructor_declaration") {
          name = decl.name;
          kind = "ctor";
        } else if (t === "destructor_declaration") {
          name = `~${decl.name}`;
          kind = "dtor";
        } else if (t === "operator_declaration") {
          name = `operator ${node.childForFieldName("operator")?.text ?? ""}`;
          kind = "operator";
        } else {
          const implicit = node.children.some((c) => c.type === "implicit");
          name = `${implicit ? "implicit" : "explicit"} operator`;
          kind = "operator";
        }
        let params: string[] = [];
        const label = `${name}()`;
        run(label, (c) => {
          c.methodTypeParams = typeParams.length ? [...(ctx.methodTypeParams ?? []), ...typeParams] : ctx.methodTypeParams;
          if (returns) this.type(returns, c, "uses");
          for (const ch of node.namedChildren) {
            switch (ch.type) {
              case "parameter_list":
                params = this.parameters(ch, c, "uses");
                break;
              case "type_parameter_constraints_clause":
                this.constraints(ch, c);
                break;
              case "constructor_initializer":
                this.expr(ch, c);
                break;
              case "block":
              case "arrow_expression_clause":
                this.expr(ch, c);
                break;
            }
          }
        });
        decl.members.push(member(kind, name, returns ? compact(returns.text) : null, params, access, mods, serialized, node));
        return;
      }
      case "delegate_declaration":
      case "class_declaration":
      case "struct_declaration":
      case "interface_declaration":
      case "enum_declaration":
      case "record_declaration":
        this.typeDeclaration(node, ctx);
        return;
      default:
        if (!SKIP_NODES.has(t)) this.expr(node, { ...ctx, member: decl.name, locals: new Set() });
    }
  }

  /** Visits a parameter list; returns the parameter types as written. */
  parameters(node: Node, ctx: Ctx, role: RefRole): string[] {
    const types: string[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i)!;
      if (!c.isNamed) continue;
      const field = node.fieldNameForChild(i);
      if (c.type === "parameter") {
        const pt = c.childForFieldName("type");
        const pn = c.childForFieldName("name");
        const mods = c.namedChildren.filter((m) => m.type === "modifier").map((m) => m.text);
        if (pt) {
          this.type(pt, ctx, role);
          types.push([...mods, compact(pt.text)].join(" "));
        } else types.push(pn?.text ?? "?");
        if (pn) ctx.locals?.add(pn.text);
        for (const x of c.namedChildren) {
          if (x.type === "attribute_list") this.attributes(x, ctx);
          else if (x.id !== pt?.id && x.id !== pn?.id && x.type !== "modifier") this.expr(x, ctx);
        }
      } else if (field === "type") {
        this.type(c, ctx, role);
        types.push(`params ${compact(c.text)}`);
      } else if (field === "name") {
        ctx.locals?.add(c.text);
      } else if (c.type === "attribute_list") {
        this.attributes(c, ctx);
      }
    }
    return types;
  }

  /** On a type declaration, each attribute is its own member label: `[RequireComponent]`. */
  attributes(list: Node, ctx: Ctx, onType = false) {
    for (const a of list.namedChildren) {
      if (a.type === "attribute") {
        const n = a.childForFieldName("name");
        const name = n ? nameSyntax(n) : null;
        if (onType) ctx = { ...ctx, member: `[${n ? compact(n.text) : "?"}]` };
        if (name) this.ref(name, ctx, "uses", n!, false, true);
        if (n) this.typeArgsOf(n, ctx, "uses");
        for (const args of a.namedChildren) {
          if (args.type !== "attribute_argument_list") continue;
          for (const arg of args.namedChildren) {
            for (let i = 0; i < arg.childCount; i++) {
              const x = arg.child(i)!;
              if (x.isNamed && arg.fieldNameForChild(i) !== "name") this.expr(x, { ...ctx, locals: ctx.locals ?? new Set() });
            }
          }
        }
      } else if (a.type.startsWith("preproc_")) {
        this.attributes(a, ctx, onType);
      }
    }
  }

  // ---- types ------------------------------------------------------------

  type(node: Node, ctx: Ctx, role: RefRole) {
    const argRole: RefRole = role === "has" ? "has" : "uses";
    switch (node.type) {
      case "identifier":
      case "generic_name":
      case "qualified_name":
      case "alias_qualified_name": {
        const name = nameSyntax(node);
        if (name) this.ref(name, ctx, role, node, false, false);
        this.typeArgsOf(node, ctx, argRole);
        return;
      }
      case "predefined_type":
      case "implicit_type":
        return;
      case "array_type":
      case "nullable_type":
      case "pointer_type":
      case "ref_type":
      case "scoped_type": {
        for (const c of node.namedChildren) {
          if (c.type === "array_rank_specifier") this.expr(c, ctx);
          else this.type(c, ctx, role);
        }
        return;
      }
      case "tuple_type":
        for (const el of node.namedChildren) {
          const t = el.childForFieldName("type");
          if (t) this.type(t, ctx, role);
        }
        return;
      case "function_pointer_type":
        for (const c of node.namedChildren) {
          if (c.type === "function_pointer_parameter") {
            const t = c.childForFieldName("type");
            if (t) this.type(t, ctx, "uses");
          } else this.type(c, ctx, "uses");
        }
        return;
      default:
        this.expr(node, ctx);
    }
  }

  /** Visits the type arguments inside a (possibly qualified) generic name. */
  typeArgsOf(node: Node, ctx: Ctx, role: RefRole) {
    if (node.type === "generic_name") {
      for (const c of node.namedChildren) {
        if (c.type === "type_argument_list") for (const a of c.namedChildren) this.type(a, ctx, role);
      }
    } else if (node.type === "qualified_name" || node.type === "alias_qualified_name") {
      for (const c of node.namedChildren) this.typeArgsOf(c, ctx, role);
    }
  }

  // ---- code bodies --------------------------------------------------------

  expr(node: Node, ctx: Ctx) {
    const t = node.type;
    if (SKIP_NODES.has(t)) return;
    switch (t) {
      case "identifier":
        if (!NOT_TYPE_NAMES.has(node.text)) this.ref({ global: false, segs: [{ name: node.text, arity: 0 }] }, ctx, "uses", node, true, false);
        return;
      case "generic_name": {
        const name = nameSyntax(node);
        if (name) this.ref(name, ctx, "uses", node, true, false);
        this.typeArgsOf(node, ctx, "uses");
        return;
      }
      case "qualified_name":
      case "alias_qualified_name": {
        const name = nameSyntax(node);
        if (name) this.ref(name, ctx, "uses", node, true, false);
        this.typeArgsOf(node, ctx, "uses");
        return;
      }
      case "member_access_expression":
        this.memberAccess(node, ctx);
        return;
      case "member_binding_expression": {
        // `x?.GetComponent<Foo>()`: the member name is not a type, its type arguments are
        const nm = node.childForFieldName("name");
        if (nm) this.typeArgsOf(nm, ctx, "uses");
        return;
      }
      case "invocation_expression": {
        const fn = node.childForFieldName("function");
        if (fn) {
          if (fn.type === "identifier") {
            // a method call, never a type
          } else if (fn.type === "generic_name") this.typeArgsOf(fn, ctx, "uses");
          else this.expr(fn, ctx);
        }
        for (const c of node.namedChildren) if (c.id !== fn?.id) this.expr(c, ctx);
        return;
      }
      case "initializer_expression": {
        // object initializers: `new Foo { Hull = 3 }` names Foo's members on the left
        const p = node.parent?.type;
        const memberInit = p === "object_creation_expression" || p === "implicit_object_creation_expression" || p === "with_expression" || p === "anonymous_object_creation_expression";
        for (const c of node.namedChildren) {
          if (memberInit && c.type === "assignment_expression") {
            const left = c.childForFieldName("left");
            for (const x of c.namedChildren) if (x.id !== left?.id || left.type !== "identifier") this.expr(x, ctx);
          } else this.expr(c, ctx);
        }
        return;
      }
      case "anonymous_object_creation_expression":
        for (const c of node.namedChildren) {
          if (c.type === "assignment_expression") {
            const right = c.childForFieldName("right");
            if (right) this.expr(right, ctx);
          } else if (c.type !== "identifier") this.expr(c, ctx);
        }
        return;
      case "subpattern": {
        const kids = node.namedChildren;
        for (let i = 0; i < kids.length; i++) {
          if (i === 0 && kids.length > 1 && (kids[0].type === "identifier" || kids[0].type === "member_access_expression")) continue;
          this.expr(kids[i], ctx);
        }
        return;
      }
      case "lambda_expression":
      case "anonymous_method_expression": {
        const inner = { ...ctx, locals: ctx.locals ?? new Set<string>() };
        for (let i = 0; i < node.childCount; i++) {
          const c = node.child(i)!;
          if (!c.isNamed) continue;
          const f = node.fieldNameForChild(i);
          if (c.type === "implicit_parameter" || (f === "parameters" && c.type === "identifier")) inner.locals.add(c.text);
          else if (c.type === "parameter_list") this.parameters(c, inner, "uses");
          else if (f === "type") this.type(c, inner, "uses");
          else if (c.type !== "modifier") this.expr(c, inner);
        }
        return;
      }
      case "local_function_statement": {
        const n = node.childForFieldName("name");
        if (n) ctx.locals?.add(n.text);
        const typeParams: string[] = [];
        const tpl = node.childForFieldName("type_parameters");
        if (tpl) for (const tp of tpl.namedChildren) tp.childForFieldName("name") && typeParams.push(tp.childForFieldName("name")!.text);
        const inner = { ...ctx, methodTypeParams: [...(ctx.methodTypeParams ?? []), ...typeParams] };
        for (let i = 0; i < node.childCount; i++) {
          const c = node.child(i)!;
          if (!c.isNamed) continue;
          const f = node.fieldNameForChild(i);
          if (f === "name" || f === "type_parameters" || c.type === "modifier") continue;
          if (f === "type") this.type(c, inner, "uses");
          else if (c.type === "parameter_list") this.parameters(c, inner, "uses");
          else if (c.type === "type_parameter_constraints_clause") this.constraints(c, inner);
          else if (c.type === "attribute_list") this.attributes(c, inner);
          else this.expr(c, inner);
        }
        return;
      }
      case "labeled_statement":
      case "goto_statement":
        for (const c of node.namedChildren) if (c.type !== "identifier") this.expr(c, ctx);
        return;
      case "query_expression":
      case "from_clause":
      case "let_clause":
      case "join_clause":
      case "join_into_clause":
      case "query_continuation":
      case "group_clause":
        for (let i = 0; i < node.childCount; i++) {
          const c = node.child(i)!;
          if (!c.isNamed) continue;
          const f = node.fieldNameForChild(i);
          if (f === "type") this.type(c, ctx, "uses");
          else if (c.type === "identifier" && t !== "query_expression" && t !== "group_clause") ctx.locals?.add(c.text);
          else this.expr(c, ctx);
        }
        return;
      case "type_argument_list":
        for (const a of node.namedChildren) this.type(a, ctx, "uses");
        return;
      case "attribute_list":
        this.attributes(node, ctx);
        return;
    }
    if (t in TYPE_DECLARATIONS) {
      // local types are rare; read them as declarations of the enclosing type
      if (ctx.type) this.typeDeclaration(node, ctx);
      return;
    }
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i)!;
      if (!c.isNamed) continue;
      const f = node.fieldNameForChild(i);
      const key = `${t}.${f ?? ""}`;
      if (SKIP_FIELDS.has(key)) continue;
      if (LOCAL_NAME_FIELDS.has(key) && c.type === "identifier") {
        ctx.locals?.add(c.text);
        continue;
      }
      if (TYPE_FIELDS.has(key)) this.type(c, ctx, "uses");
      else this.expr(c, ctx);
    }
  }

  /** `A.B.C.D()`: the left end may name a namespace, then a type. */
  memberAccess(node: Node, ctx: Ctx) {
    const segs: NameSeg[] = [];
    const generics: Node[] = [];
    let n: Node = node;
    while (n.type === "member_access_expression") {
      const nm = n.childForFieldName("name");
      if (nm) {
        segs.unshift(seg(nm));
        if (nm.type === "generic_name") generics.push(nm);
      }
      const e = n.childForFieldName("expression");
      if (!e) break;
      n = e;
    }
    for (const g of generics) this.typeArgsOf(g, ctx, "uses");
    if (n.type === "identifier" || n.type === "generic_name" || n.type === "qualified_name" || n.type === "alias_qualified_name") {
      const left = nameSyntax(n);
      if (left && !NOT_TYPE_NAMES.has(left.segs[0].name)) this.ref({ global: left.global, segs: [...left.segs, ...segs] }, ctx, "uses", n, true, false);
      this.typeArgsOf(n, ctx, "uses");
    } else {
      this.expr(n, ctx);
    }
  }

  ref(name: NameSyntax, ctx: Ctx, role: RefRole, node: Node, expr: boolean, attribute: boolean) {
    if (!ctx.type || name.segs.length === 0) return;
    const r: RawRef = {
      name,
      expr,
      attribute,
      role,
      from: ctx.type,
      member: ctx.member,
      line: node.startPosition.row + 1,
      scope: ctx.scope,
      methodTypeParams: ctx.methodTypeParams,
      locals: ctx.locals,
    };
    this.facts.refs.push(r);
  }
}

// ---- helpers ----------------------------------------------------------------

function seg(node: Node): NameSeg {
  if (node.type === "generic_name") {
    const id = node.namedChildren.find((c) => c.type === "identifier");
    const args = node.namedChildren.find((c) => c.type === "type_argument_list");
    let arity = 0;
    if (args) {
      arity = args.namedChildCount;
      if (arity === 0) arity = args.children.filter((c) => c.type === ",").length + 1; // Foo<,>
    }
    return { name: id?.text ?? node.text, arity };
  }
  return { name: node.text, arity: 0 };
}

export function nameSyntax(node: Node): NameSyntax | null {
  switch (node.type) {
    case "identifier":
    case "generic_name":
      return { global: false, segs: [seg(node)] };
    case "qualified_name": {
      const q = node.childForFieldName("qualifier");
      const n = node.childForFieldName("name");
      const left = q ? nameSyntax(q) : null;
      if (!left || !n) return null;
      return { global: left.global, segs: [...left.segs, seg(n)] };
    }
    case "alias_qualified_name": {
      const alias = node.childForFieldName("alias");
      const n = node.childForFieldName("name");
      if (!n) return null;
      return { global: alias?.text === "global", segs: [seg(n)] };
    }
    default:
      return null;
  }
}

function nameText(node: Node): string {
  const n = nameSyntax(node);
  return n ? n.segs.map((s) => s.name).join(".") : compact(node.text);
}

function compact(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\s*([<>,\[\]()])\s*/g, (_, c) => (c === "," ? ", " : c)).trim();
}

function accessOf(mods: string[], kind: TypeKind, explicitInterface: boolean): Access {
  if (explicitInterface) return "private";
  const has = (m: string) => mods.includes(m);
  if (has("public")) return "public";
  if (has("protected") && has("internal")) return "protected internal";
  if (has("private") && has("protected")) return "private protected";
  if (has("protected")) return "protected";
  if (has("internal")) return "internal";
  if (has("private")) return "private";
  return kind === "interface" ? "public" : "private";
}

function hasSerializeAttribute(list: Node): boolean {
  for (const a of list.namedChildren) {
    if (a.type !== "attribute") continue;
    const n = a.childForFieldName("name");
    const name = n ? nameSyntax(n) : null;
    const last = name?.segs[name.segs.length - 1].name ?? "";
    if (/^(SerializeField|SerializeReference)(Attribute)?$/.test(last)) return true;
  }
  return false;
}

function member(
  kind: MemberKind,
  name: string,
  type: string | null,
  params: string[] | null,
  access: Access,
  mods: string[],
  serialized: boolean,
  node: Node,
): MemberDecl {
  return {
    kind,
    name,
    type,
    params,
    access: kind === "enum-value" ? "public" : access,
    isStatic: mods.includes("static") || kind === "const",
    isAbstract: mods.includes("abstract"),
    serialized: serialized && (kind === "field" || kind === "property"),
    line: node.startPosition.row + 1,
  };
}
