<script lang="ts">
  import { isAssetKind, type FocusBox, type FocusMember, type NodeInfo } from "../../src/shared/types";
  import type { FocusHints } from "./hints";
  import { FONT_CODE, FONT_UI, fitText, textWidth } from "./measure";

  interface Props {
    node: NodeInfo;
    box: FocusBox;
    files: string[];
    boxEl?: HTMLDivElement;
    /** Clicking the Focus shows its source. */
    onOpenSource?: () => void;
    /** Hovering a ≡, △ or ◇: the Hints to list beside it (ADR 0009, 0011), or null when the pointer leaves. */
    onHints?: (hints: FocusHints | null, anchor: DOMRect | null) => void;
  }
  let { node, box, files, boxEl = $bindable(), onOpenSource, onHints }: Props = $props();

  const CODE = `12px ${FONT_CODE}`;
  /** An own component type or asset in an asset's box is drawn bold (.member.own). */
  const CODE_OWN = `600 ${CODE}`;
  const LINE = 18;
  const PAD = 12;
  /** Label, name and namespace; a hint line under them when there is one (ADR 0008). */
  const HEAD = 62;
  const HINT_LINE = 16;
  const lib = $derived(node.kind === "library");
  const asset = $derived(isAssetKind(node.kind));
  /** A scene's or prefab's component types, or a ScriptableObject asset's asset fields. */
  const items = $derived(box.asset?.items ?? []);
  const FOLD = 14;
  const tangleHint = $derived(node.tangle ? `⟲ Tangle of ${node.tangle}` : "");
  /** Members that are Duplicates (ADR 0009), hidden ones too. */
  const duplicates = $derived(box.duplicates ?? []);
  /** Classes it keeps despite their interface, and its members that are Type switches (ADR 0011). */
  const bypassed = $derived(box.bypassedInterfaces ?? []);
  const switches = $derived(box.typeSwitches ?? []);
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const SEP = " · ";
  const HINT_FONT = `11px ${FONT_UI}`;
  /** The hint line's parts: the Tangle (a title only), then one hover target per kind of Hint the Focus has. */
  const parts = $derived(
    [
      tangleHint && { text: tangleHint, hints: null, label: "" },
      duplicates.length && { text: `≡ ${count(duplicates.length, "Duplicate", "Duplicates")}`, hints: { duplicates }, label: "members whose bodies have the same shape as another member's" },
      bypassed.length && {
        text: `△ ${count(bypassed.length, "Bypassed interface", "Bypassed interfaces")}`,
        hints: { bypassed },
        label: "own classes it keeps in fields or properties although they implement an own interface",
      },
      switches.length && { text: `◇ ${count(switches.length, "Type switch", "Type switches")}`, hints: { switches }, label: "members testing two or more subtypes of one own base" },
    ].filter((p) => !!p) as { text: string; hints: FocusHints | null; label: string }[],
  );
  const hint = $derived(parts.map((p) => p.text).join(SEP));
  const HEADER = $derived(HEAD + (hint ? HINT_LINE : 0));
  /** Room for each of a member's ≡ △ ◇ tags. */
  const TAG = 16;

  const lineText = (m: FocusMember) => `${m.vis} ${m.event ? "«event» " : ""}${m.text}`;
  const width = $derived.by(() => {
    const natural = Math.max(
      textWidth(node.name, `600 15px ${FONT_UI}`),
      textWidth(node.namespace, `11px ${FONT_UI}`),
      textWidth(hint, `11px ${FONT_UI}`),
      ...[...box.attributes, ...box.operations].map((m) => textWidth(lineText(m), CODE) + (m.serialized ? 70 : 0) + tagsOf(m).length * TAG),
      ...items.map((i) => textWidth(i.text, i.own ? CODE_OWN : CODE)),
    );
    // round up: rounding down leaves the widest line a fraction of a pixel short, and fitText cuts it
    return Math.ceil(Math.min(Math.max(natural + PAD * 2, 260), 760));
  });
  const maxText = $derived(width - PAD * 2);

  const attrTop = $derived(HEADER);
  const opTop = $derived(attrTop + (box.attributes.length ? box.attributes.length * LINE + 10 : 10));
  const footTop = $derived(opTop + (box.operations.length ? box.operations.length * LINE + 10 : 10));
  const height = $derived(lib ? HEADER + 34 : asset ? HEADER + 10 + Math.max(1, items.length) * LINE + 4 : footTop + (box.hidden ? 24 : 4));
  const where = $derived(box.file >= 0 ? `${files[box.file]}:${box.line}` : "");

  // the hint line is centred as a whole; each part after the Tangle is a hover target of its own
  const hintLeft = $derived((width - textWidth(hint, HINT_FONT)) / 2);
  const partLeft = (i: number) => hintLeft + (i ? textWidth(parts.slice(0, i).map((p) => p.text).join(SEP) + SEP, HINT_FONT) : 0);

  function show(e: Event, hints: FocusHints) {
    onHints?.(hints, (e.currentTarget as Element).getBoundingClientRect());
  }
  const hide = () => onHints?.(null, null);
  /** A member's tags, right to left: what its ≡, △ and ◇ each list. */
  const tagsOf = (m: FocusMember): { glyph: string; hints: FocusHints; title: string }[] => {
    const tags: { glyph: string; hints: FocusHints; title: string }[] = [];
    if (m.duplicates) {
      const items = m.duplicates.map((i) => duplicates[i]);
      const title = items.map((d) => `${d.member}: the same shape as ${d.duplicates.length === 1 ? "1 other member" : `${d.duplicates.length} other members`}`).join("\n");
      tags.push({ glyph: "≡", hints: { duplicates: items }, title });
    }
    if (m.bypassed) {
      const items = m.bypassed.map((i) => bypassed[i]);
      tags.push({ glyph: "△", hints: { bypassed: items }, title: "Keeps a class that implements an own interface" });
    }
    if (m.typeSwitches) {
      const items = m.typeSwitches.map((i) => switches[i]);
      tags.push({ glyph: "◇", hints: { switches: items }, title: "Tests two or more subtypes of one own base" });
    }
    return tags;
  };
