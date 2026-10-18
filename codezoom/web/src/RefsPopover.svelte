<script lang="ts">
  import { isAssetKind, type EdgeKind, type Neighbour, type NodeInfo } from "../../src/shared/types";

  interface Props {
    item: Neighbour;
    node: NodeInfo;
    focus: NodeInfo;
    position: "above" | "below";
    anchor: DOMRect;
    files: string[];
    onEnter: () => void;
    onLeave: () => void;
  }
  let { item, node, focus, position, anchor, files, onEnter, onLeave }: Props = $props();

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
</script>

<div class="pop" {style} role="tooltip" onmouseenter={onEnter} onmouseleave={onLeave}>
  <div class="head">
    <strong>{from.name}</strong>
    <span class="kind {item.edge}">{KIND[item.edge]}</span>
    <strong>{to.name}</strong>
  </div>
  <div class="sub">
    {node.full}
    {#if item.cycle}<span class="cycle">⟲ cycle: also in the other row</span>{/if}
  </div>
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
  .cycle {
    color: var(--cycle);
    margin-left: 8px;
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
