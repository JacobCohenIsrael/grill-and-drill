<script lang="ts">
  import type { NodeInfo } from "../../src/shared/types";
  import type { FocusHints } from "./hints";

  interface Props {
    /** What to list: one member's tags, or one part of the hint line. */
    hints: FocusHints;
    focus: NodeInfo;
    nodes: Map<string, NodeInfo>;
    anchor: DOMRect;
    files: string[];
    onJump: (id: string) => void;
    onEnter: () => void;
    onLeave: () => void;
  }
  let { hints, focus, nodes, anchor, files, onJump, onEnter, onLeave }: Props = $props();

  const WIDTH = 420;
  const left = $derived(Math.max(8, Math.min(anchor.left, window.innerWidth - WIDTH - 8)));
  // below the anchor when there is room, else above it
  const below = $derived(window.innerHeight - anchor.bottom > 200 || anchor.top < window.innerHeight / 2);
  const style = $derived(
    below
      ? `left:${left}px; top:${anchor.bottom + 4}px; max-height:${Math.max(160, window.innerHeight - anchor.bottom - 24)}px`
      : `left:${left}px; bottom:${window.innerHeight - anchor.top + 4}px; max-height:${Math.max(160, anchor.top - 24)}px`,
  );
  const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
  const nameOf = (id: string) => nodes.get(id)?.name ?? id;
</script>

{#snippet jump(id: string, text: string, where: string, title: string)}
  {#if id === focus.id}
    <div class="row" {title}>
      <span class="member">{text}</span>
      <span class="where">{where}</span>
    </div>
  {:else}
    <button class="row" onclick={() => onJump(id)} title="Jump to {nodes.get(id)?.full ?? id}&#10;{title}">
      <span class="member">{text}</span>
      <span class="where">{where}</span>
    </button>
  {/if}
{/snippet}

<div class="pop" {style} role="tooltip" onmouseenter={onEnter} onmouseleave={onLeave}>
  {#each hints.duplicates ?? [] as d, i (i)}
    <div class="hint">
      <div class="head" title="{files[d.file]}:{d.line}">
        ≡ <strong>{focus.name}.{d.member}</strong>
        <span class="size">{d.nodes} syntax nodes, group {d.group}</span>
      </div>
      <div class="sub">Same shape, once names and literals are ignored:</div>
      <ul>
        {#each d.duplicates as m, j (j)}
          <li>
            {@render jump(m.id, `${nameOf(m.id)}.${m.member}`, `${baseName(files[m.file])}:${m.line}`, `${files[m.file]}:${m.line}`)}
          </li>
        {/each}
      </ul>
    </div>
  {/each}
  {#each hints.bypassed ?? [] as b, i (i)}
    <div class="hint">
      <div class="head">
        △ <strong>{focus.name} keeps {nameOf(b.held)}</strong>
      </div>
      <div class="sub">In these fields and properties, though {nameOf(b.held)} implements an interface:</div>
      <ul>
        {#each b.fields as f, j (j)}
          <li>
            <div class="row" title="{files[f.file]}:{f.line}">
              <span class="member">{focus.name}.{f.member}</span>
              <span class="where">{baseName(files[f.file])}:{f.line}</span>
            </div>
          </li>
        {/each}
        <li>{@render jump(b.held, nameOf(b.held), "the class", nodes.get(b.held)?.full ?? b.held)}</li>
        {#each b.interfaces as id (id)}
          <li>{@render jump(id, nameOf(id), "its interface", nodes.get(id)?.full ?? id)}</li>
        {/each}
      </ul>
    </div>
  {/each}
  {#each hints.switches ?? [] as s, i (i)}
    <div class="hint">
      <div class="head">
        ◇ <strong>{focus.name}.{s.member}</strong>
        <span class="size">tests {new Set(s.tests.map((t) => t.id)).size} subtypes of {nameOf(s.base)}</span>
      </div>
      <div class="sub">Each test or cast, where it is:</div>
      <ul>
        {#each s.tests as t, j (j)}
          <li>{@render jump(t.id, nameOf(t.id), `${baseName(files[t.file])}:${t.line}`, `${files[t.file]}:${t.line}`)}</li>
        {/each}
        <li>{@render jump(s.base, nameOf(s.base), "their base", nodes.get(s.base)?.full ?? s.base)}</li>
      </ul>
    </div>
  {/each}
</div>

<style>
  .pop {
    position: fixed;
    z-index: 30;
    width: 420px;
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.18);
    padding: 8px 10px;
  }
  .hint {
    padding: 6px 8px;
    border-left: 2px solid var(--cycle);
    background: color-mix(in srgb, var(--cycle) 8%, transparent);
    border-radius: 0 4px 4px 0;
    font-size: 12px;
  }
  .hint + .hint {
    margin-top: 6px;
  }
  .head {
    color: var(--cycle);
    display: flex;
    gap: 6px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .head strong {
    color: var(--ink);
    font: 600 12px var(--font-code);
  }
  .size,
  .sub {
    color: var(--muted);
    font-size: 11px;
  }
  ul {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
  }
  .row {
    display: flex;
    width: 100%;
    gap: 12px;
    justify-content: space-between;
    align-items: baseline;
    border: none;
    background: none;
    padding: 2px 4px;
    border-radius: 4px;
    text-align: left;
    font: 12px var(--font-code);
  }
  button {
    cursor: pointer;
  }
  button:hover,
  button:focus-visible {
    background: var(--accent-soft);
    outline: none;
  }
  .member {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .where {
    color: var(--muted);
    white-space: nowrap;
  }
</style>
