<script lang="ts">
  import type { FocusBox, FocusMember, NodeInfo } from "../../src/shared/types";
  import { FONT_CODE, FONT_UI, fitText, textWidth } from "./measure";

  interface Props {
    node: NodeInfo;
    box: FocusBox;
    files: string[];
    boxEl?: HTMLDivElement;
    /** Clicking the Focus shows its source. */
    onOpenSource?: () => void;
  }
  let { node, box, files, boxEl = $bindable(), onOpenSource }: Props = $props();

  const CODE = `12px ${FONT_CODE}`;
  const LINE = 18;
  const PAD = 12;
  const HEADER = 62;
  const lib = $derived(node.kind === "library");

  const lineText = (m: FocusMember) => `${m.vis} ${m.event ? "«event» " : ""}${m.text}`;
  const width = $derived.by(() => {
    const natural = Math.max(
      textWidth(node.name, `600 15px ${FONT_UI}`),
      textWidth(node.namespace, `11px ${FONT_UI}`),
      ...[...box.attributes, ...box.operations].map((m) => textWidth(lineText(m), CODE) + (m.serialized ? 70 : 0)),
    );
    return Math.round(Math.min(Math.max(natural + PAD * 2, 260), 760));
  });
  const maxText = $derived(width - PAD * 2);

  const attrTop = HEADER;
  const opTop = $derived(attrTop + (box.attributes.length ? box.attributes.length * LINE + 10 : 10));
  const footTop = $derived(opTop + (box.operations.length ? box.operations.length * LINE + 10 : 10));
  const height = $derived(lib ? HEADER + 34 : footTop + (box.hidden ? 24 : 4));
  const where = $derived(box.file >= 0 ? `${files[box.file]}:${box.line}` : "");
</script>

<div
  class="focus"
  bind:this={boxEl}
  style:width="{width}px"
  title={lib ? node.full : `${node.full}\n${where}\n${box.assembly}\nClick for the source`}
  role="button"
  tabindex="0"
  onclick={() => onOpenSource?.()}
  onkeydown={(e) => e.key === "Enter" && onOpenSource?.()}
>
  <svg {width} {height} role="img" aria-label="Focus: {node.full}">
    <rect class="frame" class:lib x="0.5" y="0.5" width={width - 1} height={height - 1} rx={lib ? 22 : 3} />
    <text class="label" x={width / 2} y="18">«{node.label}»</text>
    <text class="name" class:abstract={node.abstract} x={width / 2} y="38">{fitText(node.name, `600 15px ${FONT_UI}`, maxText)}</text>
    <text class="ns" x={width / 2} y="53">{fitText(lib ? "foreign library" : node.namespace || "(global namespace)", `11px ${FONT_UI}`, maxText)}</text>
    {#if lib}
      <text class="note" x={width / 2} y={HEADER + 18}>Only its Dependents are shown</text>
    {:else}
      <line x1="0" x2={width} y1={attrTop} y2={attrTop} />
      {#each box.attributes as m, i (i)}
        {@const y = attrTop + 5 + LINE * i + 13}
        <text class="member" class:static={m.isStatic} class:abstract={m.isAbstract} x={PAD} {y}>{fitText(lineText(m), CODE, maxText - (m.serialized ? 70 : 0))}</text>
        {#if m.serialized}<text class="tag" x={width - PAD} {y}>serialized</text>{/if}
      {/each}
      <line x1="0" x2={width} y1={opTop} y2={opTop} />
      {#each box.operations as m, i (i)}
        <text class="member" class:static={m.isStatic} class:abstract={m.isAbstract} x={PAD} y={opTop + 5 + LINE * i + 13}>{fitText(lineText(m), CODE, maxText)}</text>
      {/each}
      {#if box.hidden}
        <text class="hidden" x={PAD} y={footTop + 16}>+{box.hidden} private</text>
      {/if}
    {/if}
  </svg>
</div>

<style>
  .focus {
    cursor: pointer;
    outline: none;
    max-height: 100%;
    max-width: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    flex: none;
    border-radius: 4px;
    scrollbar-width: thin;
  }
  svg {
    display: block;
  }
  .frame {
    fill: var(--box);
    stroke: var(--box-stroke);
    stroke-width: 1.5;
  }
  .frame.lib {
    fill: var(--lib);
    stroke: var(--lib-stroke);
  }
  line {
    stroke: var(--box-stroke);
    stroke-width: 1;
  }
  text {
    fill: var(--ink);
  }
  .label,
  .name,
  .ns,
  .note {
    text-anchor: middle;
  }
  .label {
    font-size: 11px;
    fill: var(--muted);
  }
  .name {
    font-size: 15px;
    font-weight: 600;
  }
  .abstract {
    font-style: italic;
  }
  .ns {
    font-size: 11px;
    fill: var(--faint);
  }
  .note {
    font-size: 12px;
    fill: var(--muted);
  }
  .member {
    font: 12px var(--font-code);
  }
  .member.static {
    text-decoration: underline;
  }
  .tag {
    font-size: 10px;
    fill: var(--muted);
    text-anchor: end;
  }
  .hidden {
    font-size: 11px;
    fill: var(--muted);
  }
</style>
