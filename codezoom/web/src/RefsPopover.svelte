<script lang="ts">
  import { isAssetKind, type CycleHop, type EdgeKind, type Neighbour, type NodeInfo } from "../../src/shared/types";

  interface Props {
    item: Neighbour;
    node: NodeInfo;
    focus: NodeInfo;
    /** Every node on the screen's index: Cycles pass through nodes that may not be on screen. */
    nodes: Map<string, NodeInfo>;
    position: "above" | "below";
    anchor: DOMRect;
    files: string[];
    onEnter: () => void;
    onLeave: () => void;
  }
  let { item, node, focus, nodes, position, anchor, files, onEnter, onLeave }: Props = $props();

  const KIND: Record<EdgeKind, string> = {
    inherits: "Inherits",
    implements: "Implements",
    has: "Has",
    uses: "Uses",
    "instance of": "Instance of",
    contains: "Contains",
    assigns: "Assigns",
    calls: "Calls",
  };
  const WIDTH = 440;

  const from = $derived(position === "above" ? node : focus);
  const to = $derived(position === "above" ? focus : node);
  const left = $derived(Math.max(8, Math.min(anchor.left, window.innerWidth - WIDTH - 8)));
  const style = $derived(
    position === "above"
      ? `left:${left}px; top:${anchor.bottom + 6}px; max-height:${Math.max(160, window.innerHeight - anchor.bottom - 24)}px`
      : `left:${left}px; bottom:${window.innerHeight - anchor.top + 6}px; max-height:${Math.max(160, anchor.top - 24)}px`,
  );
  const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
  /** An asset's References sit in GameObjects, not members. */
  const fromAsset = $derived(isAssetKind(from.kind));
  const unit = $derived(fromAsset ? (from.kind === "asset" ? "asset" : "GameObject") : "member");
  const nameOf = (id: string) => nodes.get(id)?.name ?? id;
  /** Where a hop's first Reference sits: a member, or for an asset the GameObject. */
  const sitsIn = (hop: CycleHop) => (isAssetKind(nodes.get(hop.from)?.kind ?? "class") ? `${nameOf(hop.from)}${hop.ref[0] ? ` > ${hop.ref[0]}` : ""}` : hop.ref[0]);
</script>

<div class="pop" {style} role="tooltip" onmouseenter={onEnter} onmouseleave={onLeave}>
  <div class="head">
    <strong>{from.name}</strong>
    <span class="kind {item.edge}">{KIND[item.edge]}</span>
    <strong>{to.name}</strong>
  </div>
  <div class="sub">{node.full}</div>
  {#each item.hints ?? [] as h, i (i)}
    {#if h.kind === "cycle"}
      <div class="hint">
        <div class="hint-head">⟲ On a shortest Cycle through {focus.name}</div>
        <ol>
          {#each h.hops as hop, j (j)}
            <li title="{files[hop.ref[1]]}:{hop.ref[2]}">
              <span class="hop">{nameOf(hop.from)} <span class="kind {hop.edge}">{KIND[hop.edge]}</span> {nameOf(hop.to)}</span>
              <span class="where">{sitsIn(hop)} · {baseName(files[hop.ref[1]])}:{hop.ref[2]}</span>
            </li>
          {/each}
        </ol>
      </div>
    {:else}
      <div class="hint">
        <div class="hint-head">≡ Holds a Duplicate of {focus.name}.{h.of}</div>
        <ol>
          <li title="{files[h.file]}:{h.line}">
            <span class="hop">{node.name}.{h.member}</span>
            <span class="where">same shape, {h.nodes} syntax nodes · {baseName(files[h.file])}:{h.line}</span>
          </li>
        </ol>
      </div>
    {/if}
  {/each}
  <div class="weight">
    Weight {item.weight}: {item.count} {item.count === 1 ? "Reference" : "References"} in {item.members}
    {item.members === 1 ? unit : `${unit}s`} of {from.name}
  </div>
  <ul>
    {#each item.refs as [member, file, line], i (i)}
      <li title="{files[file]}:{line}">
        <span class="member">{fromAsset ? `${from.name}${member ? ` > ${member}` : ""}` : member}</span>
        <span class="where">{baseName(files[file])}:{line}</span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .pop {
    position: fixed;
    z-index: 30;
    width: 440px;
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.18);
    padding: 10px 12px;
  }
  .head {
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .kind {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--accent-soft);
  }
  .sub {
    color: var(--muted);
    font-size: 11px;
    margin-top: 2px;
    overflow-wrap: anywhere;
  }
  .weight {
    margin-top: 6px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    margin-top: 8px;
    padding: 6px 8px;
    border-left: 2px solid var(--cycle);
    background: color-mix(in srgb, var(--cycle) 8%, transparent);
    border-radius: 0 4px 4px 0;
    font-size: 12px;
  }
  .hint-head {
    color: var(--cycle);
    font-weight: 600;
  }
  .hint ol {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
  }
  .hint li {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 2px 0;
    border: none;
  }
  .hint li + li {
    margin-top: 2px;
  }
  .hint .where {
    font: 11px var(--font-code);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  ul {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    font: 12px var(--font-code);
  }
  li {
    display: flex;
    gap: 12px;
    justify-content: space-between;
    padding: 2px 0;
    border-top: 1px solid var(--line);
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