</script>

{#snippet tags(m: FocusMember, y: number)}
  {#each tagsOf(m) as tag, k (tag.glyph)}
    <text
      class="dup"
      x={width - PAD - (m.serialized ? 70 : 0) - k * TAG}
      {y}
      role="button"
      tabindex="0"
      aria-label="{tag.title}: {m.text}"
      onmouseenter={(e) => show(e, tag.hints)}
      onmouseleave={hide}
      onfocus={(e) => show(e, tag.hints)}
      onblur={hide}
      onclick={(e) => {
        e.stopPropagation();
        show(e, tag.hints);
      }}
      onkeydown={(e) => e.key === "Enter" && (e.stopPropagation(), show(e, tag.hints))}><title>{tag.title}</title>{tag.glyph}</text
    >
  {/each}
{/snippet}

<div
  class="focus"
  bind:this={boxEl}
  style:width="{width}px"
  title={lib ? node.full : asset ? `${node.full}\nClick for its outline` : `${node.full}\n${where}\n${box.assembly}\nClick for the source`}
  role="button"
  tabindex="0"
  onclick={() => onOpenSource?.()}
  onkeydown={(e) => e.key === "Enter" && onOpenSource?.()}
>
  <svg {width} {height} role="img" aria-label="Focus: {node.full}">
    <rect class="frame" class:lib x="0.5" y="0.5" width={width - 1} height={height - 1} rx={lib ? 22 : asset ? 0 : 3} />
    {#if asset}
      <path class="corner" d="M{width - FOLD},0 L{width},{FOLD} L{width},0 Z" />
      <path class="fold" d="M{width - FOLD - 0.5},0.5 V{FOLD} H{width - 0.5} M{width - FOLD - 0.5},0.5 L{width - 0.5},{FOLD}" />
    {/if}
    <text class="label" x={width / 2} y="18">«{node.label}»</text>
    <text class="name" class:abstract={node.abstract} x={width / 2} y="38">{fitText(node.name, `600 15px ${FONT_UI}`, maxText)}</text>
    <text class="ns" x={width / 2} y="53">{fitText(lib ? "foreign library" : node.namespace || "(global namespace)", `11px ${FONT_UI}`, maxText)}</text>
    {#each parts as part, i (part.text)}
      {@const sep = i < parts.length - 1 ? SEP : ""}
      {#if part.hints}
        {@const hints = part.hints}
        <text
          class="hint dups"
          x={partLeft(i)}
          y={HEAD + 6}
          role="button"
          tabindex="0"
          aria-label="{part.text}: {part.label}"
          onmouseenter={(e) => show(e, hints)}
          onmouseleave={hide}
          onfocus={(e) => show(e, hints)}
          onblur={hide}
          onclick={(e) => {
            e.stopPropagation();
            show(e, hints);
          }}
          onkeydown={(e) => e.key === "Enter" && (e.stopPropagation(), show(e, hints))}>{part.text}</text
        >
      {:else}
        <text class="hint" x={partLeft(i)} y={HEAD + 6}>
          <title>In a Tangle of {node.tangle}: nodes that can each reach every other through their Dependencies. ⟲ marks the neighbours on the shortest Cycles through this Focus.</title>
          {part.text}
        </text>
      {/if}
      {#if sep}<text class="hint" x={partLeft(i) + textWidth(part.text, HINT_FONT)} y={HEAD + 6} style="white-space: pre">{sep}</text>{/if}
    {/each}
    {#if lib}
      <text class="note" x={width / 2} y={HEADER + 18}>Only its Dependents are shown</text>
    {:else if asset}
      <line x1="0" x2={width} y1={HEADER} y2={HEADER} />
      {#each items as item, i (i)}
        <text class="member" class:own={item.own} x={PAD} y={HEADER + 5 + LINE * i + 13}>{fitText(item.text, item.own ? CODE_OWN : CODE, maxText)}</text>
      {/each}
      {#if !items.length}
        <text class="note" x={width / 2} y={HEADER + 22}>{node.kind === "asset" ? "No asset fields" : "No components"}</text>
      {/if}
    {:else}
      <line x1="0" x2={width} y1={attrTop} y2={attrTop} />
      {#each box.attributes as m, i (i)}
        {@const y = attrTop + 5 + LINE * i + 13}
        <text class="member" class:static={m.isStatic} class:abstract={m.isAbstract} x={PAD} {y}>{fitText(lineText(m), CODE, maxText - (m.serialized ? 70 : 0) - tagsOf(m).length * TAG)}</text>
        {#if m.serialized}<text class="tag" x={width - PAD} {y}>serialized</text>{/if}
        {@render tags(m, y)}
      {/each}
      <line x1="0" x2={width} y1={opTop} y2={opTop} />
      {#each box.operations as m, i (i)}
        {@const y = opTop + 5 + LINE * i + 13}
        <text class="member" class:static={m.isStatic} class:abstract={m.isAbstract} x={PAD} {y}>{fitText(lineText(m), CODE, maxText - tagsOf(m).length * TAG)}</text>
        {@render tags(m, y)}
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
  .hint {
    font-size: 11px;
    fill: var(--cycle);
  }
  .dups,
  .dup {
    cursor: help;
    outline: none;
  }
  .dups:hover,
  .dups:focus-visible {
    text-decoration: underline;
  }
  .dup {
    font-size: 12px;
    font-weight: 600;
    fill: var(--cycle);
    text-anchor: end;
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
  .member.own {
    font-weight: 600;
  }
  .corner {
    fill: var(--bg);
    stroke: var(--bg);
    stroke-width: 2;
  }
  .fold {
    fill: none;
    stroke: var(--box-stroke);
    stroke-width: 1.5;
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
