// Reads what codezoom needs from an SDK-style .csproj (and the nearest
// Directory.Build.props above it): properties, and the Compile, Using,
// PackageReference, ProjectReference and FrameworkReference items in
// document order. Not an MSBuild evaluator: conditions are ignored (both
// sides count, as with #if), and only a few $(Properties) are expanded.

export interface MsItem {
  kind: "Compile" | "Using" | "PackageReference" | "ProjectReference" | "FrameworkReference";
  include?: string;
  remove?: string;
  static?: boolean;
  alias?: string;
}

export interface MsProject {
  /** The SDK named on <Project Sdk>, <Sdk Name> or an Sdk import; null for a legacy project. */
  sdk: string | null;
  properties: Map<string, string>;
  items: MsItem[];
}

const ITEM_KINDS = new Set<MsItem["kind"]>(["Compile", "Using", "PackageReference", "ProjectReference", "FrameworkReference"]);

export function parseMsBuild(text: string): MsProject {
  const xml = text.replace(/^﻿/, "").replace(/<!--[\s\S]*?-->/g, "");
  const sdk =
    /<Project\b[^>]*\bSdk\s*=\s*["']([^"']+)["']/.exec(xml)?.[1] ??
    /<Sdk\b[^>]*\bName\s*=\s*["']([^"']+)["']/.exec(xml)?.[1] ??
    /<Import\b[^>]*\bSdk\s*=\s*["']([^"']+)["']/.exec(xml)?.[1] ??
    null;
  const properties = new Map<string, string>();
  for (const group of xml.matchAll(/<PropertyGroup\b[^>]*>([\s\S]*?)<\/PropertyGroup>/g)) {
    for (const m of group[1].matchAll(/<([A-Za-z_][\w.-]*)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
      // the last definition wins, as in MSBuild
      properties.set(m[1], unescapeXml((m[2] ?? "").trim()));
    }
  }
  const items: MsItem[] = [];
  for (const group of xml.matchAll(/<ItemGroup\b[^>]*>([\s\S]*?)<\/ItemGroup>/g)) {
    for (const m of group[1].matchAll(/<([A-Za-z_][\w.-]*)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
      const kind = m[1] as MsItem["kind"];
      if (!ITEM_KINDS.has(kind)) continue;
      const attrs = attributes(m[2]);
      const item: MsItem = { kind };
      if (attrs.Include !== undefined) item.include = attrs.Include;
      if (attrs.Remove !== undefined) item.remove = attrs.Remove;
      const body = m[3] ?? "";
      const meta = (name: string) => attrs[name] ?? new RegExp(`<${name}>([^<]*)</${name}>`).exec(body)?.[1];
      if (kind === "Using") {
        if ((meta("Static") ?? "").toLowerCase() === "true") item.static = true;
        const alias = meta("Alias");
        if (alias) item.alias = alias;
      }
      if (item.include !== undefined || item.remove !== undefined) items.push(item);
    }
  }
  return { sdk, properties, items };
}

function attributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = unescapeXml(m[2] ?? m[3] ?? "");
  return out;
}

export const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/**
 * Expands $(Name) from the given properties; a name it does not know makes
 * the whole value unknown (null), so a guess never becomes a path.
 */
export function expand(value: string, props: Map<string, string>, depth = 0): string | null {
  let unknown = false;
  const out = value.replace(/\$\(([\w.-]+)\)/g, (_, name: string) => {
    const v = props.get(name);
    if (v === undefined || depth > 8) {
      unknown = true;
      return "";
    }
    const inner = expand(v, props, depth + 1);
    if (inner === null) unknown = true;
    return inner ?? "";
  });
  return unknown ? null : out;
}

export function isTrue(v: string | undefined): boolean {
  return !!v && ["true", "enable", "enabled"].includes(v.trim().toLowerCase());
}

export function isFalse(v: string | undefined): boolean {
  return !!v && ["false", "disable", "disabled"].includes(v.trim().toLowerCase());
}
