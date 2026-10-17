// Reads the .csproj files Unity/Rider generate at the project root.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface DllReference {
  name: string;
  hintPath: string;
}

export interface Csproj {
  assembly: string;
  file: string;
  compile: string[]; // project-relative, forward slashes
  references: DllReference[];
  projectReferences: string[]; // assembly names
  /** Preprocessor symbols Unity compiles this assembly with. */
  defines: string[];
}

const unescapeXml = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export function readCsprojs(root: string): Csproj[] {
  const result: Csproj[] = [];
  for (const entry of readdirSync(root)) {
    if (!entry.endsWith(".csproj")) continue;
    const text = readFileSync(join(root, entry), "utf8");
    const assembly = /<AssemblyName>([^<]+)<\/AssemblyName>/.exec(text)?.[1] ?? entry.replace(/\.csproj$/, "");
    const compile = [...text.matchAll(/<Compile\s+Include="([^"]+)"/g)].map((m) =>
      unescapeXml(m[1]).replace(/\\/g, "/"),
    );
    const references: DllReference[] = [];
    for (const m of text.matchAll(/<Reference\s+Include="([^"]+)"\s*>\s*<HintPath>([^<]+)<\/HintPath>/g)) {
      references.push({ name: unescapeXml(m[1]), hintPath: unescapeXml(m[2]).replace(/\\/g, "/") });
    }
    const projectReferences = [...text.matchAll(/<ProjectReference\s+Include="([^"]+)"[\s\S]*?<\/ProjectReference>|<ProjectReference\s+Include="([^"]+)"\s*\/>/g)].map(
      (m) => {
        const block = m[0];
        const name = /<Name>([^<]+)<\/Name>/.exec(block)?.[1];
        return name ?? (m[1] ?? m[2]).replace(/\\/g, "/").replace(/^.*\//, "").replace(/\.csproj$/, "");
      },
    );
    const defines = (/<DefineConstants>([^<]*)<\/DefineConstants>/.exec(text)?.[1] ?? "").split(";").map((d) => d.trim()).filter(Boolean);
    result.push({ assembly, file: entry, compile, references, projectReferences, defines });
  }
  return result.sort((a, b) => a.assembly.localeCompare(b.assembly));
}
