// Reads the public top-level type names out of a .NET assembly (ECMA-335).
// Only the TypeDef table is read: enough to know which foreign library a
// type name in own code belongs to, and whether it is an interface.

import { readFileSync } from "node:fs";

export interface ForeignTypeDef {
  namespace: string;
  name: string;
  arity: number;
  isInterface: boolean;
}

const TYPEDEF_VISIBILITY_MASK = 0x7;
const TYPEDEF_PUBLIC = 0x1;
const TYPEDEF_INTERFACE = 0x20;

export function readTypeDefs(dllPath: string): ForeignTypeDef[] {
  const buf = readFileSync(dllPath);
  const peOffset = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOffset) !== 0x00004550) throw new Error("not a PE file");
  const coff = peOffset + 4;
  const sectionCount = buf.readUInt16LE(coff + 2);
  const optionalSize = buf.readUInt16LE(coff + 16);
  const optional = coff + 20;
  const magic = buf.readUInt16LE(optional);
  const dataDirs = optional + (magic === 0x20b ? 112 : 96);
  const cliRva = buf.readUInt32LE(dataDirs + 14 * 8);
  if (cliRva === 0) throw new Error("no CLI header");

  const sections: { va: number; size: number; raw: number }[] = [];
  const sectionTable = optional + optionalSize;
  for (let i = 0; i < sectionCount; i++) {
    const s = sectionTable + i * 40;
    sections.push({
      va: buf.readUInt32LE(s + 12),
      size: Math.max(buf.readUInt32LE(s + 8), buf.readUInt32LE(s + 16)),
      raw: buf.readUInt32LE(s + 20),
    });
  }
  const at = (rva: number): number => {
    for (const s of sections) if (rva >= s.va && rva < s.va + s.size) return rva - s.va + s.raw;
    throw new Error("RVA outside sections");
  };

  const cli = at(cliRva);
  const metaRoot = at(buf.readUInt32LE(cli + 8));
  if (buf.readUInt32LE(metaRoot) !== 0x424a5342) throw new Error("bad metadata signature");
  const versionLength = buf.readUInt32LE(metaRoot + 12);
  let p = metaRoot + 16 + versionLength + 2;
  const streamCount = buf.readUInt16LE(p);
  p += 2;
  let tables = -1;
  let strings = -1;
  for (let i = 0; i < streamCount; i++) {
    const offset = buf.readUInt32LE(p);
    p += 8;
    let end = p;
    while (buf[end] !== 0) end++;
    const name = buf.toString("ascii", p, end);
    p = (end + 4) & ~3;
    if (name === "#~" || name === "#-") tables = metaRoot + offset;
    else if (name === "#Strings") strings = metaRoot + offset;
  }
  if (tables < 0 || strings < 0) throw new Error("missing metadata streams");

  const heapSizes = buf[tables + 6];
  const validLo = buf.readUInt32LE(tables + 8);
  const validHi = buf.readUInt32LE(tables + 12);
  const rows: number[] = new Array(64).fill(0);
  let q = tables + 24;
  for (let t = 0; t < 64; t++) {
    const present = t < 32 ? (validLo >>> t) & 1 : (validHi >>> (t - 32)) & 1;
    if (present) {
      rows[t] = buf.readUInt32LE(q);
      q += 4;
    }
  }
  if (heapSizes & 0x40) q += 4; // extra data present in some #- streams

  const stringIdx = heapSizes & 0x01 ? 4 : 2;
  const guidIdx = heapSizes & 0x02 ? 4 : 2;
  const simpleIdx = (table: number) => (rows[table] < 0x10000 ? 2 : 4);
  const codedIdx = (tagBits: number, tablesInSet: number[]) =>
    Math.max(...tablesInSet.map((t) => rows[t])) < 1 << (16 - tagBits) ? 2 : 4;

  const moduleRow = 2 + stringIdx + guidIdx * 3;
  const resolutionScope = codedIdx(2, [0x00, 0x1a, 0x23, 0x01]);
  const typeRefRow = resolutionScope + stringIdx * 2;
  const typeDefOrRef = codedIdx(2, [0x02, 0x01, 0x1b]);
  const typeDefRow = 4 + stringIdx * 2 + typeDefOrRef + simpleIdx(0x04) + simpleIdx(0x06);

  const readIdx = (offset: number, size: number) => (size === 2 ? buf.readUInt16LE(offset) : buf.readUInt32LE(offset));
  const readString = (index: number) => {
    let end = strings + index;
    while (buf[end] !== 0) end++;
    return buf.toString("utf8", strings + index, end);
  };

  const typeDefStart = q + rows[0x00] * moduleRow + rows[0x01] * typeRefRow;
  const result: ForeignTypeDef[] = [];
  for (let i = 0; i < rows[0x02]; i++) {
    const r = typeDefStart + i * typeDefRow;
    const flags = buf.readUInt32LE(r);
    if ((flags & TYPEDEF_VISIBILITY_MASK) !== TYPEDEF_PUBLIC) continue;
    const rawName = readString(readIdx(r + 4, stringIdx));
    const namespace = readString(readIdx(r + 4 + stringIdx, stringIdx));
    const tick = rawName.indexOf("`");
    result.push({
      namespace,
      name: tick < 0 ? rawName : rawName.slice(0, tick),
      arity: tick < 0 ? 0 : Number(rawName.slice(tick + 1)) || 0,
      isInterface: (flags & TYPEDEF_INTERFACE) !== 0,
    });
  }
  return result;
}
