<script lang="ts">
  import type { Meta, NodeInfo } from "../../src/shared/types";
  import Search from "./Search.svelte";

  interface Props {
    meta: Meta;
    nodes: Map<string, NodeInfo>;
    trail: string[];
    lastMove: { kind: string; ms: number } | null;
    onJump: (id: string) => void;
    onTrail: (index: number) => void;
  }
  let { meta, nodes, trail, lastMove, onJump, onTrail }: Props = $props();

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
    <span class="latency" title="Time from the move until the new screen is laid out, ready to paint">{lastMove.kind} {lastMove.ms} ms</span>
  {/if}
  <Search nodes={meta.nodes} {onJump} />
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
  .latency {
    color: var(--faint);
    font-size: 11px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
</style>
