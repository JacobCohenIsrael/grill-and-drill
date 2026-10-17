// One build configuration of a file. Reading both sides of every #if at
// once breaks when an #if splits a declaration (`class A` / #if X `: B {`
// #else `: C {` #endif); such files are read once per configuration
// instead, and the readings merged.

const DIRECTIVE = /^\s*#\s*(if|elif|else|endif|define|undef)\b([^\r]*)\r?$/; // files may use CRLF

export function hasIf(text: string): boolean {
  return /^\s*#\s*if\b/m.test(text);
}

/** The symbols a file's #if/#elif conditions mention. */
export function conditionSymbols(text: string): Set<string> {
  const symbols = new Set<string>();
  for (const line of text.split("\n")) {
    const m = DIRECTIVE.exec(line);
    if (!m || (m[1] !== "if" && m[1] !== "elif")) continue;
    for (const id of stripComment(m[2]).match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) if (id !== "true" && id !== "false") symbols.add(id);
  }
  return symbols;
}

/**
 * The text as the compiler sees it with these symbols defined. Directive
 * lines and inactive lines become blank, so lines keep their numbers.
 */
export function configure(text: string, defined: Set<string>): string {
  const symbols = new Set(defined);
  // one frame per open #if: is its branch active, has any branch been taken, was the outside active
  const stack: { active: boolean; taken: boolean; outer: boolean }[] = [];
  const active = () => stack.length === 0 || stack[stack.length - 1].active;
  return text
    .split("\n")
    .map((line) => {
      const m = DIRECTIVE.exec(line);
      if (!m) return active() ? line : "";
      const [, kind, rest] = m;
      const top = stack[stack.length - 1];
      switch (kind) {
        case "if": {
          const outer = active();
          const on = outer && evaluate(stripComment(rest), symbols);
          stack.push({ active: on, taken: on, outer });
          break;
        }
        case "elif":
          if (top) {
            const on = top.outer && !top.taken && evaluate(stripComment(rest), symbols);
            top.active = on;
            top.taken ||= on;
          }
          break;
        case "else":
          if (top) {
            top.active = top.outer && !top.taken;
            top.taken = true;
          }
          break;
        case "endif":
          stack.pop();
          break;
        case "define":
          if (active()) symbols.add(stripComment(rest).trim());
          break;
        case "undef":
          if (active()) symbols.delete(stripComment(rest).trim());
          break;
      }
      return "";
    })
    .join("\n");
}

function stripComment(s: string): string {
  const i = s.indexOf("//");
  return i < 0 ? s : s.slice(0, i);
}

/** Evaluates a preprocessor condition: names, true/false, !, &&, ||, ==, !=, parentheses. */
function evaluate(expr: string, symbols: Set<string>): boolean {
  const tokens = expr.match(/[A-Za-z_][A-Za-z0-9_]*|&&|\|\||==|!=|!|\(|\)/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const primary = (): boolean => {
    const t = tokens[i++];
    if (t === "!") return !primary();
    if (t === "(") {
      const v = or();
      if (peek() === ")") i++;
      return v;
    }
    if (t === "true") return true;
    if (t === "false" || t === undefined) return false;
    return symbols.has(t);
  };
  const equality = (): boolean => {
    let v = primary();
    while (peek() === "==" || peek() === "!=") {
      const op = tokens[i++];
      const r = primary();
      v = op === "==" ? v === r : v !== r;
    }
    return v;
  };
  const and = (): boolean => {
    let v = equality();
    while (peek() === "&&") {
      i++;
      v = equality() && v;
    }
    return v;
  };
  const or = (): boolean => {
    let v = and();
    while (peek() === "||") {
      i++;
      v = and() || v;
    }
    return v;
  };
  return or();
}
