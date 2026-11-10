<script lang="ts">
  import { untrack } from "svelte";
  import type { BypassedInterface, DuplicateGroup, NodeInfo, Tangle, TypeSwitch } from "../../src/shared/types";
  import Search from "./Search.svelte";

  interface Props {
    /** The nodes search and the list offer: without assets when they are hidden. */
    nodes: NodeInfo[];
    /** Every Tangle, biggest first (ADR 0008). */
    tangles: Tangle[];
    /** Every group of Duplicates, biggest body first (ADR 0009). */
    duplicates: DuplicateGroup[];
    /** Every Bypassed interface, heaviest Weight first, and every Type switch (ADR 0011). */
    bypassed: BypassedInterface[];
    switches: TypeSwitch[];
    files: string[];
    query: string;
    onJump: (id: string) => void;
  }
  let { nodes, tangles, duplicates, bypassed, switches, files, query, onJump }: Props = $props();
  /** Names shown per Tangle or group before "+N more". */
  const NAMES = 6;
  /** Tangles and groups listed. */
  const LISTED = 12;
  let q = $state(untrack(() => query));

  const top = $derived(
    nodes
      .filter((n) => n.kind !== "library")
      .sort((a, b) => b.dependents - a.dependents)
      .slice(0, 24),
  );
  const byId = $derived(new Map(nodes.map((n) => [n.id, n])));
  // a Tangle is all types or all assets: hidden assets take their Tangles with them
  const shownTangles = $derived(tangles.filter((t) => byId.has(t[0].id)).slice(0, LISTED));
  const shownGroups = $derived(duplicates.slice(0, LISTED));
  const shownBypassed = $derived(bypassed.slice(0, LISTED));
  const shownSwitches = $derived(switches.slice(0, LISTED));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
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
    <h2>Duplicates <span>(members whose bodies have the same shape once names and literals are ignored)</span></h2>
    {#if shownGroups.length}
      <ul class="tangles dups">
        {#each shownGroups as g, i (i)}
          <li>
            <span class="size" title="{g.members.length} members, each body {g.nodes} syntax nodes">≡ {g.nodes} nodes</span>
            {#each g.members.slice(0, NAMES) as m, j (j)}
              {@const n = byId.get(m.id)}
              <button onclick={() => onJump(m.id)} title="{n?.full ?? m.id}&#10;{files[m.file]}:{m.line}">{n?.name ?? m.id}.{m.member}</button>
            {/each}
            {#if g.members.length > NAMES}<span class="more">+{g.members.length - NAMES} more</span>{/if}
          </li>
        {/each}
      </ul>
      {#if duplicates.length > shownGroups.length}
        <p class="none">+{duplicates.length - shownGroups.length} more groups: <code>codezoom hints --kind duplicate</code> lists them all.</p>
      {/if}
    {:else}
      <p class="none">None: no two own members of 50 syntax nodes or more have the same shape.</p>
    {/if}
    <h2>Bypassed interfaces <span>(own classes kept in fields or properties although they implement an own interface)</span></h2>
    {#if shownBypassed.length}
      <ul class="tangles dups">
        {#each shownBypassed as b, i (i)}
          <li>
            <span class="size" title="Weight {b.weight}">△</span>
            <button onclick={() => onJump(b.holder)} title="{byId.get(b.holder)?.full ?? b.holder}&#10;{files[b.fields[0].file]}:{b.fields[0].line}"
              >{nameOf(b.holder)}.{b.fields.map((f) => f.member).join(", ")}</button
            >
            <span class="more">keeps</span>
            <button onclick={() => onJump(b.held)} title={byId.get(b.held)?.full ?? b.held}>{nameOf(b.held)}</button>
            <span class="more">rather than {b.interfaces.map(nameOf).join(", ")}</span>
          </li>
        {/each}
      </ul>
      {#if bypassed.length > shownBypassed.length}
        <p class="none">+{bypassed.length - shownBypassed.length} more: <code>codezoom hints --kind bypassed-interface</code> lists them all.</p>
      {/if}
    {:else}
      <p class="none">None: no field or property keeps an own class that implements an own interface.</p>
    {/if}
    <h2>Type switches <span>(members testing two or more subtypes of one own base)</span></h2>
    {#if shownSwitches.length}
      <ul class="tangles dups">
        {#each shownSwitches as s, i (i)}
          <li>
            <span class="size">◇</span>
            <button onclick={() => onJump(s.type)} title="{byId.get(s.type)?.full ?? s.type}&#10;{files[s.tests[0].file]}:{s.tests[0].line}">{nameOf(s.type)}.{s.member}</button>
            <span class="more">tests {[...new Set(s.tests.map((t) => nameOf(t.id)))].join(", ")}: subtypes of</span>
            <button onclick={() => onJump(s.base)} title={byId.get(s.base)?.full ?? s.base}>{nameOf(s.base)}</button>
          </li>
        {/each}
      </ul>
      {#if switches.length > shownSwitches.length}
        <p class="none">+{switches.length - shownSwitches.length} more: <code>codezoom hints --kind type-switch</code> lists them all.</p>
      {/if}
    {:else}
      <p class="none">None: no member tests two or more own subtypes of one own base.</p>
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
  .dups .size {
    min-width: 76px;
  }
  .dups button {
    font: 600 12px var(--font-code);
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
