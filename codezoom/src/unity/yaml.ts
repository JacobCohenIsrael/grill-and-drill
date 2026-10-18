// Reads Unity's text serialization (scenes, prefabs, .asset files): the
// documents (`--- !u!<class> &<fileID>`), and inside the ones codezoom needs,
// each field as a path ("m_Component[0].component", "groups[1].enemy") with
// its value and line. Not a YAML parser: Unity writes a narrow, regular
// subset, and big data blocks are skipped without reading them line by line.

export interface ObjectRef {
  fileID: string;
  guid?: string;
  type?: number;
}

export interface UnityDoc {
  classId: number;
  /** The first key: GameObject, Transform, MonoBehaviour, PrefabInstance, … */
  className: string;
  fileId: string;
  /** A placeholder for an object that lives in a nested prefab. */
  stripped: boolean;
  line: number;
  /** [path, raw value, line] for each field with a value, in file order. */
  fields: [string, string, number][];
}

/** Classes whose fields codezoom reads; of every other component it only needs the GameObject. */
const READ_ALL = new Set(["GameObject", "Transform", "RectTransform", "MonoBehaviour", "PrefabInstance", "SceneRoots"]);
/** Values longer than this are data (meshes, tiles, curves), not wiring. */
const MAX_VALUE = 400;

export function readUnityYaml(text: string): UnityDoc[] {
  const docs: UnityDoc[] = [];
  let pos = text.startsWith("--- ") ? 0 : text.indexOf("\n--- ");
  if (pos < 0) return docs;
  if (pos > 0) pos += 1;
  // the line a document starts on: newlines counted forward from the last document
  let lineAt = 1;
  let counted = 0;
  const lineOf = (offset: number) => {
    for (let i = text.indexOf("\n", counted); i >= 0 && i < offset; i = text.indexOf("\n", i + 1)) {
      lineAt++;
      counted = i + 1;
    }
    return lineAt;
  };
  while (pos >= 0 && pos < text.length) {
    const headerEnd = text.indexOf("\n", pos);
    const header = text.slice(pos, headerEnd < 0 ? text.length : headerEnd);
    const next = text.indexOf("\n--- ", pos + 1);
    const end = next < 0 ? text.length : next + 1;
    const m = /^--- !u!(\d+) &(-?\d+)( stripped)?/.exec(header);
    if (m && headerEnd >= 0) {
      const line = lineOf(pos);
      const nameEnd = text.indexOf("\n", headerEnd + 1);
      const className = text.slice(headerEnd + 1, nameEnd < 0 ? end : nameEnd).replace(/:\s*$/, "").trim();
      const doc: UnityDoc = { classId: Number(m[1]), className, fileId: m[2], stripped: !!m[3], line, fields: [] };
      readFields(text, nameEnd < 0 ? end : nameEnd + 1, end, line + 2, doc, READ_ALL.has(className) || doc.stripped);
      docs.push(doc);
    }
    pos = next < 0 ? -1 : next + 1;
  }
  return docs;
}

interface Frame {
  indent: number;
  path: string;
  /** Items seen so far when this key holds a sequence. */
  items: number;
  /** A sequence item: its keys sit one column right of this frame's indent. */
  item?: boolean;
}

/** Fields of one document; with `all` false, stops at m_GameObject. */
function readFields(text: string, start: number, end: number, firstLine: number, doc: UnityDoc, all: boolean) {
  const stack: Frame[] = [];
  let lineNo = firstLine;
  for (let p = start; p < end; lineNo++) {
    let e = text.indexOf("\n", p);
    if (e < 0 || e > end) e = end;
    // a data line: leave it unread
    if (e - p > MAX_VALUE + 80) {
      p = e + 1;
      continue;
    }
    const raw = text.slice(p, e);
    p = e + 1;
    let indent = 0;
    while (raw.charCodeAt(indent) === 32) indent++;
    let content = raw.slice(indent).replace(/\r$/, "");
    if (!content) continue;
    let parent: string;
    if (content.startsWith("- ") || content === "-") {
      while (stack.length && stack[stack.length - 1].indent > indent) stack.pop();
      const seq = stack[stack.length - 1];
      if (!seq || seq.indent !== indent) continue; // a wrapped string, not an item
      const itemPath = `${seq.path}[${seq.items++}]`;
      stack.push({ indent: indent + 1, path: itemPath, items: 0, item: true });
      content = content.slice(2);
      indent += 2;
      if (!/^[A-Za-z_][\w ]*:( |$)/.test(content)) {
        if (content) emit(doc, itemPath, content, lineNo);
        continue;
      }
    }
    const colon = content.indexOf(":");
    if (colon <= 0 || !/^[A-Za-z_][\w ]*$/.test(content.slice(0, colon))) continue; // continuation of a wrapped value
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    // a key sits exactly one level under its parent; anything deeper continues a wrapped string
    const top = stack[stack.length - 1];
    if (indent !== (top ? top.indent + (top.item ? 1 : 2) : 2)) continue;
    parent = top ? top.path : "";
    const key = content.slice(0, colon);
    const path = parent ? `${parent}.${key}` : key;
    const value = content.slice(colon + 1).trim();
    if (!value) stack.push({ indent, path, items: 0 });
    else emit(doc, path, value, lineNo);
    // a component names its GameObject in its first lines; anything else (meshes, settings) is not read
    if (!all && (path === "m_GameObject" || lineNo - firstLine > 12)) return;
  }
}

function emit(doc: UnityDoc, path: string, value: string, line: number) {
  if (value.length <= MAX_VALUE) doc.fields.push([path, value, line]);
}

/** `{fileID: 123, guid: abc, type: 3}` as a reference; null for anything else. */
export function parseRef(value: string): ObjectRef | null {
  const m = /^\{fileID: (-?\d+)(?:, guid: ([0-9a-fA-F]{32}))?(?:, type: (\d+))?\}$/.exec(value);
  if (!m) return null;
  return m[2] ? { fileID: m[1], guid: m[2].toLowerCase(), type: m[3] ? Number(m[3]) : undefined } : { fileID: m[1] };
}

/** A scalar as written: quotes taken off. */
export function scalar(value: string): string {
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) return value.slice(1, -1);
  return value;
}

/** The value at a path, or undefined. */
export function field(doc: UnityDoc, path: string): string | undefined {
  for (const [p, v] of doc.fields) if (p === path) return v;
  return undefined;
}
