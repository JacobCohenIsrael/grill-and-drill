// What the .NET SDK adds to a project without it being written down: the
// preprocessor symbols of its target framework, and the namespaces
// `<ImplicitUsings>` imports into every file.

const NET_VERSIONS = ["5.0", "6.0", "7.0", "8.0", "9.0", "10.0", "11.0"];
const CORE_VERSIONS = ["1.0", "1.1", "2.0", "2.1", "2.2", "3.0", "3.1"];
const STANDARD_VERSIONS = ["1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "2.0", "2.1"];
const FRAMEWORK_VERSIONS = ["20", "30", "35", "40", "45", "451", "452", "46", "461", "462", "47", "471", "472", "48", "481"];

const sym = (v: string) => v.replace(/\./g, "_");

/** DEBUG and TRACE (a Debug build), plus the target framework's symbols: net8.0 -> NET, NET8_0, NET8_0_OR_GREATER, … */
export function frameworkDefines(tfm: string | null): string[] {
  const out = ["DEBUG", "TRACE"];
  if (!tfm) return out;
  const [base, platform] = tfm.toLowerCase().split("-");
  let m: RegExpExecArray | null;
  if ((m = /^net(\d+\.\d+)$/.exec(base)) && Number.parseFloat(m[1]) >= 5) {
    const v = m[1];
    out.push("NET", `NET${sym(v)}`, "NETCOREAPP");
    for (const x of NET_VERSIONS) if (Number.parseFloat(x) <= Number.parseFloat(v)) out.push(`NET${sym(x)}_OR_GREATER`);
    for (const x of CORE_VERSIONS) out.push(`NETCOREAPP${sym(x)}_OR_GREATER`);
  } else if ((m = /^netcoreapp(\d+\.\d+)$/.exec(base))) {
    out.push("NETCOREAPP", `NETCOREAPP${sym(m[1])}`);
    for (const x of CORE_VERSIONS) if (Number.parseFloat(x) <= Number.parseFloat(m[1])) out.push(`NETCOREAPP${sym(x)}_OR_GREATER`);
  } else if ((m = /^netstandard(\d+\.\d+)$/.exec(base))) {
    out.push("NETSTANDARD", `NETSTANDARD${sym(m[1])}`);
    for (const x of STANDARD_VERSIONS) if (Number.parseFloat(x) <= Number.parseFloat(m[1])) out.push(`NETSTANDARD${sym(x)}_OR_GREATER`);
  } else if ((m = /^net(\d{2,3})$/.exec(base))) {
    const v = m[1];
    out.push("NETFRAMEWORK", `NET${v}`);
    const rank = (x: string) => Number(x.padEnd(3, "0"));
    for (const x of FRAMEWORK_VERSIONS) if (rank(x) <= rank(v)) out.push(`NET${x}_OR_GREATER`);
  }
  if (platform) {
    const p = /^[a-z]+/.exec(platform)?.[0];
    if (p) out.push(p.toUpperCase());
  }
  return out;
}

const BASE_USINGS = ["System", "System.Collections.Generic", "System.IO", "System.Linq", "System.Net.Http", "System.Threading", "System.Threading.Tasks"];
const HOSTING_USINGS = ["Microsoft.Extensions.Configuration", "Microsoft.Extensions.DependencyInjection", "Microsoft.Extensions.Hosting", "Microsoft.Extensions.Logging"];
const WEB_USINGS = [
  "System.Net.Http.Json",
  "Microsoft.AspNetCore.Builder",
  "Microsoft.AspNetCore.Hosting",
  "Microsoft.AspNetCore.Http",
  "Microsoft.AspNetCore.Routing",
  ...HOSTING_USINGS,
];

/** The namespaces `<ImplicitUsings>enable</ImplicitUsings>` imports for an SDK. */
export function implicitUsings(sdk: string | null): string[] {
  const s = (sdk ?? "").toLowerCase();
  if (s.startsWith("microsoft.net.sdk.web") || s.startsWith("microsoft.net.sdk.razor") || s.startsWith("microsoft.net.sdk.blazorwebassembly")) {
    return [...BASE_USINGS, ...WEB_USINGS];
  }
  if (s.startsWith("microsoft.net.sdk.worker")) return [...BASE_USINGS, ...HOSTING_USINGS];
  return BASE_USINGS;
}

/** The SDKs that bring ASP.NET Core's shared framework with them. */
export function isWebSdk(sdk: string | null): boolean {
  return /^microsoft\.net\.sdk\.(web|razor|blazorwebassembly)/i.test(sdk ?? "");
}
