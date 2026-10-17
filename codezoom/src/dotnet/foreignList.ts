// A small, committed stand-in for Unity's DLLs: the foreign type names one
// project mentions, so tests index it the same way on any machine, with or
// without Unity. scripts/extract-foreign-types.mjs writes one.

import type { ForeignType } from "../csharp/resolver.js";
import type { LibraryInfo } from "../unity/libraries.js";

export interface ForeignList {
  about: string;
  libraries: Record<string, { name: string; hidden: boolean }>;
  /** [namespace, name, arity, isInterface, library key] */
  types: [string, string, number, boolean, string][];
}

export function toForeignList(types: ForeignType[], about: string): ForeignList {
  const libraries: ForeignList["libraries"] = {};
  const rows = new Map<string, ForeignList["types"][number]>();
  for (const t of types) {
    libraries[t.lib.key] = { name: t.lib.name, hidden: t.lib.hidden };
    rows.set(`${t.full}\`${t.arity}`, [t.namespace, t.name, t.arity, t.isInterface, t.lib.key]);
  }
  const sorted = [...rows.values()].sort((a, b) => `${a[0]}.${a[1]}`.localeCompare(`${b[0]}.${b[1]}`) || a[2] - b[2]);
  return { about, libraries, types: sorted };
}

export function fromForeignList(list: ForeignList): ForeignType[] {
  const libs = new Map<string, LibraryInfo>(Object.entries(list.libraries).map(([key, l]) => [key, { key, name: l.name, hidden: l.hidden }]));
  return list.types.map(([namespace, name, arity, isInterface, key]) => ({
    full: namespace ? `${namespace}.${name}` : name,
    name,
    arity,
    namespace,
    isInterface,
    lib: libs.get(key) ?? { key, name: key, hidden: false },
  }));
}
