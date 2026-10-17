// Our own C# name resolution: enclosing types, namespaces, using
// directives, `using X =` aliases. Not compiler-exact (ADR 0003), but it
// follows the C# lookup order closely enough for type-level edges.

import type { MemberDecl, NameSeg, NameSyntax, RawRef, Scope, TypeDecl, TypeKind } from "./facts.js";
import type { LibraryInfo } from "../unity/libraries.js";

export interface OwnType {
  key: string;
  name: string;
  arity: number;
  namespace: string;
  outer: OwnType | null;
  kind: TypeKind;
  modifiers: Set<string>;
  typeParams: string[];
  parts: TypeDecl[];
  members: MemberDecl[];
  memberNames: Set<string>;
  nested: Map<string, OwnType[]>;
  assembly: string;
  baseClass: OwnType | null;
  foreignBase: ForeignType | null;
}

export interface ForeignType {
  full: string;
  name: string;
  arity: number;
  namespace: string;
  lib: LibraryInfo;
  isInterface: boolean;
}

export type Target = { own: OwnType; foreign?: undefined } | { foreign: ForeignType; own?: undefined };

type Found = { type: Target } | { ns: string } | "typeParam" | null;

export class Resolver {
  private byNs = new Map<string, Map<string, Target[]>>();
  private namespaces = new Set<string>([""]);
  private levelCache = new WeakMap<Scope, { ns: string; lex: Scope | null }[]>();
  private usingCache = new WeakMap<Scope, string[]>();
  private globalUsings: string[] = [];

  constructor(own: Iterable<OwnType>, foreign: Iterable<ForeignType>, globalUsings: string[]) {
    for (const t of own) if (!t.outer) this.add(t.namespace, t.name, { own: t });
    for (const f of foreign) this.add(f.namespace, f.name, { foreign: f });
    this.globalUsings = globalUsings.filter((u) => this.namespaces.has(u));
  }

  private add(ns: string, name: string, target: Target) {
    let names = this.byNs.get(ns);
    if (!names) this.byNs.set(ns, (names = new Map()));
    const list = names.get(name);
    if (list) list.push(target);
    else names.set(name, [target]);
    for (let n = ns; n; n = n.includes(".") ? n.slice(0, n.lastIndexOf(".")) : "") this.namespaces.add(n);
  }

  /**
   * Resolves a Reference to the type it names, or null. `via` collects the
   * own types a qualified name passes through on the way to a nested type:
   * `EventBus.GameEvents` names EventBus too.
   */
  resolve(ref: RawRef, from: OwnType, via?: OwnType[]): Target | null {
    const segs = ref.name.segs;
    if (ref.expr) {
      const first = segs[0].name;
      if (ref.locals?.has(first)) return null;
      if (hidesAsMember(from, first)) return null;
    }
    if (ref.attribute) {
      // [Foo] means FooAttribute or Foo
      const last = segs[segs.length - 1];
      if (!last.name.endsWith("Attribute")) {
        const withSuffix = this.resolveName({ global: ref.name.global, segs: [...segs.slice(0, -1), { name: last.name + "Attribute", arity: last.arity }] }, ref, from, false, via);
        if (withSuffix) return withSuffix;
      }
    }
    return this.resolveName(ref.name, ref, from, false, via);
  }

  /** Resolves a base-list entry, before nested lookup through base classes is possible. */
  resolveBase(ref: RawRef, from: OwnType, via?: OwnType[]): Target | null {
    return this.resolveName(ref.name, ref, from, true, via);
  }

  private resolveName(name: NameSyntax, ref: RawRef, from: OwnType, noInheritedNested = false, via?: OwnType[]): Target | null {
    const segs = name.segs;
    let cur = this.first(segs[0], name.global, ref, from, noInheritedNested);
    if (cur === null || cur === "typeParam") return null;
    const passed: OwnType[] = [];
    for (let i = 1; i < segs.length; i++) {
      const s = segs[i];
      if ("ns" in cur) {
        const t = this.lookupNs(cur.ns, s);
        if (t) cur = { type: t };
        else {
          const ns: string = cur.ns ? `${cur.ns}.${s.name}` : s.name;
          if (!this.namespaces.has(ns)) return null;
          cur = { ns };
        }
      } else if (cur.type.own) {
        const n = nestedIn(cur.type.own, s, !noInheritedNested);
        if (!n) break; // a member of the type: the Reference is to the type
        passed.push(cur.type.own);
        cur = { type: { own: n } };
      } else {
        break;
      }
    }
    if ("ns" in cur) return null;
    via?.push(...passed);
    return cur.type;
  }

