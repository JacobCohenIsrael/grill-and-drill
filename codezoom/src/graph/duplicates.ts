// Duplicates (ADR 0009): own members whose bodies have the same shape. The
// reader keeps a shape for each body of 50 syntax nodes or more, outside
// generated files; here bodies with the same shape are grouped.

import type { MemberDecl } from "../csharp/facts.js";
import type { OwnType } from "../csharp/resolver.js";

/** One member body that has a shape. */
export interface Body {
  /** Its type's key. */
  type: string;
  decl: MemberDecl;
  /** As References name members: `Place()`, `Total.get`. */
  member: string;
  file: string;
  line: number;
  nodes: number;
}

/** Groups of two or more own member bodies with the same shape, in no particular order. */
export function findDuplicates(types: Iterable<OwnType>): Body[][] {
  const byHash = new Map<string, Body[]>();
  for (const t of types) {
    for (const part of t.parts) {
      for (const m of part.members) {
        for (const s of m.shapes ?? []) {
          const body: Body = { type: t.key, decl: m, member: memberLabel(m, s.accessor), file: part.file, line: s.line, nodes: s.nodes };
          const group = byHash.get(s.hash);
          if (group) group.push(body);
          else byHash.set(s.hash, [body]);
        }
      }
    }
  }
  return [...byHash.values()].filter((g) => g.length > 1);
}

/** The label the reader gives References in this member, plus the accessor. */
export function memberLabel(m: MemberDecl, accessor?: string): string {
  const name = m.kind === "indexer" ? "this[]" : m.kind === "property" || m.kind === "event" ? m.name : `${m.name}()`;
  return accessor ? `${name}.${accessor}` : name;
}
