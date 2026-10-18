// `codezoom mcp`: the agent tools of ADR 0005 over MCP's stdio transport
// (newline-delimited JSON-RPC 2.0). stdout carries protocol messages only;
// logs go to stderr. Written by hand rather than with the SDK, which would
// add a web server's worth of dependencies to every `npx codezoom`.

import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { Query, QueryError, REFERENCE_LIMIT, ROW_LIMIT, SEARCH_KINDS, SEARCH_LIMIT } from "./query.js";

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `codezoom answers architecture questions about this C# project from its type graph.
Nodes are own types, foreign libraries (one node per package) and, in a Unity project, assets: scenes,
prefabs and ScriptableObject assets wired to own code. Around one node, the Focus, its Screen has two rows:
Dependents (nodes that depend on it) and Dependencies (nodes it depends on). Each edge has the strongest kind
of its References. From a type: inherits > implements > has (a field, property or primary-constructor
parameter) > uses. From an asset: inherits (a prefab variant's base) > instance of (a ScriptableObject
asset's type) > contains (a component's type, or a nested prefab) > assigns (an asset set in a serialized
field) > calls (a UnityEvent's target type). Assets never add edges between types. Weight is sqrt(R x M):
R References sitting in M members (for an asset, GameObjects) of the using end; size (large, medium, small)
ranks it in its row. Find a node with search, read its Screen with screen, then call screen on a neighbour to move
on; references gives the file:line evidence behind one edge. Read the files themselves for the source.`;

const TOOLS = [
  {
    name: "search",
    title: "Find nodes",
    description:
      "Find types and foreign libraries by name, the way the page's Jump box does: a substring, or word starts (CA and CampAp both find CampaignApplication). Best match first, with each node's Dependents and Dependencies counts.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Part of a name, or word starts. Assets are found by file name (Goblin.prefab)." },
        limit: { type: "integer", minimum: 1, description: `Results to return (default ${SEARCH_LIMIT}).` },
        kind: { type: "string", enum: [...SEARCH_KINDS], description: "Only nodes of this kind: type (any own type), a type kind, scene, prefab, asset (a ScriptableObject asset) or library." },
        assets: { type: "boolean", description: "false leaves Unity scenes, prefabs and ScriptableObject assets out." },
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "screen",
    title: "Show a node's Screen",
    description:
      "The Screen of one node, the Focus: its box (label, public and serialized members, a count of the rest; for a scene or prefab its component types, for a ScriptableObject asset its asset fields) and its two rows, Dependents and Dependencies, largest first. Each neighbour has its edge kind, Weight with R and M, size, cycle mark, namespace (or folder) distance and declaring file. Rows are paged: each says how many it holds in total.",
    inputSchema: {
      type: "object",
      properties: {
        focus: { type: "string", description: "A type's name or full name (MyGame.Towers.Tower), or a foreign library's name." },
        filter: { type: "string", description: "Keep only neighbours whose name matches, as search matches." },
        limit: { type: "integer", minimum: 0, description: `Neighbours per row (default ${ROW_LIMIT}).` },
        offset: { type: "integer", minimum: 0, description: "Neighbours to skip in each row, for the next page." },
        assets: { type: "boolean", description: "false leaves Unity assets out of both rows (sizes are then worked out without them)." },
      },
      required: ["focus"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "references",
    title: "List the References behind an edge",
    description:
      "The References behind the edge from one node to another (from depends on to): each place, as file:line, with the member of `from` it sits in, or for an asset the GameObject (a path like Canvas/Header/BuyButton).",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "The node that depends." },
        to: { type: "string", description: "The node it depends on." },
        limit: { type: "integer", minimum: 0, description: `References to return (default ${REFERENCE_LIMIT}).` },
        offset: { type: "integer", minimum: 0, description: "References to skip, for the next page." },
      },
      required: ["from", "to"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

type Id = string | number;

interface Message {
  jsonrpc?: string;
  id?: Id | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface McpOptions {
  version: string;
  /** The current index's answers; rejects when the folder can't be indexed. */
  query: () => Promise<Query>;
  /** After the initialize answer is out: a good moment to start indexing. */
  onInitialized?: () => void;
  log: (line: string) => void;
}

/** Serves until the input closes. */
export function serveMcp(input: Readable, output: Writable, options: McpOptions): Promise<void> {
  const send = (message: object) =>
    new Promise<void>((resolve) => output.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`, () => resolve()));
  const lines = createInterface({ input, crlfDelay: Infinity });
  const pending: Promise<void>[] = [];

  const handle = async (m: Message) => {
    if (!m || typeof m !== "object" || typeof m.method !== "string") return; // a response, or nothing we sent for
    if (m.id === undefined || m.id === null) return; // a notification: initialized, cancelled
    const id = m.id;
    try {
      await send({ id, result: await answer(m.method, m.params ?? {}, options) });
      if (m.method === "initialize") options.onInitialized?.();
    } catch (e) {
      if (e instanceof RpcError) await send({ id, error: { code: e.code, message: e.message } });
      else await send({ id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } });
    }
  };

  lines.on("line", (line) => {
    if (!line.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      void send({ id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    for (const m of Array.isArray(parsed) ? parsed : [parsed]) pending.push(handle(m as Message));
  });
  return new Promise((resolve) => lines.on("close", () => void Promise.all(pending).then(() => resolve())));
}

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

async function answer(method: string, params: Record<string, unknown>, options: McpOptions): Promise<unknown> {
  switch (method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "codezoom", title: "codezoom", version: options.version },
        instructions: INSTRUCTIONS,
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call":
      return callTool(String(params.name ?? ""), (params.arguments ?? {}) as Record<string, unknown>, options);
    default:
      throw new RpcError(-32601, `Method not found: ${method}`);
  }
}

async function callTool(name: string, args: Record<string, unknown>, options: McpOptions) {
  if (!TOOLS.some((t) => t.name === name)) throw new RpcError(-32602, `Unknown tool: ${name}`);
  const result = (text: string, isError = false) => ({ content: [{ type: "text", text }], ...(isError ? { isError } : {}) });
  try {
    const q = await options.query();
    const text = (key: string) => {
      const v = args[key];
      if (v === undefined || v === null) return undefined;
      if (typeof v !== "string") throw new QueryError(`"${key}" must be a string`);
      return v;
    };
    const count = (key: string) => {
      const v = args[key];
      if (v === undefined || v === null) return undefined;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new QueryError(`"${key}" must be a whole number, 0 or more`);
      return v;
    };
    const needed = (key: string) => text(key) ?? missing(key);
    const flag = (key: string) => {
      const v = args[key];
      if (v === undefined || v === null) return undefined;
      if (typeof v !== "boolean") throw new QueryError(`"${key}" must be true or false`);
      return v;
    };
    const answer =
      name === "search"
        ? q.search(needed("query"), count("limit"), { kind: text("kind"), assets: flag("assets") })
        : name === "screen"
          ? q.screen(needed("focus"), { filter: text("filter"), limit: count("limit"), offset: count("offset"), assets: flag("assets") })
          : q.references(needed("from"), needed("to"), { limit: count("limit"), offset: count("offset") });
    return result(JSON.stringify(answer));
  } catch (e) {
    if (!(e instanceof QueryError)) options.log(`codezoom mcp: ${name} failed: ${e instanceof Error ? e.stack : e}`);
    return result(e instanceof Error ? e.message : String(e), true);
  }
}

function missing(key: string): never {
  throw new QueryError(`"${key}" is required`);
}
