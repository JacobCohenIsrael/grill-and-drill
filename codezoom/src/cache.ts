// The index cache (round 5): what each file and DLL gave last time, so a
// relaunch or a file change re-reads only what changed. Kept in .codezoom/
// at the project root, with its own .gitignore so git leaves it alone.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import v8 from "node:v8";
import type { FileFacts } from "./csharp/facts.js";
import type { ForeignTypeDef } from "./dotnet/metadata.js";

/** Bump when the reader or the facts change shape: old caches are then ignored. */
const SCHEMA = 1;
const FILE = "index-cache.bin";

interface Stamp {
  mtimeMs: number;
  size: number;
}

interface FileEntry extends Stamp {
  /** Assembly and preprocessor symbols: both change how a file reads. */
  context: string;
  facts: FileFacts | null;
}

interface DllEntry extends Stamp {
  types: ForeignTypeDef[];
}

interface Stored {
  schema: number;
  node: string;
  files: Map<string, FileEntry>;
  dlls: Map<string, DllEntry>;
}

export class IndexCache {
  private files = new Map<string, FileEntry>();
  private dlls = new Map<string, DllEntry>();
  private seenFiles = new Set<string>();
  private seenDlls = new Set<string>();
  /** Files read afresh in the current run (not from the cache). */
  readonly changed: string[] = [];
  hits = 0;
  loadedFromDisk = 0;
  /** Something to write: an entry added, changed or dropped since the last save. */
  private dirty = false;

  private constructor(private readonly dir: string | null) {}

  /** The cache in `dir`, or an empty one; null keeps it in memory only. */
  static load(dir: string | null): IndexCache {
    const cache = new IndexCache(dir);
    if (!dir) return cache;
    const path = join(dir, FILE);
    if (!existsSync(path)) return cache;
    try {
      const stored = v8.deserialize(readFileSync(path)) as Stored;
      if (stored.schema === SCHEMA && stored.node === process.version) {
        cache.files = stored.files;
        cache.dlls = stored.dlls;
        cache.loadedFromDisk = stored.files.size;
      }
    } catch {
      // unreadable or from another version: start empty
    }
    return cache;
  }

  /** Starts a run: counters reset, nothing seen yet. */
  begin() {
    this.changed.length = 0;
    this.hits = 0;
    this.seenFiles.clear();
    this.seenDlls.clear();
  }

  fileFacts(path: string, stamp: Stamp, context: string, read: () => FileFacts | null): FileFacts | null {
    this.seenFiles.add(path);
    const e = this.files.get(path);
    if (e && e.mtimeMs === stamp.mtimeMs && e.size === stamp.size && e.context === context) {
      this.hits++;
      return e.facts;
    }
    const facts = read();
    this.files.set(path, { mtimeMs: stamp.mtimeMs, size: stamp.size, context, facts });
    this.changed.push(path);
    this.dirty = true;
    return facts;
  }

  typeDefs(path: string, stamp: Stamp, read: () => ForeignTypeDef[]): ForeignTypeDef[] {
    this.seenDlls.add(path);
    const e = this.dlls.get(path);
    if (e && e.mtimeMs === stamp.mtimeMs && e.size === stamp.size) return e.types;
    const types = read();
    this.dlls.set(path, { mtimeMs: stamp.mtimeMs, size: stamp.size, types });
    this.dirty = true;
    return types;
  }

  /** Ends a run: forgets files and DLLs no longer used (deleted, or no longer own code). */
  end() {
    for (const [map, seen] of [
      [this.files, this.seenFiles],
      [this.dlls, this.seenDlls],
    ] as const) {
      for (const k of [...map.keys()]) {
        if (seen.has(k)) continue;
        map.delete(k);
        this.dirty = true;
      }
    }
  }

  /** Writes the cache to disk in the background; a half-written file is never read. */
  async save(): Promise<void> {
    if (!this.dir || !this.dirty) return;
    this.dirty = false;
    mkdirSync(this.dir, { recursive: true });
    const ignore = join(this.dir, ".gitignore");
    if (!existsSync(ignore)) writeFileSync(ignore, "# written by codezoom: the cache is not source\n*\n");
    const stored: Stored = { schema: SCHEMA, node: process.version, files: this.files, dlls: this.dlls };
    const tmp = join(this.dir, `${FILE}.${process.pid}.tmp`);
    await writeFile(tmp, v8.serialize(stored));
    await rename(tmp, join(this.dir, FILE));
  }
}
