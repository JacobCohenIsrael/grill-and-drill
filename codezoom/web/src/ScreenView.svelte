<script lang="ts">
  import { onMount } from "svelte";
  import { isAssetKind, type EdgeKind, type Neighbour, type NodeInfo, type RefWire, type Screen } from "../../src/shared/types";
  import FocusBox from "./FocusBox.svelte";
  import Row from "./Row.svelte";
  import RefsPopover from "./RefsPopover.svelte";
  import { matchesName } from "../../src/shared/search";
  import { EDGE_WIDTH, ROW_VPAD, layoutRow, type Box, type RowLayout } from "./layout";

  interface Props {
    screen: Screen;
    focus: NodeInfo;
    nodes: Map<string, NodeInfo>;
    files: string[];
    previousId: string | null;
    onDrill: (id: string, box?: Element) => void;
    onBack: () => void;
    onOpenSource?: () => void;
    /** The References behind the hovered neighbour's edge, or null. */
    onHoverRefs?: (refs: RefWire[] | null) => void;
    /** False leaves Unity assets out of both rows ("Show assets"). */
    showAssets?: boolean;
  }
  let { screen, focus, nodes, files, previousId, onDrill, onBack, onOpenSource, onHoverRefs, showAssets = true }: Props = $props();

  // hidden assets leave the rows before they are sized, so the code boxes keep their own scale
  const visible = (row: Neighbour[]) => (showAssets ? row : row.filter((n) => !isAssetKind(nodes.get(n.id)?.kind ?? "class")));
  const dependents = $derived(visible(screen.dependents));
  const dependencies = $derived(visible(screen.dependencies));

  let dependentsFilter = $state("");
  let dependenciesFilter = $state("");
  let mainEl: HTMLDivElement | undefined = $state();
  let focusEl: HTMLDivElement | undefined = $state();
  let upperStrip: HTMLDivElement | undefined = $state();
  let lowerStrip: HTMLDivElement | undefined = $state();
  let layoutVersion = $state(0);

  const upper = $derived(layoutRow(dependents, "dependents", (n) => matchesName(nodes.get(n.id)!, dependentsFilter), nodes, previousId));
  const lower = $derived(layoutRow(dependencies, "dependencies", (n) => matchesName(nodes.get(n.id)!, dependenciesFilter), nodes, previousId));

  // ---- hover: References behind one edge ----
  let hovered = $state.raw<{ box: Box; position: "above" | "below"; anchor: DOMRect } | null>(null);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  function hover(position: "above" | "below", box: Box | null, el: Element | null) {
    clearTimeout(hideTimer);
    if (box && el) {
      hovered = { box, position, anchor: el.getBoundingClientRect() };
      onHoverRefs?.(box.n.refs);
    } else
      hideTimer = setTimeout(() => {
        hovered = null;
        onHoverRefs?.(null);
      }, 140);
  }

  function pick(box: Box, el: Element) {
    if (box.previous) onBack();
    else onDrill(box.n.id, el);
  }

  // ---- edges: only to boxes in view ----
  interface EdgeGeom {
    key: string;
    id: string;
    kind: EdgeKind;
    d: string;
    width: number;
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
    // in this screen's own coordinates: during a zoom the whole screen is scaled
    const outer = mainEl.getBoundingClientRect();
    const scale = mainEl.offsetWidth ? outer.width / mainEl.offsetWidth : 1;
    const local = (el: Element) => {
      const r = el.getBoundingClientRect();
      return new DOMRect(
        outer.left + (r.left - outer.left) / scale,
        outer.top + (r.top - outer.top) / scale,
        r.width / scale,
        r.height / scale,
      );
    };
    const m = local(mainEl);
    const f = local(focusEl);
    const out: EdgeGeom[] = [];
    /** Every box in view in one row, left to right, with where its edge starts. */
    const add = (strip: HTMLDivElement | undefined, row: RowLayout, position: "above" | "below") => {
      if (!strip?.isConnected) return;
      const r = local(strip);
      const scroll = strip.scrollLeft;
      const ends: { b: Box; bx: number }[] = [];
      for (const b of row.boxes) {
        const cx = b.x + b.w / 2 - scroll;
        if (cx < 0 || cx > r.width) continue; // edges only to boxes in view
        ends.push({ b, bx: r.left - m.left + cx });
      }
      // the side of the row facing the Focus, shared by its boxes
      const by = position === "above" ? r.top - m.top + ROW_VPAD + row.boxHeight : r.top - m.top + ROW_VPAD;
      const spread = Math.min(f.width - 24, ends.length * 28);
      ends.forEach(({ b, bx }, j) => {
        const fx = f.left - m.left + f.width / 2 - spread / 2 + (ends.length === 1 ? spread / 2 : (spread * j) / (ends.length - 1));
        const [x1, y1, x2, y2] = position === "above" ? [bx, by, fx, f.top - m.top] : [fx, f.bottom - m.top, bx, by];
        const ym = (y1 + y2) / 2;
        out.push({
          key: `${position}:${b.n.id}`,
          id: b.n.id,
          kind: b.n.edge,
          d: `M${x1},${y1} C${x1},${ym} ${x2},${ym} ${x2},${y2}`,
          width: EDGE_WIDTH[b.size],
        });
      });
    };
    add(upperStrip, upper, "above");
    add(lowerStrip, lower, "below");
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
  const DASH: Record<EdgeKind, string | undefined> = {
    inherits: undefined,
    implements: "6 4",
    has: undefined,
    uses: "4 4",
    "instance of": "2 3",
    contains: undefined,
    assigns: "8 3",
    calls: "2 3",
  };
  const HEAD: Record<EdgeKind, string> = {
    inherits: "tri",
    implements: "tri",
    has: "arrow",
    uses: "arrow",
    "instance of": "tri",
    contains: "arrow",
    assigns: "arrow",
    calls: "arrow",
  };
  /** Composition's filled diamond sits at the container: the asset the edge starts from. */
  const START: Partial<Record<EdgeKind, string>> = { contains: "diamond" };
  const KINDS: [EdgeKind, string][] = [
    ["inherits", "Inherits"],
    ["implements", "Implements"],
    ["has", "Has"],
    ["uses", "Uses"],
    ["instance of", "Instance of"],
    ["contains", "Contains"],
    ["assigns", "Assigns"],
    ["calls", "Calls"],
  ];
  // the legend names the kinds on this screen (all four of a type's when there are none)
  const legend = $derived.by(() => {
    const present = new Set([...dependents, ...dependencies].map((n) => n.edge));
    const shown = KINDS.filter(([k]) => present.has(k));
    return shown.length ? shown : KINDS.slice(0, 4);
  });
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
        <marker id="diamond{v}" viewBox="0 0 18 10" refX="1" refY="5" markerWidth="16" markerHeight="9" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M1,5 L9,1 L17,5 L9,9 z" class="head-diamond{v}" />
        </marker>
      {/each}
    </defs>
    {#each edges as e (e.key)}
      {@const hot = e.key === hotKey}
      <path
        class="edge"
        class:hot
        d={e.d}
        style:stroke-width={hot ? e.width + 0.8 : e.width}
        stroke-dasharray={DASH[e.kind]}
        marker-end="url(#{HEAD[e.kind]}{hot ? '-hot' : ''})"
        marker-start={START[e.kind] ? `url(#${START[e.kind]}${hot ? "-hot" : ""})` : undefined}
      />
    {/each}
  </svg>

  <Row
    title="Dependents"
    hint="depend on {focus.name}"
    total={dependents.length}
    layout={upper}
    position="above"
    hoveredId={hovered?.position === "above" ? hovered.box.n.id : null}
    bind:filter={dependentsFilter}
    bind:stripEl={upperStrip}
    onScroll={relayout}
    onPick={pick}
    onHover={(b, el) => hover("above", b, el)}
  />

  <div class="middle">
    <FocusBox node={focus} box={screen.focus} {files} bind:boxEl={focusEl} {onOpenSource} />
    <div class="legend" aria-label="Edge kinds">
      <svg width="250" height={legend.length * 15 + 4}>
        {#each legend as [kind, label], i (kind)}
          <path
            class="edge"
            d="M{START[kind] ? 14 : 4},{10 + i * 15} H48"
            stroke-dasharray={DASH[kind]}
            marker-end="url(#{HEAD[kind]})"
            marker-start={START[kind] ? `url(#${START[kind]})` : undefined}
          />
          <text x="58" y={14 + i * 15}>{label}</text>
        {/each}
      </svg>
    </div>
  </div>

  <Row
    title="Dependencies"
    hint="{focus.name} depends on"
    total={dependencies.length}
    layout={lower}
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
    flex: 1;
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
  :global(.head-diamond) {
    fill: var(--edge);
    stroke: var(--edge);
    stroke-width: 1;
  }
  :global(.head-diamond-hot) {
    fill: var(--accent);
    stroke: var(--accent);
    stroke-width: 1;
  }
</style>
