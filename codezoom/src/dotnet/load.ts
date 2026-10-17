// Loads a plain .NET folder (ADR 0006): the projects of its .sln (or every
// .csproj under it when there is none), each with the C# files the SDK
// compiles, its packages, its project references, and whether it tests.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Csproj } from "../unity/csproj.js";
import { frameworkDefines, implicitUsings } from "./frameworks.js";
import { globRegex, isGlob, listFiles, normalize } from "./globs.js";
import { expand, isFalse, isTrue, parseMsBuild, type MsItem, type MsProject } from "./msbuild.js";

export interface DotnetInfo {
  /** The project's folder, root-relative ("" for the root). */
  dir: string;
  sdk: string | null;
  targetFramework: string | null;
  /** PackageReference ids, as written. */
  packages: string[];
  frameworkReferences: string[];
  /** IsTestProject, a test framework package, or the MSTest SDK. */
  isTest: boolean;
  /** Namespaces imported into every file: <ImplicitUsings> and <Using> items. */
  globalUsings: string[];
  /** obj/project.assets.json, when the project has been restored. */
  assets: string | null;
  /** Listed in the solution (always true when there is none). */
  inSolution: boolean;
}

export type DotnetProject = Csproj & { dotnet: DotnetInfo };

const TEST_PACKAGES = /^(xunit|nunit|mstest|microsoft\.net\.test\.sdk$)/i;
const SKIP_DIRS = new Set(["bin", "obj"]);

/** Solution files at the root: .sln and .slnx. */
export function solutionFiles(root: string): string[] {
  try {
    return readdirSync(root)
      .filter((f) => /\.slnx?$/i.test(f))
      .sort();
  } catch {
    return [];
  }
}

/** True when the folder looks like plain .NET: a solution at the root, or an SDK-style project under it. */
export function isDotnetFolder(root: string): boolean {
  return solutionFiles(root).length > 0 || findCsprojs(root).some((f) => parseMsBuild(readFileSync(join(root, f), "utf8")).sdk !== null);
}

export function loadDotnetProjects(root: string): { projects: DotnetProject[]; solutions: string[] } {
  const solutions = solutionFiles(root);
  const listed = solutions.length ? solutions.flatMap((s) => readSolution(root, s)) : findCsprojs(root);
  const queue = [...new Set(listed)].map((file) => ({ file, inSolution: true }));
  const loaded = new Map<string, DotnetProject & { refFiles: string[] }>();
  const walks = new Map<string, string[]>();
  while (queue.length) {
    const { file, inSolution } = queue.shift()!;
    if (loaded.has(file) || !existsSync(join(root, file))) continue;
    const p = loadProject(root, file, inSolution, walks);
    loaded.set(file, p);
    // a project the solution leaves out but its projects reference: read it, as someone else's code
    for (const r of p.refFiles) if (!loaded.has(r)) queue.push({ file: r, inSolution: false });
  }
  const assemblyOf = new Map([...loaded].map(([file, p]) => [file, p.assembly]));
  const projects = [...loaded.values()].map(({ refFiles, ...p }) => ({ ...p, projectReferences: refFiles.map((r) => assemblyOf.get(r)).filter((a): a is string => !!a) }));
  return { projects: projects.sort((a, b) => a.assembly.localeCompare(b.assembly)), solutions };
}

