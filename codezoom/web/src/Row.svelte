<script lang="ts">
  import { isAssetKind } from "../../src/shared/types";
  import { BOX_H, type Box, type RowLayout } from "./layout";

  /** An asset is drawn as a UML artifact: a page with its top-right corner folded. */
  const FOLD = 9;

  interface Props {
    title: string;
    hint: string;
    total: number;
    layout: RowLayout;
    position: "above" | "below";
    hoveredId: string | null;
    filter: string;
    stripEl?: HTMLDivElement;
    onScroll: () => void;
    onPick: (box: Box, el: Element) => void;
    onHover: (box: Box | null, el: Element | null) => void;
  }
  let {
    title,
    hint,
    total,
    layout,
    position,
    hoveredId,
    filter = $bindable(""),
    stripEl = $bindable(),
    onScroll,
    onPick,
    onHover,
  }: Props = $props();

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
    <span class="count">{filter.trim() ? `${layout.boxes.length} of ${total}` : total}</span>
    <span class="hint">{hint}</span>
    <input class="filter" type="search" placeholder="Filter" title="Substrings or word starts: CA, CampAp" bind:value={filter} spellcheck="false" />
  </div>
{/snippet}

<section class={position}>
  {#if position === "above"}{@render header()}{/if}
  <div class="strip" bind:this={stripEl} onscroll={onScroll} onwheel={onWheel}>
    {#if layout.boxes.length === 0}
      <div class="empty" style:height="{layout.height}px">{total === 0 ? "None" : "No match"}</div>
    {:else}
      <svg width={layout.width} height={layout.height} role="list" aria-label={title}>
        {#each layout.boxes as b (b.n.id)}
          {@const lib = b.node.kind === "library"}
          {@const asset = isAssetKind(b.node.kind)}
          <g
            class="box"
            class:hot={hoveredId === b.n.id}
            class:previous={b.previous}
            class:lib
            class:asset
            data-id={b.n.id}
            data-size={b.size}
            transform="translate({b.x},{b.y}) scale({b.scale})"
            role="button"
            tabindex="0"
            aria-label="{b.previous ? 'Back to' : 'Drill to'} {b.node.full}"
            onclick={(e) => onPick(b, e.currentTarget)}
            onkeydown={(e) => e.key === "Enter" && onPick(b, e.currentTarget)}
            onmouseenter={(e) => onHover(b, e.currentTarget)}
            onmouseleave={() => onHover(null, null)}
          >
            <rect width={b.innerW} height={BOX_H} rx={lib ? BOX_H / 2 : asset ? 0 : 3} vector-effect="non-scaling-stroke" />
            {#if asset}
              <path class="corner" d="M{b.innerW - FOLD},0 L{b.innerW},{FOLD} L{b.innerW},0 Z" vector-effect="non-scaling-stroke" />
              <path class="fold" d="M{b.innerW - FOLD},0 V{FOLD} H{b.innerW} M{b.innerW - FOLD},0 L{b.innerW},{FOLD}" vector-effect="non-scaling-stroke" />
            {/if}
            <text class="label" x={b.innerW / 2} y={16}>{b.label}</text>
            <text class="name" class:abstract={b.node.abstract} x={b.innerW / 2} y={33}>{b.name}</text>
            {#if b.previous}<text class="mark back" x={lib ? 14 : 5} y={12}>↩</text>{/if}
            {#if b.n.cycle}<text class="mark cycle" x={b.innerW - (lib ? 14 : asset ? FOLD + 3 : 5)} y={12} text-anchor="end">⟲</text>{/if}
          </g>
        {/each}
      </svg>
    {/if}
  </div>
  {#if position === "below"}{@render header()}{/if}
</section>

<style>
  section {
    /* positioned, so boxes paint over the edge lines that pass behind them */
    position: relative;
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
  .corner {
    fill: var(--bg);
    stroke: var(--bg);
    stroke-width: 2;
  }
  .fold {
    fill: none;
    stroke: var(--box-stroke);
    stroke-width: 1;
  }
  .box.hot .fold,
  .box:focus-visible .fold {
    stroke: var(--accent);
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
