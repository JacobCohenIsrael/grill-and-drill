<script lang="ts">
  import { untrack } from "svelte";
  import type { NodeInfo, Tangle } from "../../src/shared/types";
  import Search from "./Search.svelte";

  interface Props {
    /** The nodes search and the list offer: without assets when they are hidden. */
    nodes: NodeInfo[];
    /** Every Tangle, biggest first (ADR 0008). */
    tangles: Tangle[];
    query: string;
    onJump: (id: string) => void;
  }
  let { nodes, tangles, query, onJump }: Props = $props();
  /** Names shown per Tangle before "+N more". */
  const NAMES = 6;
  let q = $state(untrack(() => query));

  const top = $derived(
    nodes
      .filter((n) => n.kind !== "library")
      .sort((a, b) => b.dependents - a.dependents)
      .slice(0, 24),
  );
  const byId = $derived(new Map(nodes.map((n) => [n.id, n])));
  // a Tangle is all types or all assets: hidden assets take their Tangles with them
  const shownTangles = $derived(tangles.filter((t) => byId.has(t[0].id)).slice(0, 12));
</script>

<main>
  <h1>Pick a first Focus</h1>
  <Search {nodes} {onJump} large bind:query={q} />
  {#if !q.trim()}
    <h2>Most depended-on <span>(Dependents)</span></h2>
    <ol>
      {#each top as n (n.id)}
        <li>
          <button onclick={() => onJump(n.id)} title={n.full}>
            <span class="name">{n.name}</span>
            <span class="label">«{n.label}»</span>
            <span class="count" title="Dependents">{n.dependents}</span>
          </button>
        </li>
      {/each}
    </ol>
    <h2>Tangles <span>(nodes that can each reach every other through their Dependencies)</span></h2>
    {#if shownTangles.length}
      <ul class="tangles">
        {#each shownTangles as t, i (i)}
          <li>
            <span class="size" title="{t.length} nodes">⟲ {t.length}</span>
            {#each t.slice(0, NAMES) as { id, inside } (id)}
              {@const n = byId.get(id)!}
              <button onclick={() => onJump(id)} title="{n.full}: {inside} edges inside the Tangle">{n.name}</button>
            {/each}
            {#if t.length > NAMES}<span class="more">+{t.length - NAMES} more</span>{/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="none">None: no node can reach itself through its Dependencies.</p>
    {/if}
  {/if}
</main>

<style>
  main {
    overflow-y: auto;
    padding: 48px 16px;
  }
  h1 {
    text-align: center;
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 20px;
  }
  h2 {
    max-width: 640px;
    margin: 32px auto 8px;
    font-size: 13px;
    color: var(--muted);
    font-weight: 600;
  }
  ol {
    list-style: none;
    max-width: 640px;
    margin: 0 auto;
    padding: 0;
    columns: 2;
  }
  li button {
    display: flex;
    white-space: nowrap;
    gap: 8px;
    align-items: baseline;
    width: 100%;
    border: none;
    background: none;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
  }
  li button:hover {
    background: var(--accent-soft);
  }
  .name {
    font-weight: 600;
  }
  .label,
  .count {
    color: var(--muted);
    font-size: 11px;
  }
  li .count {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
  .tangles {
    list-style: none;
    max-width: 640px;
    margin: 0 auto;
    padding: 0;
  }
  .tangles li {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 4px;
    align-items: baseline;
    padding: 4px 8px;
  }
  .tangles .size {
    color: var(--cycle);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    min-width: 44px;
  }
  .tangles button {
    display: inline-block;
    width: auto;
    border: none;
    background: none;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  }
  .tangles button:hover {
    background: var(--accent-soft);
  }
  .more,
  .none {
    color: var(--muted);
    font-size: 11px;
  }
  .none {
    max-width: 640px;
    margin: 0 auto;
    padding: 0 8px;
  }
</style>
