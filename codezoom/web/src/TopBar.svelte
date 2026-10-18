<script lang="ts">
  import type { Meta, NodeInfo } from "../../src/shared/types";
  import Search from "./Search.svelte";

  interface Props {
    meta: Meta;
    nodes: Map<string, NodeInfo>;
    /** What the search box offers: without assets when they are hidden. */
    searchNodes: NodeInfo[];
    trail: string[];
    lastMove: { kind: string; ms: number; motion: string; fps: number | null; longestFrameMs: number | null } | null;
    onJump: (id: string) => void;
    onTrail: (index: number) => void;
    /** Opens the setup page; `onlyNew` for the assemblies the config has not reviewed. */
    onSetup: (onlyNew: boolean) => void;
    /** The "Show assets" toggle's state; null when the project has no assets. */
    showAssets: boolean | null;
    onShowAssets: (on: boolean) => void;
    /** Off: Drill and Back cut like Jump, nothing moves on its own. */
    showAnimations: boolean;
    onShowAnimations: (on: boolean) => void;
  }
  let { meta, nodes, searchNodes, trail, lastMove, onJump, onTrail, onSetup, showAssets, onShowAssets, showAnimations, onShowAnimations }: Props =
    $props();
  const newCount = $derived(meta.newAssemblies?.length ?? 0);
  const unit = (n: number) => (meta.kind === "dotnet" ? (n === 1 ? "project" : "projects") : n === 1 ? "assembly" : "assemblies");

  let crumbs: HTMLElement | undefined = $state();
  $effect(() => {
    void trail;
    if (crumbs) crumbs.scrollLeft = crumbs.scrollWidth;
  });
</script>

<header>
  <div class="brand" title="{meta.stats.types} types, {meta.stats.libraries} foreign libraries, {meta.stats.edges} edges">
    <strong>codezoom</strong>
    <span>{meta.project}</span>
  </div>
  <nav class="trail" bind:this={crumbs} aria-label="Trail">
    {#each trail as id, i (i)}
      {#if i > 0}<span class="sep">›</span>{/if}
      {#if i === trail.length - 1}
        <span class="crumb current" title={nodes.get(id)?.full ?? id}>{nodes.get(id)?.name ?? id}</span>
      {:else}
        <button class="crumb" title={nodes.get(id)?.full ?? id} onclick={() => onTrail(i)}>{nodes.get(id)?.name ?? id}</button>
      {/if}
    {/each}
  </nav>
  {#if lastMove}
    <span
      class="latency"
      title="Time from the move until the new screen is laid out and drawing starts{lastMove.fps ? `; zoom frame rate (longest frame ${lastMove.longestFrameMs} ms)` : ''}"
      >{lastMove.kind} {lastMove.ms} ms{lastMove.fps ? ` · ${lastMove.fps} fps` : ""}</span
    >
  {/if}
  {#each meta.notes ?? [] as note (note)}
    <span class="index-note" role="note" title={note.replace(/`/g, "")}>{note.replace(/`/g, "")}</span>
  {/each}
  {#if newCount}
    <button class="setup new" onclick={() => onSetup(true)} title={meta.newAssemblies?.join(", ")}>{newCount} new {unit(newCount)}: review</button>
  {/if}
  {#if showAssets !== null}
    <label class="toggle" title="Scenes, prefabs and ScriptableObject assets wired to your code">
      <input type="checkbox" checked={showAssets} onchange={(e) => onShowAssets(e.currentTarget.checked)} />
      Show assets
    </label>
  {/if}
  <label class="toggle" title="Zoom into a box on Drill and out on Back; off, every move is a cut">
    <input type="checkbox" checked={showAnimations} onchange={(e) => onShowAnimations(e.currentTarget.checked)} />
    Show animations
  </label>
  <button class="setup" onclick={() => onSetup(false)} title="Choose which {unit(2)} are your code">Setup</button>
  <Search nodes={searchNodes} {onJump} />
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
    min-width: 0;
  }
  .brand {
    display: flex;
    gap: 8px;
    align-items: baseline;
    white-space: nowrap;
  }
  .brand span {
    color: var(--muted);
  }
  .trail {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    white-space: nowrap;
    scrollbar-width: none;
    min-width: 0;
  }
  .crumb {
    border: none;
    background: none;
    padding: 2px 4px;
    border-radius: 4px;
    color: var(--muted);
    cursor: pointer;
  }
  button.crumb:hover {
    background: var(--accent-soft);
    color: var(--ink);
  }
  .crumb.current {
    color: var(--ink);
    font-weight: 600;
    cursor: default;
  }
  .sep {
    color: var(--faint);
  }
  .setup {
    border: 1px solid var(--line);
    background: var(--bg);
    border-radius: 5px;
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
    font-size: 12px;
  }
  .setup:hover,
  .setup.new {
    border-color: var(--accent);
  }
  .setup.new {
    background: var(--accent-soft);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    white-space: nowrap;
    color: var(--muted);
    cursor: pointer;
  }
  .index-note {
    max-width: 440px;
    font-size: 11px;
    line-height: 1.3;
    color: var(--ink);
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    border-radius: 5px;
    padding: 3px 8px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .latency {
    color: var(--faint);
    font-size: 11px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
</style>
