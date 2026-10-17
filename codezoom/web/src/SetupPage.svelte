<script lang="ts">
  import { onMount } from "svelte";
  import type { SetupAssembly, SetupData } from "../../src/shared/types";
  import { FolderRules, verdict, type Config } from "../../src/shared/ownRules";
  import { loadSetup, saveSetup } from "./api";

  interface Props {
    /** Opened from "N new assemblies": show those first. */
    onlyNew: boolean;
    /** Called after Save has re-indexed. */
    onSaved: () => void;
  }
  let { onlyNew, onSaved }: Props = $props();

  interface FolderNode {
    name: string;
    path: string;
    files: string[];
    children: FolderNode[];
  }

  let data = $state.raw<SetupData | null>(null);
  let failed = $state<string | null>(null);
  let own = $state.raw(new Set<string>());
  let excludeFolders = $state.raw<string[]>([]);
  let includeFolders = $state.raw<string[]>([]);
  let open = $state.raw(new Set<string>());
  let showAll = $state(true);
  let saving = $state<string | null>(null);

  onMount(() => {
    showAll = !onlyNew;
    loadSetup().then(
      (d) => {
        data = d;
        excludeFolders = d.config?.excludeFolders ?? [];
        includeFolders = d.config?.includeFolders ?? [];
        // pre-ticks: what the config lists, else what the default rules would index
        // (an assembly wholly in vendor folders gives no own code, so it starts unticked)
        const start = new FolderRules({ excludeFolders, includeFolders }, d.project.kind);
        own = new Set(
          d.assemblies
            .filter((a) => {
              const v = verdict(a.name, a.files, d.config, a.hints);
              const listed = d.config?.assemblies?.includes(a.name) ?? false;
              return v.own && (listed || a.files.some((f) => start.isOwnFile(f)));
            })
            .map((a) => a.name),
        );
      },
      (e) => (failed = String(e)),
    );
  });

  const rules = $derived(new FolderRules({ excludeFolders, includeFolders }, data?.project.kind));
  const dotnet = $derived(data?.project.kind === "dotnet");
  /** Unity has assemblies; a .NET solution has projects. */
  const unit = (n: number) => (dotnet ? (n === 1 ? "project" : "projects") : n === 1 ? "assembly" : "assemblies");
  const ownFiles = (a: SetupAssembly) => a.files.filter((f) => rules.isOwnFile(f)).length;
  const isNew = (a: SetupAssembly) => !!data && verdict(a.name, a.files, data.config, a.hints).isNew;
  const fmt = (n: number) => n.toLocaleString("en");
  const OUTSIDE = "Outside the solution";

  /** Assemblies grouped by their top folder under Assets/ or Packages/, biggest group first. */
  const groups = $derived.by(() => {
    if (!data) return [];
    const byTop = new Map<string, SetupAssembly[]>();
    for (const a of data.assemblies) {
      if (!a.files.length) continue;
      if (!showAll && !isNew(a)) continue;
      // projects the solution leaves out but its projects reference: foreign until ticked, so apart
      const top = a.hints?.outsideSolution ? OUTSIDE : topFolder(a.files);
      if (!byTop.has(top)) byTop.set(top, []);
      byTop.get(top)!.push(a);
    }
    return [...byTop]
      .map(([folder, list]) => ({
        folder,
        assemblies: list.sort((a, b) => b.files.length - a.files.length),
        files: list.reduce((n, a) => n + a.files.length, 0),
      }))
      .sort((a, b) => Number(a.folder === OUTSIDE) - Number(b.folder === OUTSIDE) || b.files - a.files);
  });

  const totals = $derived.by(() => {
    const chosen = (data?.assemblies ?? []).filter((a) => own.has(a.name));
    return { assemblies: chosen.length, files: chosen.reduce((n, a) => n + ownFiles(a), 0) };
  });
  const newCount = $derived((data?.assemblies ?? []).filter(isNew).length);

  function topFolder(files: string[]): string {
    const counts = new Map<string, number>();
    for (const f of files) {
      const parts = f.split("/");
      // Unity: Assets/<folder>; .NET: the folder the projects sit in (src/, tests/)
      const top = dotnet ? (parts.length > 1 ? parts[0] : "(root)") : parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0];
      counts.set(top, (counts.get(top) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0][0];
  }

  /** The deepest folder all of the files share. */
  function commonFolder(files: string[]): string {
    let common = files[0].split("/").slice(0, -1);
    for (const f of files) {
      const parts = f.split("/");
      let i = 0;
      while (i < common.length && common[i] === parts[i]) i++;
      common = common.slice(0, i);
    }
    return common.join("/");
  }

  function tree(a: SetupAssembly): FolderNode {
    const rootPath = commonFolder(a.files);
    const root: FolderNode = { name: rootPath || "(project)", path: rootPath, files: [], children: [] };
    for (const f of a.files) {
      root.files.push(f);
      const rest = f.slice(rootPath ? rootPath.length + 1 : 0).split("/").slice(0, -1);
      let node = root;
      for (const part of rest) {
        let child = node.children.find((c) => c.name === part);
        if (!child) {
          child = { name: part, path: node.path ? `${node.path}/${part}` : part, files: [], children: [] };
          node.children.push(child);
        }
        child.files.push(f);
        node = child;
      }
    }
    const sort = (n: FolderNode) => {
      n.children.sort((x, y) => y.files.length - x.files.length);
      n.children.forEach(sort);
    };
    sort(root);
    return root;
  }

  function toggle(key: string) {
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    open = next;
  }

  function setAssemblies(list: SetupAssembly[], on: boolean) {
    const next = new Set(own);
    const include = [...includeFolders];
    for (const a of list) {
      if (!on) {
        next.delete(a.name);
        continue;
      }
      next.add(a.name);
      // an assembly that sits wholly in vendor folders counts only with its folder included
      if (ownFiles(a) === 0) include.push(commonFolder(a.files));
    }
    own = next;
    includeFolders = [...new Set(include)];
  }

  /** Ticks or unticks a folder inside a chosen assembly: an exclude or include rule, the most specific one wins. */
  function setFolder(node: FolderNode, on: boolean) {
    const under = (f: string) => f === node.path || f.startsWith(node.path + "/");
    const ex = excludeFolders.filter((f) => !under(f));
    const inc = includeFolders.filter((f) => !under(f));
    const without = new FolderRules({ excludeFolders: ex, includeFolders: inc }, data?.project.kind);
    if (!node.files.every((f) => without.isOwnFile(f) === on)) (on ? inc : ex).push(node.path);
    excludeFolders = ex;
    includeFolders = inc;
  }

  async function save() {
    if (!data) return;
    const config: Config = {
      assemblies: data.assemblies.filter((a) => own.has(a.name)).map((a) => a.name),
      excluded: data.assemblies.filter((a) => !own.has(a.name)).map((a) => a.name),
      excludeFolders,
      includeFolders,
    };
    saving = "Saving and indexing…";
    try {
      const { types } = await saveSetup(config);
      saving = `Saved. ${fmt(types)} types indexed.`;
      onSaved();
    } catch (e) {
      saving = `Could not save: ${e instanceof Error ? e.message : e}`;
    }
  }

  const tags = (a: SetupAssembly) =>
    [
      isNew(a) ? "new" : null,
      a.defaultReason === "test assembly" || a.defaultReason === "test project" ? "tests" : null,
      a.defaultReason === "outside Assets/" || a.defaultReason === "outside the solution" ? a.defaultReason : null,
    ].filter(
      (t): t is string => !!t,
    );
</script>

{#snippet folder(a: SetupAssembly, node: FolderNode, depth: number)}
  {@const n = node.files.filter((f) => rules.isOwnFile(f)).length}
  {@const chosen = own.has(a.name)}
  {@const key = `${a.name}::${node.path}`}
  <li class="folder" style:padding-left="{depth * 18}px">
    {#if node.children.length}
      <button class="twisty" aria-expanded={open.has(key)} aria-label="Show subfolders of {node.path}" onclick={() => toggle(key)}
        >{open.has(key) ? "▾" : "▸"}</button
      >
    {:else}<span class="twisty"></span>{/if}
    <input
      type="checkbox"
      disabled={!chosen}
      checked={chosen && n === node.files.length}
      indeterminate={chosen && n > 0 && n < node.files.length}
      onchange={() => setFolder(node, n < node.files.length)}
      aria-label="Own code: {node.path}"
    />
    <span class="fname" title={node.path}>{node.name}</span>
    <span class="count">{chosen && n < node.files.length ? `${fmt(n)} of ` : ""}{fmt(node.files.length)} files</span>
  </li>
  {#if open.has(key)}
    {#each node.children as child (child.path)}
      {@render folder(a, child, depth + 1)}
    {/each}
  {/if}
{/snippet}

<main>
  {#if failed}
    <p class="note">Could not read the project: {failed}</p>
  {:else if !data}
    <p class="note">Reading the project…</p>
  {:else}
    <header>
      <h1>Set up codezoom for {data.project.name}</h1>
      <p class="facts">
        {#if dotnet}
          .NET · {data.project.solutions?.length ? data.project.solutions.join(", ") : "no .sln: every .csproj under the folder"}
        {:else if data.project.unityVersion}
          Unity {data.project.unityVersion}{#if !data.project.unityInstalled}
            (not installed{data.project.standIn ? `: reading Unity ${data.project.standIn}'s DLLs instead` : ""}){/if}
        {:else}
          Unity version unknown (no ProjectSettings/ProjectVersion.txt)
        {/if}
        · {data.assemblies.filter((a) => a.files.length).length} {unit(2)} with C#
        · saves to <code>{data.configPath}</code>
      </p>
      {#if data.project.source === "asmdef"}
        <p class="warn">
          No .csproj files here (a fresh clone?), so assemblies come from .asmdef files and Unity's folder rules. Open the project once
          in Unity or Rider for exact results.
        </p>
      {/if}
      {#if dotnet}
        <p class="help">
          Tick the projects that are your code. Pre-ticks follow the default rules: every project in the solution, without test
          projects. Open a project to leave some of its folders out.
        </p>
      {:else}
        <p class="help">
          Tick the assemblies that are your code. Pre-ticks follow the default rules: assemblies under Assets/, without tests. Vendor
          folders (Plugins, ThirdParty, …) inside a ticked assembly stay out; open an assembly to change its folders.
        </p>
      {/if}
      {#if newCount}
        <p class="new">
          {newCount} new {unit(newCount)} since the last setup.
          <button onclick={() => (showAll = !showAll)}>{showAll ? "Show only new" : "Show all"}</button>
        </p>
      {/if}
    </header>

    {#each groups as g (g.folder)}
      {@const ticked = g.assemblies.filter((a) => own.has(a.name)).length}
      <section class="group">
        <label class="ghead">
          <input
            type="checkbox"
            checked={ticked === g.assemblies.length}
            indeterminate={ticked > 0 && ticked < g.assemblies.length}
            onchange={() => setAssemblies(g.assemblies, ticked < g.assemblies.length)}
          />
          <strong>{g.folder}</strong>
          <span class="count">{g.assemblies.length} {unit(g.assemblies.length)} · {fmt(g.files)} files</span>
        </label>
        {#if g.folder === OUTSIDE}
          <p class="ghint">
            The solution's projects reference these, but the solution does not list them. They are read as foreign libraries unless
            you tick them as your code.
          </p>
        {/if}
        <ul>
          {#each g.assemblies as a (a.name)}
            {@const chosen = own.has(a.name)}
            {@const n = ownFiles(a)}
            <li class="asm" class:chosen>
              <div class="arow">
                <button class="twisty" aria-expanded={open.has(a.name)} aria-label="Show folders of {a.name}" onclick={() => toggle(a.name)}
                  >{open.has(a.name) ? "▾" : "▸"}</button
                >
                <input type="checkbox" checked={chosen} onchange={() => setAssemblies([a], !chosen)} aria-label="Own code: {a.name}" />
                <span class="aname">{a.name}</span>
                {#each tags(a) as t (t)}<span class="tag {t === 'new' ? 'is-new' : ''}">{t}</span>{/each}
                <span class="count">{chosen && n < a.files.length ? `${fmt(n)} of ` : ""}{fmt(a.files.length)} files</span>
                <span class="ns">
                  {#each a.namespaces.slice(0, 4) as [root, count] (root)}<span class="chip" title="{count} files">{root}</span>{/each}
                  {#if a.namespaces.length > 4}<span class="more">+{a.namespaces.length - 4}</span>{/if}
                </span>
              </div>
              {#if open.has(a.name)}
                {@const root = tree(a)}
                {@const loose = root.files.length - root.children.reduce((k, c) => k + c.files.length, 0)}
                <ul class="folders">
                  {#if root.children.length}
                    {#each root.children as child (child.path)}{@render folder(a, child, 0)}{/each}
                    {#if loose}<li class="loose">{fmt(loose)} {loose === 1 ? "file" : "files"} directly in {root.path || "the project"}/</li>{/if}
                  {:else}
                    {@render folder(a, root, 0)}
                  {/if}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    <footer>
      <span><strong>{totals.assemblies}</strong> own {unit(2)} · <strong>{fmt(totals.files)}</strong> own files</span>
      {#if saving}<span class="status">{saving}</span>{/if}
      <button class="save" disabled={saving === "Saving and indexing…"} onclick={save}>Save and index</button>
    </footer>
  {/if}
</main>

<style>
  main {
    overflow-y: auto;
    padding: 24px 16px 0;
    min-height: 0;
  }
  header,
  .group {
    max-width: 920px;
    margin: 0 auto;
  }
  h1 {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 6px;
  }
  .facts,
  .help {
    color: var(--muted);
    margin: 4px 0;
  }
  .warn,
  .new {
    margin: 10px 0;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--back);
  }
  .new {
    border-color: var(--accent);
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .note {
    margin: 4rem auto;
    text-align: center;
    color: var(--muted);
  }
  .group {
    margin-top: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
  }
  .ghint {
    margin: 0;
    padding: 8px 12px;
    color: var(--muted);
    font-size: 12px;
    border-bottom: 1px solid var(--line);
  }
  .ghead {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .asm + .asm {
    border-top: 1px solid var(--line);
  }
  .arow {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 6px 12px;
    flex-wrap: wrap;
  }
  .asm:not(.chosen) .aname {
    color: var(--muted);
  }
  .aname {
    font-weight: 600;
  }
  .count {
    color: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .ns {
    display: flex;
    gap: 4px;
    margin-left: auto;
    flex-wrap: wrap;
  }
  .chip,
  .tag {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 10px;
    background: var(--bg);
    border: 1px solid var(--line);
  }
  .tag {
    color: var(--muted);
  }
  .tag.is-new {
    color: var(--accent);
    border-color: var(--accent);
  }
  .more {
    font-size: 11px;
    color: var(--faint);
  }
  .folders {
    padding: 0 12px 8px 40px;
  }
  .folder {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 2px 0;
  }
  .loose {
    padding: 2px 0 2px 44px;
    font-size: 12px;
    color: var(--faint);
  }
  .fname {
    font-family: var(--font-code);
    font-size: 12px;
  }
  .twisty {
    width: 18px;
    border: none;
    background: none;
    padding: 0;
    color: var(--muted);
    cursor: pointer;
    text-align: center;
  }
  footer {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: flex-end;
    max-width: 920px;
    margin: 16px auto 0;
    padding: 12px 0 16px;
    background: var(--bg);
    border-top: 1px solid var(--line);
  }
  footer > span:first-child {
    margin-right: auto;
  }
  .status {
    color: var(--muted);
  }
  button {
    border: 1px solid var(--line);
    background: var(--bg);
    border-radius: 5px;
    padding: 3px 10px;
    cursor: pointer;
  }
  .save {
    border-color: var(--accent);
    background: var(--accent-soft);
    padding: 6px 16px;
    font-weight: 600;
  }
  .save:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
