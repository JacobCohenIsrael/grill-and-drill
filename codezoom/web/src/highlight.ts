// A small C# highlighter for the source panel: comments, strings (verbatim
// and raw ones span lines), keywords, numbers and directives. One pass over
// the file gives one HTML string per line, built from escaped text only.

const KEYWORDS = new Set(
  (
    "abstract as base bool break byte case catch char checked class const continue decimal default delegate do double " +
    "else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is " +
    "lock long namespace new null object operator out override params private protected public readonly record ref return " +
    "sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked " +
    "unsafe ushort using virtual void volatile while var async await get set init value when where yield partial global " +
    "dynamic nameof not and or with required file scoped"
  ).split(" "),
);

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (cls: string, text: string) => `<span class="${cls}">${escape(text)}</span>`;

type State = { kind: "code" } | { kind: "block-comment" } | { kind: "verbatim" } | { kind: "raw"; quotes: number };

export function highlightLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let state: State = { kind: "code" };
  for (const line of lines) {
    let html = "";
    let i = 0;
    if (state.kind === "code" && /^\s*#/.test(line)) {
      out.push(span("dir", line));
      continue;
    }
    while (i < line.length) {
      if (state.kind === "block-comment") {
        const end = line.indexOf("*/", i);
        const stop = end < 0 ? line.length : end + 2;
        html += span("com", line.slice(i, stop));
        i = stop;
        if (end >= 0) state = { kind: "code" };
        continue;
      }
      if (state.kind === "verbatim") {
        let j = i;
        while (j < line.length) {
          if (line[j] === '"') {
            if (line[j + 1] === '"') j += 2;
            else break;
          } else j++;
        }
        const stop = Math.min(line.length, j + 1);
        html += span("str", line.slice(i, stop));
        i = stop;
        if (j < line.length) state = { kind: "code" };
        continue;
      }
      if (state.kind === "raw") {
        const close = '"'.repeat(state.quotes);
        const end = line.indexOf(close, i);
        const stop = end < 0 ? line.length : end + state.quotes;
        html += span("str", line.slice(i, stop));
        i = stop;
        if (end >= 0) state = { kind: "code" };
        continue;
      }
      const rest = line.slice(i);
      let m: RegExpExecArray | null;
      if (rest.startsWith("//")) {
        html += span("com", rest);
        break;
      }
      if (rest.startsWith("/*")) {
        state = { kind: "block-comment" };
        html += span("com", "/*");
        i += 2;
        continue;
      }
      if ((m = /^\$*("{3,})/.exec(rest))) {
        state = { kind: "raw", quotes: m[1].length };
        html += span("str", m[0]);
        i += m[0].length;
        continue;
      }
      if ((m = /^(?:@\$|\$@|@)"/.exec(rest))) {
        state = { kind: "verbatim" };
        html += span("str", m[0]);
        i += m[0].length;
        continue;
      }
      if ((m = /^\$?"(?:[^"\\]|\\.)*"?/.exec(rest)) || (m = /^'(?:[^'\\]|\\.)*'?/.exec(rest))) {
        html += span("str", m[0]);
        i += m[0].length;
        continue;
      }
      if ((m = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[fFdDmMuUlL]*/.exec(rest))) {
        html += span("num", m[0]);
        i += m[0].length;
        continue;
      }
      if ((m = /^@?[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
        const word = m[0];
        if (KEYWORDS.has(word)) html += span("kw", word);
        else if (/^[A-Z]/.test(word)) html += span("ty", word);
        else html += escape(word);
        i += word.length;
        continue;
      }
      html += escape(line[i]);
      i++;
    }
    out.push(html);
  }
  return out;
}
