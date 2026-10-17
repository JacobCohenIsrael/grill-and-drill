<script lang="ts">
  import { BOX_H, ROW_VPAD, type Box } from "./layout";

  interface Props {
    title: string;
    hint: string;
    total: number;
    boxes: Box[];
    width: number;
    position: "above" | "below";
    hoveredId: string | null;
    filter: string;
    stripEl?: HTMLDivElement;
    onScroll: () => void;
    onPick: (box: Box) => void;
    onHover: (box: Box | null, el: Element | null) => void;
  }
  let {
    title,
    hint,
    total,
    boxes,
    width,
    position,
    hoveredId,
    filter = $bindable(""),
    stripEl = $bindable(),
    onScroll,
    onPick,
    onHover,
  }: Props = $props();

  const height = BOX_H + ROW_VPAD * 2;

  function onWheel(e: WheelEvent) {
    // a mouse wheel scrolls the strip sideways
    if (stripEl && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      stripEl.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }
</script>

{#snippet header()}
  <div class="header">
    <span class="title">{title}</span>
    <span class="count">{filter.trim() ? `${boxes.length} of ${total}` : total}</span>
    <span class="hint">{hint}</span>
    <input class="filter" type="search" placeholder="Filter" title="Substrings or word starts: CA, CampAp" bind:value={filter} spellcheck="false" />
  </div>
{/snippet}

<section class={position}>
  {#if position === "above"}{@render header()}{/if}
  <div class="strip" bind:this={stripEl} onscroll={onScroll} onwheel={onWheel}>
    {#if boxes.length === 0}
      <div class="empty" style:height="{height}px">{total === 0 ? "None" : "No match"}</div>
    {:else}
      <svg {width} {height} role="list">
        {#each boxes as b (b.n.id)}
          {@const lib = b.node.kind === "library"}
          <g
            class="box"
            class:hot={hoveredId === b.n.id}
            class:previous={b.previous}
            class:lib
            transform="translate({b.x},{ROW_VPAD})"
            role="button"
            tabindex="0"
            aria-label="{b.previous ? 'Back to' : 'Drill to'} {b.node.full}"
            onclick={() => onPick(b)}
            onkeydown={(e) => e.key === "Enter" && onPick(b)}
            onmouseenter={(e) => onHover(b, e.currentTarget)}
            onmouseleave={() => onHover(null, null)}
          >
            <rect width={b.w} height={BOX_H} rx={lib ? BOX_H / 2 : 3} />
            <text class="label" x={b.w / 2} y={16}>{b.label}</text>
            <text class="name" class:abstract={b.node.abstract} x={b.w / 2} y={33}>{b.name}</text>
            {#if b.previous}<text class="mark back" x={lib ? 14 : 5} y={12}>↩</text>{/if}
            {#if b.n.cycle}<text class="mark cycle" x={b.w - (lib ? 14 : 5)} y={12} text-anchor="end">⟲</text>{/if}
          </g>
        {/each}
      </svg>
    {/if}
  </div>
  {#if position === "below"}{@render header()}{/if}
</section>

<style>
  section {
    flex: none;
    min-width: 0;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
  }
  .title {
    font-weight: 600;
  }
  .count {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .hint {
    color: var(--faint);
    font-size: 11px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .filter {
    width: 160px;
    padding: 3px 8px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--panel);
    outline: none;
  }
  .filter:focus {
    border-color: var(--accent);
  }
  .strip {
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }
  svg {
    display: block;
  }
  .empty {
    display: flex;
    align-items: center;
    padding: 0 16px;
    color: var(--faint);
  }
  .box {
    cursor: pointer;
    outline: none;
  }
  .box rect {
    fill: var(--box);
    stroke: var(--box-stroke);
    stroke-width: 1;
  }
  .box.lib rect {
    fill: var(--lib);
    stroke: var(--lib-stroke);
  }
  .box.previous rect {
    stroke: var(--back);
    stroke-width: 2;
  }
  .box.hot rect,
  .box:focus-visible rect {
    fill: var(--box-hover);
    stroke: var(--accent);
  }
  text {
    text-anchor: middle;
    fill: var(--ink);
    user-select: none;
  }
  .label {
    font-size: 11px;
    fill: var(--muted);
  }
  .name {
    font-size: 13px;
    font-weight: 600;
  }
  .name.abstract {
    font-style: italic;
  }
  .mark {
    font-size: 11px;
    text-anchor: start;
  }
  .mark.back {
    fill: var(--back);
  }
  .mark.cycle {
    fill: var(--cycle);
    text-anchor: end;
  }
</style>
