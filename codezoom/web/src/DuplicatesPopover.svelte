<script lang="ts">
  import type { FocusDuplicate, NodeInfo } from "../../src/shared/types";

  interface Props {
    /** The Focus members shown: one when hovering a member's ≡, all of them from the hint line. */
    items: FocusDuplicate[];
    focus: NodeInfo;
    nodes: Map<string, NodeInfo>;
    anchor: DOMRect;
    files: string[];
    onJump: (id: string) => void;
    onEnter: () => void;
    onLeave: () => void;
  }
  let { items, focus, nodes, anchor, files, onJump, onEnter, onLeave }: Props = $props();

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

<div class="pop" {style} role="tooltip" onmouseenter={onEnter} onmouseleave={onLeave}>
  {#each items as d, i (i)}
    <div class="dup">
      <div class="head" title="{files[d.file]}:{d.line}">
        ≡ <strong>{focus.name}.{d.member}</strong>
        <span class="size">{d.nodes} syntax nodes, group {d.group}</span>
      </div>
      <div class="sub">Same shape, once names and literals are ignored:</div>
      <ul>
        {#each d.duplicates as m, j (j)}
          <li>
            {#if m.id === focus.id}
              <div class="row" title="In {focus.name} itself&#10;{files[m.file]}:{m.line}">
                <span class="member">{focus.name}.{m.member}</span>
                <span class="where">{baseName(files[m.file])}:{m.line}</span>
              </div>
            {:else}
              <button class="row" onclick={() => onJump(m.id)} title="Jump to {nodes.get(m.id)?.full ?? m.id}&#10;{files[m.file]}:{m.line}">
                <span class="member">{nameOf(m.id)}.{m.member}</span>
                <span class="where">{baseName(files[m.file])}:{m.line}</span>
              </button>
            {/if}
          </li>
        {/each}
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
  .dup {
    padding: 6px 8px;
    border-left: 2px solid var(--cycle);
    background: color-mix(in srgb, var(--cycle) 8%, transparent);
    border-radius: 0 4px 4px 0;
    font-size: 12px;
  }
  .dup + .dup {
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