/** The .csproj paths a .sln or .slnx lists, root-relative. */
export function readSolution(root: string, solution: string): string[] {
  const text = readFileSync(join(root, solution), "utf8");
  const base = dirname(join(root, solution));
  const paths = /\.slnx$/i.test(solution)
    ? [...text.matchAll(/<Project\b[^>]*\bPath\s*=\s*"([^"]+)"/g)].map((m) => m[1])
    : [...text.matchAll(/^Project\("\{[^}]+\}"\)\s*=\s*"[^"]*",\s*"([^"]+)"/gm)].map((m) => m[1]);
  return paths.filter((p) => /\.csproj$/i.test(p)).map((p) => toRootRelative(root, resolve(base, normalize(p))));
}

/** Every .csproj under the folder (a few levels deep), outside build output. */
function findCsprojs(root: string): string[] {
  return listFiles(root, SKIP_DIRS, 6).filter((f) => f.toLowerCase().endsWith(".csproj") && !f.split("/").some((s) => SKIP_DIRS.has(s.toLowerCase())));
}

function loadProject(root: string, file: string, inSolution: boolean, walks: Map<string, string[]>): DotnetProject & { refFiles: string[] } {
  const abs = join(root, file);
  const dir = dirname(abs);
  const own = parseMsBuild(readFileSync(abs, "utf8"));
  const shared = nearestBuildProps(root, dir);
  const props = new Map<string, string>([
    ["MSBuildProjectName", basename(file).replace(/\.csproj$/i, "")],
    ["MSBuildProjectFile", basename(file)],
    ["MSBuildProjectDirectory", dir],
    ["MSBuildThisFileDirectory", dir + sep],
    ["Configuration", "Debug"],
  ]);
  for (const [k, v] of [...(shared?.properties ?? []), ...own.properties]) props.set(k, v);
  const items: MsItem[] = [...(shared?.items ?? []), ...own.items];
  const prop = (name: string) => {
    const v = props.get(name);
    return v === undefined ? undefined : (expand(v, props) ?? undefined);
  };

  const assembly = prop("AssemblyName") || basename(file).replace(/\.csproj$/i, "");
  const targetFramework = prop("TargetFramework") || prop("TargetFrameworks")?.split(";").map((s) => s.trim()).find(Boolean) || null;
  const sdk = own.sdk ?? shared?.sdk ?? null;

  // the SDK compiles **/*.cs unless told not to; a legacy project lists its files
  const defaults = sdk !== null && !isFalse(prop("EnableDefaultItems")) && !isFalse(prop("EnableDefaultCompileItems"));
  const compile = new Set<string>(defaults ? filesUnder(dir, walks).filter((f) => f.toLowerCase().endsWith(".cs")) : []);
  const packages: string[] = [];
  const frameworkReferences: string[] = [];
  const refFiles: string[] = [];
  const usings: string[] = isTrue(prop("ImplicitUsings")) ? implicitUsings(sdk) : [];
  for (const item of items) {
    const specs = (v: string | undefined) =>
      (v ?? "")
        .split(";")
        .map((s) => expand(s, props))
        .filter((s): s is string => !!s && !!s.trim());
    if (item.kind === "Compile") {
      for (const spec of specs(item.include)) for (const f of matchSpec(dir, spec, walks)) if (f.toLowerCase().endsWith(".cs")) compile.add(f);
      for (const spec of specs(item.remove)) {
        const test = specTest(dir, spec);
        for (const f of [...compile]) if (test(f)) compile.delete(f);
      }
    } else if (item.kind === "PackageReference") packages.push(...specs(item.include));
    else if (item.kind === "FrameworkReference") frameworkReferences.push(...specs(item.include));
    else if (item.kind === "ProjectReference") {
      for (const spec of specs(item.include)) refFiles.push(toRootRelative(root, resolve(dir, normalize(spec))));
    } else if (item.kind === "Using" && !item.static && !item.alias) {
      for (const u of specs(item.include)) usings.push(u.trim());
      for (const u of specs(item.remove)) for (let i = usings.indexOf(u.trim()); i >= 0; i = usings.indexOf(u.trim())) usings.splice(i, 1);
    }
  }
  const declared = prop("IsTestProject");
  const isTest = declared !== undefined && isFalse(declared) ? false : isTrue(declared) || /^mstest\.sdk/i.test(sdk ?? "") || packages.some((p) => TEST_PACKAGES.test(p));
  const defines = [...frameworkDefines(targetFramework), ...(prop("DefineConstants") ?? "").split(/[;,]/).map((d) => d.trim())].filter(Boolean);
  const assets = join(dir, "obj", "project.assets.json");
  return {
    assembly,
    file,
    compile: [...compile].map((f) => toRootRelative(root, f)).sort(),
    references: [],
    projectReferences: [],
    refFiles,
    defines: [...new Set(defines)],
    dotnet: {
      dir: toRootRelative(root, dir),
      sdk,
      targetFramework,
      packages: [...new Set(packages)],
      frameworkReferences: [...new Set(frameworkReferences)],
      isTest,
      globalUsings: [...new Set(usings)],
      assets: existsSync(assets) ? assets : null,
      inSolution,
    },
  };
}

/** MSBuild imports the first Directory.Build.props it finds walking up from the project. */
function nearestBuildProps(root: string, dir: string): MsProject | null {
  const top = resolve(root);
  for (let d = resolve(dir); ; d = dirname(d)) {
    const f = join(d, "Directory.Build.props");
    if (existsSync(f)) return parseMsBuild(readFileSync(f, "utf8"));
    if (d === top || dirname(d) === d || !d.startsWith(top)) return null;
  }
}

/** Absolute paths of the files under a folder, the SDK's way (bin/, obj/ and dot-folders left out). */
function filesUnder(dir: string, walks: Map<string, string[]>): string[] {
  let files = walks.get(dir);
  if (!files) walks.set(dir, (files = listFiles(dir, SKIP_DIRS).map((f) => join(dir, f))));
  return files;
}

/** The files an Include spec names: a glob, or one path. */
function matchSpec(dir: string, spec: string, walks: Map<string, string[]>): string[] {
  const { base, rest } = splitGlob(dir, spec);
  if (rest === null) return existsSync(base) ? [base] : [];
  const re = globRegex(rest);
  return filesUnder(base, walks).filter((f) => re.test(f.slice(base.length + 1).split(sep).join("/")));
}

/** Whether an absolute file path falls under a Remove spec. */
function specTest(dir: string, spec: string): (file: string) => boolean {
  const { base, rest } = splitGlob(dir, spec);
  if (rest === null) return (f) => f === base;
  const re = globRegex(rest);
  return (f) => f.startsWith(base + sep) && re.test(f.slice(base.length + 1).split(sep).join("/"));
}

/** `../Shared/**\/*.cs` -> the folder to walk (absolute) and the glob below it; rest is null for a plain path. */
function splitGlob(dir: string, spec: string): { base: string; rest: string | null } {
  const parts = normalize(spec).split("/");
  const i = parts.findIndex(isGlob);
  if (i < 0) return { base: resolvePath(dir, parts.join("/")), rest: null };
  return { base: resolvePath(dir, parts.slice(0, i).join("/") || "."), rest: parts.slice(i).join("/") };
}

function resolvePath(dir: string, p: string): string {
  return isAbsolute(p) ? resolve(p) : resolve(dir, p);
}

function toRootRelative(root: string, abs: string): string {
  return relative(root, abs).split(sep).join("/");
}
