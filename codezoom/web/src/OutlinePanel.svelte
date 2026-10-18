<script lang="ts">
  import type { AssetOutline, NodeInfo, OutlineObject, RefWire } from "../../src/shared/types";
  import { loadOutline, revealInFinder } from "./api";

  interface Props {
    focus: NodeInfo;
    files: string[];
    /** References of the hovered neighbour; the GameObjects behind those in this asset are marked. */
    marks: RefWire[] | null;
    onDrill: (id: string) => void;
    onClose: () => void;
  }
  let { focus, files, marks, onDrill, onClose }: Props = $props();

  let outline = $state.raw<AssetOutline | null>(null);
  let failed = $state(false);
  let status = $state("");
  /** Objects the reader opened or closed by hand; the rest follow the defaults. */
  let toggled = $state.raw<Map<string, boolean>>(new Map());

  $effect(() => {
    const id = focus.id;
    outline = null;
    failed = false;
    toggled = new Map();
    let live = true;
    loadOutline(id).then(
      (o) => live && (outline = o),
      () => live && (failed = true),
    );
    return () => (live = false);
  });

  // the References behind the hovered edge that sit in this asset, by GameObject path
  const marked = $derived(new Set((marks ?? []).filter(([, f]) => files[f] === focus.full).map(([member]) => member)));
  const leadsToMark = (path: string) => [...marked].some((m) => m.startsWith(`${path}/`));
  const isOpen = (n: OutlineObject, depth: number) => toggled.get(n.path) ?? (depth < 1 || leadsToMark(n.path));
  const toggle = (n: OutlineObject, depth: number) => (toggled = new Map(toggled).set(n.path, !isOpen(n, depth)));

  async function reveal() {
    status = "Showing in Finder…";
    status = (await revealInFinder(focus.full)) ? "" : "Could not show it in Finder";
  }
</script>

{#snippet object(n: OutlineObject, depth: number)}
  {@const open = isOpen(n, depth)}
  <li class:marked={marked.has(n.path) || (n.path === "" && marked.has(""))}>
    <div class="row" style:padding-left="{depth * 16 + 4}px">
      {#if n.children.length}
        <button class="twisty" aria-expanded={open} aria-label="{open ? 'Close' : 'Open'} {n.name}" onclick={() => toggle(n, depth)}>{open ? "▾" : "▸"}</button>
      {:else}<span class="twisty"></span>{/if}
      <span class="name">{n.name}</span>
      {#if n.prefab}
        <button class="chip prefab" disabled={!n.prefab.id} onclick={() => n.prefab?.id && onDrill(n.prefab.id)} title={n.prefab.variant ? "The base prefab of this variant" : "A nested prefab"}
          >{n.prefab.variant ? "variant of " : "⧉ "}{n.prefab.name}</button
        >
      {/if}
      {#each n.components as c, i (i)}
        <button class="chip" class:own={c.own} disabled={!c.id} onclick={() => c.id && onDrill(c.id)}>{c.name}</button>
      {/each}
    </div>
    {#if n.fields.length || n.calls.length}
      <div class="details" style:padding-left="{depth * 16 + 24}px">
        {#each n.fields as f, i (i)}
          <div>
            <span class="field">{f.field}</span> =
            <button class="link" disabled={!f.id} onclick={() => f.id && onDrill(f.id)}>{f.value}</button>
          </div>
        {/each}
        {#each n.calls as c, i (i)}
          <div>
            calls <button class="link" disabled={!c.id} onclick={() => c.id && onDrill(c.id)}>{c.type ? `${c.type}.` : ""}{c.method}()</button>
          </div>
        {/each}
      </div>
    {/if}
    {#if open && n.children.length}
      <ul>
        {#each n.children as child, i (i)}
          {@render object(child, depth + 1)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<aside class="panel" aria-label="Outline of {focus.full}">
  <header>
    <div class="title">
      <strong>{focus.name}</strong>
      <button class="open" onclick={reveal} title="Show {focus.full} in Finder">Reveal in Finder</button>
      <button class="close" onclick={onClose} title="Close (Esc)" aria-label="Close outline">×</button>
    </div>
    <div class="path">{focus.full}</div>
    {#if status}<div class="status">{status}</div>{/if}
  </header>
  {#if failed}
    <p class="note">Could not read {focus.full}.</p>
  {:else if !outline}
    <p class="note">Loading…</p>
  {:else if !outline.roots.length}
    <p class="note">No GameObjects.</p>
  {:else}
    <ul class="tree">
      {#each outline.roots as root, i (i)}
        {@render object(root, 0)}
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    width: min(48vw, 640px);
    min-height: 0;
    border-left: 1px solid var(--line);
    background: var(--panel);
  }
  header {
    padding: 8px 12px 6px;
    border-bottom: 1px solid var(--line);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .title strong {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button {
    border: 1px solid var(--line);
    background: var(--bg);
    border-radius: 5px;
    padding: 2px 8px;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  button:hover:not(:disabled) {
    border-color: var(--accent);
  }
  button:disabled {
    cursor: default;
  }
  .close {
    border: none;
    background: none;
    font-size: 18px;
    line-height: 1;
    color: var(--muted);
  }
  .path,
  .status {
    margin-top: 4px;
    font-size: 11px;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .note {
    padding: 16px;
    color: var(--muted);
  }
  .tree {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 6px 0 24px;
    font-size: 12px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 2px 8px 2px 4px;
  }
  li.marked > .row,
  li.marked > .details {
    background: var(--accent-soft);
  }
  .twisty {
    width: 16px;
    padding: 0;
    border: none;
    background: none;
    color: var(--muted);
    text-align: center;
    flex: none;
  }
  .name {
    font-weight: 600;
    margin-right: 4px;
  }
  .chip {
    padding: 0 6px;
    font-size: 11px;
    color: var(--muted);
    background: var(--bg);
  }
  .chip.own {
    color: var(--ink);
    border-color: var(--accent);
  }
  .chip.prefab {
    color: var(--ink);
  }
  .details {
    padding: 0 8px 4px;
    color: var(--muted);
    font-size: 11px;
  }
  .field {
    font-family: var(--font-code);
  }
  .link {
    padding: 0 4px;
    font-size: 11px;
  }
  .link:disabled {
    border-color: transparent;
    background: none;
  }
</style>
