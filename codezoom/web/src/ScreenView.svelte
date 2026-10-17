<script lang="ts">
  import { onMount } from "svelte";
  import type { EdgeKind, NodeInfo, Screen } from "../../src/shared/types";
  import FocusBox from "./FocusBox.svelte";
  import Row from "./Row.svelte";
  import RefsPopover from "./RefsPopover.svelte";
  import { matchesName } from "../../src/shared/search";
  import { BOX_H, ROW_VPAD, layoutRow, orderRow, type Box } from "./layout";

  interface Props {
    screen: Screen;
    focus: NodeInfo;
    nodes: Map<string, NodeInfo>;
    files: string[];
    previousId: string | null;
    onDrill: (id: string) => void;
    onBack: () => void;
  }
  let { screen, focus, nodes, files, previousId, onDrill, onBack }: Props = $props();

  let dependentsFilter = $state("");
  let dependenciesFilter = $state("");
  let mainEl: HTMLDivElement | undefined = $state();
  let focusEl: HTMLDivElement | undefined = $state();
  let upperStrip: HTMLDivElement | undefined = $state();
  let lowerStrip: HTMLDivElement | undefined = $state();
  let layoutVersion = $state(0);

  const upper = $derived(
    layoutRow(
      orderRow(screen.dependents, previousId).filter((n) => matchesName(nodes.get(n.id)!, dependentsFilter)),
      nodes,
      previousId,
    ),
  );
  const lower = $derived(
    layoutRow(
      orderRow(screen.dependencies, previousId).filter((n) => matchesName(nodes.get(n.id)!, dependenciesFilter)),
      nodes,
      previousId,
    ),
  );

  // ---- hover: References behind one edge ----
  let hovered = $state.raw<{ box: Box; position: "above" | "below"; anchor: DOMRect } | null>(null);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  function hover(position: "above" | "below", box: Box | null, el: Element | null) {
    clearTimeout(hideTimer);
    if (box && el) hovered = { box, position, anchor: el.getBoundingClientRect() };
    else hideTimer = setTimeout(() => (hovered = null), 140);
  }

  function pick(box: Box) {
    if (box.previous) onBack();
    else onDrill(box.n.id);
  }

  // ---- edges: only to boxes in view ----
  interface EdgeGeom {
    key: string;
    id: string;
    kind: EdgeKind;
    d: string;
  }
  let frame = 0;
  function relayout() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      layoutVersion++;
    });
  }

  const edges = $derived.by((): EdgeGeom[] => {
    void layoutVersion;
    if (!mainEl || !focusEl) return [];
    const m = mainEl.getBoundingClientRect();
    const f = focusEl.getBoundingClientRect();
    const out: EdgeGeom[] = [];
    const add = (strip: HTMLDivElement | undefined, boxes: Box[], position: "above" | "below") => {
      if (!strip) return;
      const r = strip.getBoundingClientRect();
      const scroll = strip.scrollLeft;
      const inView = boxes.filter((b) => {
        const cx = b.x + b.w / 2 - scroll;
        return cx >= 0 && cx <= r.width;
      });
      const spread = Math.min(f.width - 24, inView.length * 28);
      inView.forEach((b, j) => {
        const bx = r.left - m.left + b.x + b.w / 2 - scroll;
        const fx = f.left - m.left + f.width / 2 - spread / 2 + (inView.length === 1 ? spread / 2 : (spread * j) / (inView.length - 1));
        let x1: number, y1: number, x2: number, y2: number;
        if (position === "above") {
          [x1, y1, x2, y2] = [bx, r.top - m.top + ROW_VPAD + BOX_H, fx, f.top - m.top];
        } else {
          [x1, y1, x2, y2] = [fx, f.bottom - m.top, bx, r.top - m.top + ROW_VPAD];
        }
        const ym = (y1 + y2) / 2;
        out.push({ key: `${position}:${b.n.id}`, id: b.n.id, kind: b.n.edge, d: `M${x1},${y1} C${x1},${ym} ${x2},${ym} ${x2},${y2}` });
      });
    };
    add(upperStrip, upper.boxes, "above");
    add(lowerStrip, lower.boxes, "below");
    return out;
  });

  $effect(() => {
    // filters change the boxes; the DOM updates first, then the edges
    void upper;
    void lower;
    relayout();
  });

  onMount(() => {
    layoutVersion++; // edges in the first frame, not the second
    const ro = new ResizeObserver(relayout);
    if (mainEl) ro.observe(mainEl);
    if (focusEl) ro.observe(focusEl);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  const hotKey = $derived(hovered ? `${hovered.position}:${hovered.box.n.id}` : null);
  const DASH: Record<EdgeKind, string | undefined> = { inherits: undefined, implements: "6 4", has: undefined, uses: "4 4" };
  const HEAD: Record<EdgeKind, string> = { inherits: "tri", implements: "tri", has: "arrow", uses: "arrow" };
</script>

<div class="screen" bind:this={mainEl}>
  <svg class="edges" aria-hidden="true">
    <defs>
      {#each ["", "-hot"] as v (v)}
        <marker id="tri{v}" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M1,1 L13,7 L1,13 z" class="head-tri{v}" />
        </marker>
        <marker id="arrow{v}" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="12" markerHeight="12" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M1,1 L13,7 L1,13" class="head-arrow{v}" />
        </marker>
      {/each}
    </defs>
    {#each edges as e (e.key)}
      {@const hot = e.key === hotKey}
      <path class="edge" class:hot d={e.d} stroke-dasharray={DASH[e.kind]} marker-end="url(#{HEAD[e.kind]}{hot ? '-hot' : ''})" />
    {/each}
  </svg>

  <Row
    title="Dependents"
    hint="depend on {focus.name}"
    total={screen.dependents.length}
    boxes={upper.boxes}
    width={upper.width}
    position="above"
    hoveredId={hovered?.position === "above" ? hovered.box.n.id : null}
    bind:filter={dependentsFilter}
    bind:stripEl={upperStrip}
    onScroll={relayout}
    onPick={pick}
    onHover={(b, el) => hover("above", b, el)}
  />

  <div class="middle">
    <FocusBox node={focus} box={screen.focus} {files} bind:boxEl={focusEl} />
    <div class="legend" aria-label="Edge kinds">
      <svg width="250" height="64">
        {#each [["inherits", "Inherits"], ["implements", "Implements"], ["has", "Has"], ["uses", "Uses"]] as [k, label], i (k)}
          {@const kind = k as EdgeKind}
          <path class="edge" d="M4,{10 + i * 15} H48" stroke-dasharray={DASH[kind]} marker-end="url(#{HEAD[kind]})" />
          <text x="58" y={14 + i * 15}>{label}</text>
        {/each}
      </svg>
    </div>
  </div>

  <Row
    title="Dependencies"
    hint="{focus.name} depends on"
    total={screen.dependencies.length}
    boxes={lower.boxes}
    width={lower.width}
    position="below"
    hoveredId={hovered?.position === "below" ? hovered.box.n.id : null}
    bind:filter={dependenciesFilter}
    bind:stripEl={lowerStrip}
    onScroll={relayout}
    onPick={pick}
    onHover={(b, el) => hover("below", b, el)}
  />
</div>

{#if hovered}
  <RefsPopover
    item={hovered.box.n}
    node={hovered.box.node}
    {focus}
    position={hovered.position}
    anchor={hovered.anchor}
    {files}
    onEnter={() => clearTimeout(hideTimer)}
    onLeave={() => hover(hovered!.position, null, null)}
  />
{/if}

<style>
  .screen {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }
  .edges {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .middle {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 56px 16px;
  }
  .legend {
    position: absolute;
    left: 16px;
    bottom: 8px;
    opacity: 0.8;
    pointer-events: none;
  }
  .legend text {
    font-size: 11px;
    fill: var(--muted);
  }
  :global(.edge) {
    fill: none;
    stroke: var(--edge);
    stroke-width: 1.2;
  }
  :global(.edge.hot) {
    stroke: var(--accent);
    stroke-width: 2;
  }
  :global(.head-tri) {
    fill: var(--bg);
    stroke: var(--edge);
    stroke-width: 1.2;
  }
  :global(.head-tri-hot) {
    fill: var(--bg);
    stroke: var(--accent);
    stroke-width: 1.6;
  }
  :global(.head-arrow) {
    fill: none;
    stroke: var(--edge);
    stroke-width: 1.2;
  }
  :global(.head-arrow-hot) {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.6;
  }
</style>
