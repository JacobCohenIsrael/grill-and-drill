<script lang="ts">
  import type { FocusBox, NodeInfo, RefWire } from "../../src/shared/types";
  import { loadSource, openInEditor, type Source } from "./api";

  interface Props {
    focus: NodeInfo;
    box: FocusBox;
    files: string[];
    editor: string | null;
    /** References of the hovered neighbour; those in the shown file are marked. */
    marks: RefWire[] | null;
    onClose: () => void;
  }
  let { focus, box, files, editor, marks, onClose }: Props = $props();

  const LINE_H = 18;
  const OVERSCAN = 30;

  let part = $state(0);
  let source = $state.raw<Source | null>(null);
  let failed = $state(false);
  let scroller: HTMLDivElement | undefined = $state();
  let scrollTop = $state(0);
  let viewport = $state(600);
  let status = $state("");

  const current = $derived(box.parts[part] ?? null);
  const marked = $derived(new Set((marks ?? []).filter(([, f]) => f === current?.file).map(([, , line]) => line)));
  const first = $derived(Math.max(0, Math.floor(scrollTop / LINE_H) - OVERSCAN));
  const last = $derived(Math.min(source?.lines.length ?? 0, Math.ceil((scrollTop + viewport) / LINE_H) + OVERSCAN));
  const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

  $effect(() => {
    const p = current;
    source = null;
    failed = false;
    if (!p) return;
    let live = true;
    loadSource(files[p.file]).then(
      (s) => {
        if (!live) return;
        source = s;
        // the declaration a quarter of the way down
        requestAnimationFrame(() => {
          if (scroller) scroller.scrollTop = Math.max(0, (p.line - 1) * LINE_H - scroller.clientHeight / 4);
        });
      },
      () => live && (failed = true),
    );
    return () => (live = false);
  });

  async function open(line: number) {
    if (!current || !editor) return;
    status = `Opening in ${editor}…`;
    const ok = await openInEditor(files[current.file], line);
    status = ok ? "" : `Could not open ${editor}`;
  }
</script>

<aside class="panel" aria-label="Source of {focus.full}">
  <header>
    <div class="title">
      <strong>{focus.name}</strong>
      {#if editor && current}
        <button class="open" onclick={() => open(current.line)} title="Open at line {current.line}">Open in {editor}</button>
      {/if}
      <button class="close" onclick={onClose} title="Close (Esc)" aria-label="Close source">×</button>
    </div>
    {#if box.parts.length > 1}
      <div class="tabs" role="tablist">
        {#each box.parts as p, i (i)}
          <button role="tab" aria-selected={i === part} class:active={i === part} title={files[p.file]} onclick={() => (part = i)}>
            {baseName(files[p.file])}
          </button>
        {/each}
      </div>
    {/if}
    {#if current}<div class="path">{files[current.file]}:{current.line}</div>{/if}
    {#if status}<div class="status">{status}</div>{/if}
  </header>

  {#if !current}
    <p class="note">A foreign library: its source is not read.</p>
  {:else if failed}
    <p class="note">Could not read {files[current.file]}.</p>
  {:else if !source}
    <p class="note">Loading…</p>
  {:else}
    <div class="body">
      <div
        class="code"
        bind:this={scroller}
        bind:clientHeight={viewport}
        onscroll={() => scroller && (scrollTop = scroller.scrollTop)}
      >
        <div class="sizer" style:height="{source.lines.length * LINE_H}px">
          {#each source.lines.slice(first, last) as html, k (first + k)}
            {@const n = first + k + 1}
            <div class="line" class:decl={n === current.line} class:mark={marked.has(n)} style:top="{(n - 1) * LINE_H}px">
              {#if editor}
                <button class="no" title="Open in {editor} at line {n}" onclick={() => open(n)}>{n}</button>
              {:else}
                <span class="no">{n}</span>
              {/if}
              <!-- built from escaped source text only (highlight.ts) -->
              <span class="src">{@html html}</span>
            </div>
          {/each}
        </div>
      </div>
      {#if marked.size}
        <div class="ticks" aria-hidden="true">
          {#each [...marked] as n (n)}
            <span style:top="{((n - 1) / source.lines.length) * 100}%"></span>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    width: min(48vw, 760px);
    min-height: 0;
    border-left: 1px solid var(--line);
    background: var(--panel);
  }
  header {
    padding: 8px 12px 6px;
    border-bottom: 1px solid var(--line);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .title strong {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button {
    border: 1px solid var(--line);
    background: var(--bg);
    border-radius: 5px;
    padding: 2px 8px;
    cursor: pointer;
  }
  button:hover {
    border-color: var(--accent);
  }
  .close {
    border: none;
    background: none;
    font-size: 18px;
    line-height: 1;
    color: var(--muted);
  }
  .tabs {
    display: flex;
    gap: 4px;
    margin-top: 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs button {
    font-size: 11px;
    white-space: nowrap;
  }
  .tabs button.active {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .path,
  .status {
    margin-top: 4px;
    font-size: 11px;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .note {
    padding: 16px;
    color: var(--muted);
  }
  .body {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .code {
    flex: 1;
    overflow: auto;
    font: 12px/18px var(--font-code);
  }
  .sizer {
    position: relative;
  }
  .line {
    position: absolute;
    left: 0;
    right: 0;
    height: 18px;
    display: flex;
    white-space: pre;
  }
  .line.decl {
    background: var(--accent-soft);
  }
  .line.mark {
    background: color-mix(in srgb, var(--cycle) 22%, transparent);
  }
  .no {
    flex: none;
    width: 52px;
    padding: 0 10px 0 0;
    border: none;
    border-radius: 0;
    background: none;
    text-align: right;
    color: var(--faint);
    font: inherit;
  }
  button.no:hover {
    color: var(--accent);
  }
  .src {
    padding-right: 16px;
  }
  .ticks {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 6px;
    pointer-events: none;
  }
  .ticks span {
    position: absolute;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--cycle);
  }
  .src :global(.kw) {
    color: #8a3ab9;
  }
  .src :global(.ty) {
    color: #1f6f8b;
  }
  .src :global(.str) {
    color: #a3511b;
  }
  .src :global(.num) {
    color: #2b7a3a;
  }
  .src :global(.com) {
    color: var(--faint);
    font-style: italic;
  }
  .src :global(.dir) {
    color: #7a6a1f;
  }
  @media (prefers-color-scheme: dark) {
    .src :global(.kw) {
      color: #c792ea;
    }
    .src :global(.ty) {
      color: #7fcde8;
    }
    .src :global(.str) {
      color: #e5a36b;
    }
    .src :global(.num) {
      color: #8fd18f;
    }
    .src :global(.dir) {
      color: #d6c26b;
    }
  }
</style>