  private first(s: NameSeg, global: boolean, ref: RawRef, from: OwnType, noInheritedNested: boolean): Found {
    if (global) {
      const t = this.lookupNs("", s);
      if (t) return { type: t };
      return this.namespaces.has(s.name) ? { ns: s.name } : null;
    }
    if (s.arity === 0 && (ref.from.scopeTypeParams.includes(s.name) || ref.methodTypeParams?.includes(s.name))) return "typeParam";
    for (let t: OwnType | null = from; t; t = t.outer) {
      if (t.name === s.name && t.arity === s.arity && t !== from) return { type: { own: t } };
      const n = nestedIn(t, s, !noInheritedNested);
      if (n) return { type: { own: n } };
    }
    for (const level of this.levels(ref.scope)) {
      const t = this.lookupNs(level.ns, s);
      if (t) return { type: t };
      const ns = level.ns ? `${level.ns}.${s.name}` : s.name;
      if (this.namespaces.has(ns)) return { ns };
      const lex = level.lex;
      const usings = lex ? this.usingsOf(lex) : [];
      if (lex) {
        const alias = lex.aliases.get(s.name);
        if (alias) {
          const a = this.resolveAlias(alias, lex);
          if (a) return a;
        }
      }
      const imported = level.ns === "" ? [...usings, ...this.globalUsings] : usings;
      let foreign: Target | null = null;
      for (const u of imported) {
        const t = this.lookupNs(u, s);
        if (t?.own) return { type: t };
        if (t && !foreign) foreign = t;
      }
      if (foreign) return { type: foreign };
      if (lex) {
        for (const st of lex.staticUsings) {
          const host = this.resolveAlias(st, lex);
          if (host && "type" in host && host.type.own) {
            const n = nestedIn(host.type.own, s, true);
            if (n) return { type: { own: n } };
          }
        }
      }
    }
    return null;
  }

  private resolveAlias(name: NameSyntax, lex: Scope): { type: Target } | { ns: string } | null {
    // alias targets are written relative to the enclosing namespace, ignoring other usings
    const candidates = [""];
    for (const l of this.levels(lex)) if (l.ns) candidates.unshift(l.ns);
    for (const base of [...new Set(["", ...candidates])]) {
      let cur: { type: Target } | { ns: string } | null = { ns: base };
      for (const s of name.segs) {
        if (!cur) break;
        if ("ns" in cur) {
          const t = this.lookupNs(cur.ns, s);
          if (t) cur = { type: t };
          else {
            const ns: string = cur.ns ? `${cur.ns}.${s.name}` : s.name;
            cur = this.namespaces.has(ns) ? { ns } : null;
          }
        } else if (cur.type.own) {
          const n = nestedIn(cur.type.own, s, true);
          cur = n ? { type: { own: n } } : null;
        } else cur = null;
      }
      if (cur && !("ns" in cur && cur.ns === base)) return cur;
    }
    return null;
  }

  private usingsOf(scope: Scope): string[] {
    let cached = this.usingCache.get(scope);
    if (cached) return cached;
    cached = [];
    const levels = this.levels(scope).map((l) => l.ns);
    for (const u of scope.usings) {
      if (this.namespaces.has(u)) cached.push(u);
      else {
        const rel = levels.map((l) => (l ? `${l}.${u}` : u)).find((n) => this.namespaces.has(n));
        if (rel) cached.push(rel);
      }
    }
    this.usingCache.set(scope, cached);
    return cached;
  }

  /** Namespace levels from the innermost out, with the namespace block declared at each. */
  private levels(scope: Scope): { ns: string; lex: Scope | null }[] {
    let cached = this.levelCache.get(scope);
    if (cached) return cached;
    cached = [];
    let lex: Scope | null = scope;
    let ns = scope.ns;
    for (;;) {
      const here: Scope | null = lex && lex.ns === ns ? lex : null;
      cached.push({ ns, lex: here });
      if (here) lex = here.parent;
      if (ns === "") break;
      ns = ns.includes(".") ? ns.slice(0, ns.lastIndexOf(".")) : "";
    }
    this.levelCache.set(scope, cached);
    return cached;
  }

  private lookupNs(ns: string, s: NameSeg): Target | null {
    const list = this.byNs.get(ns)?.get(s.name);
    if (!list) return null;
    return (
      list.find((t) => t.own && t.own.arity === s.arity) ??
      list.find((t) => t.foreign && t.foreign.arity === s.arity) ??
      list.find((t) => t.own) ??
      list[0] ??
      null
    );
  }
}

function nestedIn(t: OwnType, s: NameSeg, throughBases: boolean): OwnType | null {
  const seen = new Set<OwnType>();
  for (let cur: OwnType | null = t; cur && !seen.has(cur); cur = throughBases ? cur.baseClass : null) {
    seen.add(cur);
    const list = cur.nested.get(s.name);
    if (list) return list.find((n) => n.arity === s.arity) ?? list[0];
  }
  return null;
}

/** True when a member of the type (or an enclosing or own base type) has this name. */
function hidesAsMember(from: OwnType, name: string): boolean {
  for (let t: OwnType | null = from; t; t = t.outer) {
    const seen = new Set<OwnType>();
    for (let b: OwnType | null = t; b && !seen.has(b); b = b.baseClass) {
      seen.add(b);
      if (b.memberNames.has(name)) return true;
    }
  }
  return false;
}
