<script lang="ts">
  import type { NodeInfo } from "../../src/shared/types";
  import { search } from "../../src/shared/search";

  interface Props {
    nodes: NodeInfo[];
    onJump: (id: string) => void;
    /** The big search box on the start page. */
    large?: boolean;
    query?: string;
  }
  let { nodes, onJump, large = false, query = $bindable("") }: Props = $props();

  let input: HTMLInputElement | undefined = $state();
  let open = $state(false);
  let active = $state(0);
  const results = $derived(search(nodes, query, 30));

  $effect(() => {
    void query;
    active = 0;
  });

  function pick(n: NodeInfo) {
    open = false;
    query = "";
    input?.blur();
    onJump(n.id);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      active = Math.min(active + 1, results.length - 1);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      active = Math.max(active - 1, 0);
      e.preventDefault();
    } else if (e.key === "Enter" && results[active]) {
      pick(results[active]);
    } else if (e.key === "Escape") {
      open = false;
      input?.blur();
    }
  }

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === "/" && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      input?.focus();
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="search" class:large>
  <input
    bind:this={input}
    bind:value={query}
    type="search"
    placeholder={large ? "Jump to a type or library — substrings or word starts (CA, CampAp → CampaignApplication)" : "Jump…  ( / )"}
    spellcheck="false"
    autocomplete="off"
    onfocus={() => (open = true)}
    onblur={() => setTimeout(() => (open = false), 150)}
    oninput={() => (open = true)}
    onkeydown={onKey}
  />
  {#if (open || large) && results.length}
    <ul class:floating={!large}>
      {#each results as n, i (n.id)}
        <li>
          <button class:active={i === active} onmousedown={(e) => e.preventDefault()} onclick={() => pick(n)} onmouseenter={() => (active = i)}>
            <span class="name">{n.name}</span>
            <span class="label">«{n.label}»</span>
            <span class="full">{n.kind === "library" ? n.full : n.namespace}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if (open || large) && query.trim()}
    <ul class:floating={!large}><li class="none">No match</li></ul>
  {/if}
</div>

<style>
  .search {
    position: relative;
    width: 300px;
  }
  .search.large {
    width: min(640px, 100%);
    margin: 0 auto;
  }
  input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    outline: none;
  }
  .large input {
    padding: 10px 14px;
    font-size: 15px;
  }
  input:focus {
    border-color: var(--accent);
  }
  ul {
    list-style: none;
    margin: 4px 0 0;
    padding: 4px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    max-height: 60vh;
    overflow-y: auto;
  }
  ul.floating {
    position: absolute;
    right: 0;
    width: 480px;
    z-index: 20;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.15);
  }
  li button {
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: 8px;
    align-items: baseline;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    padding: 5px 8px;
    border-radius: 4px;
    cursor: pointer;
  }
  li button.active {
    background: var(--accent-soft);
  }
  .name {
    font-weight: 600;
  }
  .label {
    color: var(--muted);
    font-size: 11px;
  }
  .full {
    color: var(--faint);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }
  .none {
    padding: 6px 8px;
    color: var(--muted);
  }
</style>
