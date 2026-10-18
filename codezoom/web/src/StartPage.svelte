<script lang="ts">
  import { untrack } from "svelte";
  import type { NodeInfo } from "../../src/shared/types";
  import Search from "./Search.svelte";

  interface Props {
    /** The nodes search and the list offer: without assets when they are hidden. */
    nodes: NodeInfo[];
    query: string;
    onJump: (id: string) => void;
  }
  let { nodes, query, onJump }: Props = $props();
  let q = $state(untrack(() => query));

  const top = $derived(
    nodes
      .filter((n) => n.kind !== "library")
      .sort((a, b) => b.dependents - a.dependents)
      .slice(0, 24),
  );
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
</style>
